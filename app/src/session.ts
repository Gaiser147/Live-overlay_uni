// WebSocket zum Cloud-Proxy (Schicht C/D, Protokoll). Die App läuft ohne ihn weiter:
// Anfragen ohne Verbindung liefern sofort null, Protokoll-Ereignisse werden gepuffert.
import type { Deck } from "../../shared/deck.ts";
import type { AskKind, ClientMsg, LogEvent, NoteResult, ServerMsg, TranscriptLine } from "../../shared/protocol.ts";

type Pending = { resolve: (m: ServerMsg | null) => void; timer: number };

export class ProxySession {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private queue: ClientMsg[] = [];
  private retry = 0;
  private closed = false;
  private seq = 0;
  online = false;
  onStatus: (online: boolean) => void = () => {};

  private readonly url: string;
  private readonly key: string;
  private readonly session: string;
  private readonly deck: Deck;

  constructor(url: string, key: string, session: string, deck: Deck) {
    this.url = url;
    this.key = key;
    this.session = session;
    this.deck = deck;
  }

  connect(): void {
    if (!this.url) return;
    const u = new URL("/ws", this.url);
    u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
    u.searchParams.set("session", this.session);
    u.searchParams.set("key", this.key);
    const ws = new WebSocket(u);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.online = true;
      this.onStatus(true);
      this.raw({ t: "hello", session: this.session, deck: this.deck });
      for (const m of this.queue.splice(0)) this.raw(m);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      const id = "id" in msg ? msg.id : undefined;
      if (id && this.pending.has(id)) {
        const p = this.pending.get(id)!;
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.resolve(msg);
      }
    };
    ws.onclose = () => {
      this.online = false;
      this.onStatus(false);
      for (const [, p] of this.pending) p.resolve(null);
      this.pending.clear();
      if (!this.closed) {
        const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
        setTimeout(() => this.connect(), delay);
      }
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private raw(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  log(event: LogEvent, at = Date.now()): void {
    const m: ClientMsg = { t: "log", at, event };
    if (this.online) this.raw(m);
    else if (this.queue.length < 500) this.queue.push(m);
  }

  private request(m: ClientMsg & { id: string }, timeoutMs: number): Promise<ServerMsg | null> {
    if (!this.online) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(m.id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(m.id, { resolve, timer });
      this.raw(m);
    });
  }

  private id(): string {
    return `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
  }

  /** Schicht C. Antworten nach 6 s zählen nicht mehr (Plan 5.5). */
  async note(n: number, lines: TranscriptLine[]): Promise<{ result: NoteResult; latencyMs: number } | null> {
    const r = await this.request({ t: "note_req", id: this.id(), n, lines }, 6000);
    return r && r.t === "note" ? { result: r.result, latencyMs: r.latencyMs } : null;
  }

  /** Schicht D. */
  async ask(kind: AskKind, n: number, lines: TranscriptLine[], block?: { bbox: [number, number, number, number]; text: string }): Promise<{ text: string; n?: number } | null> {
    const r = await this.request({ t: "ask", id: this.id(), kind, n, lines, block }, 20_000);
    return r && r.t === "answer" ? { text: r.text, n: r.n } : null;
  }
}
