// Streaming-Transkription direkt vom Tablet (WebSocket). Der Schlüssel kommt als
// Kurzzeit-Token vom Cloud-Proxy, nie fest in der App.
import type { Segment } from "./tracker.ts";
import { parseTranscript, simulateStt } from "./replay.ts";

export interface SttCallbacks {
  onSegment(seg: Segment): void;
  onStatus(status: "connecting" | "open" | "closed" | "error", detail?: string): void;
}

export interface SttClient {
  start(cb: SttCallbacks): Promise<void>;
  /** Eigene Zeitachse (nur Wiedergabe); sonst gilt Date.now(). */
  now?(): number;
  /** PCM16, 16 kHz, mono. */
  send(pcm: Int16Array): void;
  stop(): void;
}

export interface TokenSource {
  (provider: "assemblyai" | "deepgram"): Promise<string>;
}

/** Holt ein Kurzzeit-Token beim Proxy. */
export function proxyTokenSource(proxyUrl: string, key: string): TokenSource {
  return async (provider) => {
    const res = await fetch(new URL("/token", proxyUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ provider }),
    });
    if (!res.ok) throw new Error(`Token: HTTP ${res.status}`);
    const j = (await res.json()) as { token: string };
    return j.token;
  };
}

// ------------------------------------------------------------------ AssemblyAI

interface AaiWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  word_is_final: boolean;
}

interface AaiTurn {
  type: "Turn";
  turn_order: number;
  end_of_turn: boolean;
  transcript: string;
  words: AaiWord[];
  language_code?: string;
  language_confidence?: number;
}

export class AssemblyAI implements SttClient {
  private ws: WebSocket | null = null;
  private t0 = 0;
  private readonly token: TokenSource;
  private readonly keyterms: string[];
  private readonly model: string;

  constructor(token: TokenSource, keyterms: string[], model = "universal-streaming-multilingual") {
    this.token = token;
    this.keyterms = keyterms;
    this.model = model;
  }

  async start(cb: SttCallbacks): Promise<void> {
    cb.onStatus("connecting");
    const token = await this.token("assemblyai");
    const q = new URLSearchParams({
      sample_rate: "16000",
      encoding: "pcm_s16le",
      speech_model: this.model,
      language_detection: "true",
      format_turns: "false",
      token,
    });
    // Fachbegriffe aus dem Handout (max. 100). Ob das Modell sie nutzt, steht in „Begin.configuration“.
    if (this.keyterms.length) q.set("keyterms_prompt", JSON.stringify(this.keyterms.slice(0, 100)));
    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${q}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.t0 = Date.now();
      cb.onStatus("open");
    };
    ws.onclose = (e) => cb.onStatus("closed", e.reason);
    ws.onerror = () => cb.onStatus("error");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Partial<Omit<AaiTurn, "type">> & { type: string; configuration?: unknown };
      if (msg.type === "Begin") console.info("[stt] AssemblyAI Begin", msg.configuration);
      if (msg.type !== "Turn" || !msg.words) return;
      const words = msg.words.map((w) => ({ text: w.text, t: this.t0 + w.start, confidence: w.confidence }));
      const conf = words.length ? words.reduce((a, w) => a + (w.confidence ?? 1), 0) / words.length : undefined;
      cb.onSegment({
        id: `a${msg.turn_order}`,
        words,
        final: Boolean(msg.end_of_turn),
        confidence: conf,
        lang: msg.language_code || undefined,
        receivedAt: Date.now(),
      });
    };
  }

  send(pcm: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm.buffer as ArrayBuffer);
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "Terminate" }));
    this.ws?.close();
    this.ws = null;
  }
}

// ------------------------------------------------------------------ Deepgram

interface DgResults {
  type: "Results";
  is_final: boolean;
  speech_final: boolean;
  start: number;
  duration: number;
  channel: { alternatives: { transcript: string; confidence: number; words: { word: string; start: number; end: number; confidence: number }[] }[] };
}

export class Deepgram implements SttClient {
  private ws: WebSocket | null = null;
  private t0 = 0;
  private readonly token: TokenSource;
  private readonly keyterms: string[];

  constructor(token: TokenSource, keyterms: string[]) {
    this.token = token;
    this.keyterms = keyterms;
  }

  async start(cb: SttCallbacks): Promise<void> {
    cb.onStatus("connecting");
    const token = await this.token("deepgram");
    const q = new URLSearchParams({
      model: "nova-3",
      language: "de",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      endpointing: "300",
      utterance_end_ms: "1000",
    });
    for (const k of this.keyterms.slice(0, 100)) q.append("keyterm", k);
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, ["bearer", token]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.t0 = Date.now();
      cb.onStatus("open");
    };
    ws.onclose = (e) => cb.onStatus("closed", e.reason);
    ws.onerror = () => cb.onStatus("error");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as DgResults;
      if (msg.type !== "Results") return;
      const alt = msg.channel.alternatives[0];
      if (!alt || !alt.words.length) return;
      cb.onSegment({
        id: `d${Math.round(msg.start * 1000)}`,
        words: alt.words.map((w) => ({ text: w.word, t: this.t0 + w.start * 1000, confidence: w.confidence })),
        final: msg.is_final,
        confidence: alt.confidence,
        receivedAt: Date.now(),
      });
    };
  }

  send(pcm: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm.buffer as ArrayBuffer);
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "CloseStream" }));
    this.ws?.close();
    this.ws = null;
  }
}

// ------------------------------------------------------------------ Wiedergabe (Demo)

/** Spielt ein Transkript (TwinMind-Format) in Echtzeit oder beschleunigt ab. Kein Mikrofon nötig. */
export class ReplaySTT implements SttClient {
  private timers: number[] = [];
  private readonly url: string;
  private readonly speed: number;

  constructor(url: string, speed = 1) {
    this.url = url;
    this.speed = speed;
  }

  private t0 = 0;
  private wall0 = 0;

  /** Virtuelle Uhr: Transkriptzeit, beschleunigt um speed. */
  now(): number {
    return this.wall0 ? this.t0 + (Date.now() - this.wall0) * this.speed : Date.now();
  }

  async start(cb: SttCallbacks): Promise<void> {
    cb.onStatus("connecting");
    const res = await fetch(this.url);
    if (!res.ok) {
      cb.onStatus("error", `Transkript fehlt (${res.status})`);
      return;
    }
    const events = simulateStt(parseTranscript(await res.text()));
    if (!events.length) return;
    // Erst ab dem ersten Wort abspielen, nicht ab dem Zustellzeitpunkt.
    this.t0 = events[0]!.seg.words[0]?.t ?? events[0]!.at;
    this.wall0 = Date.now();
    cb.onStatus("open");
    for (const e of events) {
      const delay = (e.at - this.t0) / this.speed;
      this.timers.push(window.setTimeout(() => cb.onSegment({ ...e.seg, receivedAt: this.now() }), delay));
    }
    this.timers.push(window.setTimeout(() => cb.onStatus("closed", "Ende der Wiedergabe"), (events.at(-1)!.at - this.t0) / this.speed + 2000));
  }

  send(): void {}

  stop(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}
