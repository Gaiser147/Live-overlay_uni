// Nachrichten zwischen Tablet-App und Cloud-Proxy (WebSocket, JSON).
import type { BBox, Deck } from "./deck.ts";

export type NoteType = "none" | "note" | "exam" | "link" | "offtopic";

export interface NoteResult {
  type: NoteType;
  text: string;
  confidence: number;
}

export type AskKind = "more" | "recap" | "circle" | "locate";

export interface TranscriptLine {
  /** Wanduhrzeit in ms (Date.now()). */
  t: number;
  text: string;
}

export type LogEvent =
  | { ev: "slide"; n: number; source: "tracker" | "manual" | "proxy"; score?: number }
  | { ev: "state"; state: string }
  | { ev: "mark"; kind: "question" | "lost" | "circle"; n: number }
  | { ev: "note"; type: NoteType; text: string; n: number; shown: boolean; latencyMs?: number }
  | { ev: "exam"; n: number; phrase: string }
  | { ev: "latency"; spokenToPartialMs?: number; partialToDisplayMs?: number }
  | { ev: "audio"; status: string }
  | { ev: "cost"; model: string; inputTokens: number; cacheReadTokens: number; outputTokens: number; usd: number };

export type ClientMsg =
  | { t: "hello"; session: string; deck?: Deck }
  | { t: "log"; at: number; event: LogEvent }
  | { t: "note_req"; id: string; n: number; lines: TranscriptLine[] }
  | { t: "ask"; id: string; kind: AskKind; n: number; lines: TranscriptLine[]; block?: { bbox: BBox; text: string } }
  | { t: "ping" };

export type ServerMsg =
  | { t: "ready"; session: string; hasDeck: boolean }
  | { t: "note"; id: string; result: NoteResult; latencyMs: number }
  | { t: "answer"; id: string; kind: AskKind; text: string; n?: number; latencyMs: number }
  | { t: "error"; id?: string; message: string }
  | { t: "pong" };

/** Sitzungsname: kurs_datum, z. B. „mathe-info-2_2026-11-10“. */
export function sessionName(course: string, date: string): string {
  return `${course}_${date}`.replace(/[^a-z0-9_-]/gi, "-");
}
