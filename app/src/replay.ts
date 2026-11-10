// Transkript-Wiedergabe: dieselbe Logik für den Demo-Modus der App und für test/replay.ts.
import type { Segment } from "./tracker.ts";

export interface Paragraph {
  /** ms seit Mitternacht (Uhrzeit aus dem Transkript). */
  start: number;
  text: string;
}

export function clock(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000;
}

/** TwinMind-Format: Absätze „HH:MM[:SS] Text“, durch Leerzeilen getrennt. */
export function parseTranscript(src: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const block of src.split(/\n\s*\n/)) {
    const m = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+([\s\S]*)$/.exec(block.trim());
    if (!m) continue;
    const t = m[1]!.length <= 5 ? `${m[1]}:00` : m[1]!;
    out.push({ start: clock(t), text: m[2]!.replace(/\s+/g, " ").trim() });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface SttEvent {
  /** Zustellzeit (gleiche Zeitachse wie die Wortzeiten). */
  at: number;
  seg: Segment;
}

/**
 * Simuliert einen Streaming-Dienst: Wörter gleichmäßig über die Absatzdauer verteilt,
 * Turns an Satzzeichen oder nach 14 Wörtern, Zwischenergebnisse alle 3 Wörter, feste Latenz.
 */
export function simulateStt(paras: Paragraph[], latencyMs = 300): SttEvent[] {
  const events: SttEvent[] = [];
  let turn = 0;
  paras.forEach((p, i) => {
    const next = paras[i + 1]?.start ?? p.start + 60_000;
    const dur = Math.min(60_000, Math.max(10_000, next - p.start)) * 0.95;
    const words = p.text.split(/\s+/).filter(Boolean);
    const step = dur / Math.max(1, words.length);
    let cur: { text: string; t: number }[] = [];
    const flush = (final: boolean) => {
      if (!cur.length) return;
      const last = cur[cur.length - 1]!;
      events.push({ at: last.t + latencyMs, seg: { id: `t${turn}`, final, words: cur.map((w) => ({ text: w.text, t: w.t })) } });
    };
    words.forEach((w, k) => {
      cur.push({ text: w, t: p.start + k * step });
      if (/[.?!]$/.test(w) || cur.length >= 14 || k === words.length - 1) {
        flush(true);
        cur = [];
        turn++;
      } else if (cur.length % 3 === 0) flush(false);
    });
  });
  return events.sort((a, b) => a.at - b.at);
}
