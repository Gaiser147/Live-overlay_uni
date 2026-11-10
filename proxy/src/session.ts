// Sitzungsobjekt je Vorlesung (Durable Object): WebSocket zur App, Schicht C/D, Protokoll als JSON-Zeilen.
// Transkripttext wird nicht gespeichert (das Archiv ist TwinMind) – nur Ereignisse und Notizen.
import Anthropic from "@anthropic-ai/sdk";
import { DurableObject } from "cloudflare:workers";
import type { Deck } from "../../shared/deck.ts";
import type { ClientMsg, LogEvent, ServerMsg } from "../../shared/protocol.ts";
import type { Usage } from "./claude.ts";
import type { Env } from "./env.ts";
import { liveNote } from "./note.ts";
import { ask } from "./ondemand.ts";

export class LectureSession extends DurableObject<Env> {
  private deck: Deck | null = null;
  private profile: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS log (at INTEGER NOT NULL, json TEXT NOT NULL)");
      this.deck = (await this.ctx.storage.get<Deck>("deck")) ?? null;
    });
  }

  private client(): Anthropic {
    return new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY, ...(this.env.ANTHROPIC_BASE_URL ? { baseURL: this.env.ANTHROPIC_BASE_URL } : {}) });
  }

  private async getProfile(): Promise<string> {
    if (this.profile !== null) return this.profile;
    this.profile = (await this.env.DECKS?.get("profile.md")) ?? "";
    return this.profile;
  }

  private log(at: number, event: LogEvent | Record<string, unknown>): void {
    this.ctx.storage.sql.exec("INSERT INTO log (at, json) VALUES (?, ?)", at, JSON.stringify(event));
  }

  private logUsage(u: Usage | null): void {
    if (!u) return;
    this.log(Date.now(), { ev: "cost", model: u.model, inputTokens: u.inputTokens, cacheReadTokens: u.cacheReadTokens, outputTokens: u.outputTokens, usd: Math.round(u.usd * 1e6) / 1e6 });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      // Hibernation: Das Objekt darf zwischen Nachrichten schlafen, die Verbindung bleibt.
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname.endsWith("/log")) {
      const rows = this.ctx.storage.sql.exec<{ at: number; json: string }>("SELECT at, json FROM log ORDER BY at").toArray();
      const body = rows.map((r) => JSON.stringify({ t: new Date(r.at).toISOString(), ...JSON.parse(r.json) })).join("\n");
      return new Response(body + (body ? "\n" : ""), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    }
    return new Response("not found", { status: 404 });
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* Verbindung inzwischen zu */
    }
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) as ClientMsg;
    } catch {
      return this.send(ws, { t: "error", message: "Ungültiges JSON" });
    }
    switch (msg.t) {
      case "ping":
        return this.send(ws, { t: "pong" });
      case "hello":
        if (msg.deck) {
          this.deck = msg.deck;
          await this.ctx.storage.put("deck", msg.deck);
        }
        this.log(Date.now(), { ev: "hello", session: msg.session });
        return this.send(ws, { t: "ready", session: msg.session, hasDeck: Boolean(this.deck) });
      case "log":
        return this.log(msg.at > 1e12 ? msg.at : Date.now(), msg.event);
      case "note_req": {
        if (!this.deck) return this.send(ws, { t: "error", id: msg.id, message: "Kein Deck" });
        const t0 = Date.now();
        const { result, usage } = await liveNote(this.client(), this.deck, await this.getProfile(), msg.n, msg.lines);
        const latencyMs = Date.now() - t0;
        this.logUsage(usage);
        // Notizen unter Konfidenz 0,6 zeigt die App nicht an; protokolliert wird alles.
        this.log(Date.now(), { ev: "note", type: result.type, text: result.text, confidence: result.confidence, n: msg.n, latencyMs });
        return this.send(ws, { t: "note", id: msg.id, result, latencyMs });
      }
      case "ask": {
        if (!this.deck) return this.send(ws, { t: "error", id: msg.id, message: "Kein Deck" });
        const t0 = Date.now();
        try {
          const out = await ask(this.client(), this.deck, await this.getProfile(), msg);
          this.logUsage(out.usage);
          this.log(Date.now(), { ev: "answer", kind: msg.kind, n: msg.n, text: out.text, located: out.n });
          return this.send(ws, { t: "answer", id: msg.id, kind: msg.kind, text: out.text, n: out.n, latencyMs: Date.now() - t0 });
        } catch (e) {
          console.warn("ask", e);
          return this.send(ws, { t: "error", id: msg.id, message: "Antwort fehlgeschlagen" });
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.log(Date.now(), { ev: "disconnect", code });
    try {
      ws.close(code, "bye");
    } catch {
      /* schon zu */
    }
  }
}
