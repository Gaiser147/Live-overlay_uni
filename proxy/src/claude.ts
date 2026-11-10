// Gemeinsames für Schicht C und D: Deck-Kontext (im Prompt-Cache), Kosten, Text aus der Antwort.
import type Anthropic from "@anthropic-ai/sdk";
import type { Deck, Slide } from "../../shared/deck.ts";
import type { TranscriptLine } from "../../shared/protocol.ts";

export const NOTE_MODEL = "claude-haiku-5-5";
export const ASK_MODEL = "claude-sonnet-5-5";

/** Preise je Mio. Token (Stand 11/2026, vor dem Bau prüfen). */
const PRICES: Record<string, { input: number; cacheRead: number; cacheWrite: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
};

export interface Usage {
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  usd: number;
}

export function usageOf(model: string, u: Anthropic.Usage | Anthropic.Beta.BetaUsage): Usage {
  const p = PRICES[model] ?? PRICES[ASK_MODEL]!;
  const inputTokens = u.input_tokens;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  const outputTokens = u.output_tokens;
  const usd = (inputTokens * p.input + cacheReadTokens * p.cacheRead + cacheWriteTokens * p.cacheWrite + outputTokens * p.output) / 1e6;
  return { model, inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens, usd };
}

function card(s: Slide): string {
  const parts = [`Karte: ${s.glance}`];
  if (s.example) parts.push(`Beispiel${s.example.invented ? " (ausgedacht)" : ""}: ${s.example.text}`);
  if (s.rule) parts.push(`Regel: ${s.rule}`);
  if (!s.exam_relevant) parts.push("Nicht klausurrelevant.");
  return parts.join(" | ");
}

/**
 * Der ganze Foliensatz als ein stabiler Textblock. Er ändert sich während der Vorlesung nicht
 * und liegt deshalb im Prompt-Cache; pro Aufruf kommen nur Folie und letzte Sätze neu dazu.
 */
export function deckContext(deck: Deck): string {
  const lines = [`Vorlesung: ${deck.title} (${deck.course}, ${deck.date})`, `Abschnitte: ${deck.sections.join(" · ")}`, ""];
  for (const s of deck.slides) {
    const text = (s.text ?? "").replace(/\s+/g, " ").slice(0, 700);
    lines.push(`## Folie ${s.n} [${s.section}] ${s.title} (${s.kind})`, card(s), text ? `Folientext: ${text}` : "", "");
  }
  return lines.join("\n");
}

export function slideHeader(deck: Deck, n: number): string {
  const s = deck.slides.find((x) => x.n === n);
  return s ? `Aktuelle Folie: ${s.n} – ${s.title} (Abschnitt ${s.section})\n${card(s)}` : `Aktuelle Folie: ${n}`;
}

export function transcript(lines: TranscriptLine[], max = 4000): string {
  const t = lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
  return t.length > max ? `…${t.slice(-max)}` : t || "(kein verwertbarer Ton)";
}

export function systemBlocks(prompt: string, profile: string, deck: Deck): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: prompt.replace("{{PROFILE}}", profile.trim() || "(kein Profil hinterlegt)") },
    { type: "text", text: deckContext(deck), cache_control: { type: "ephemeral" } },
  ];
}

export function firstText(content: readonly { type: string; text?: string }[]): string {
  for (const b of content) if (b.type === "text" && typeof b.text === "string") return b.text;
  return "";
}
