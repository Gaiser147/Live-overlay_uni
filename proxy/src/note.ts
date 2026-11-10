// Schicht C: Live-Notiz mit kleinem, schnellem Modell. „none" ist die erwünschte Standardantwort.
import type Anthropic from "@anthropic-ai/sdk";
import type { Deck } from "../../shared/deck.ts";
import type { NoteResult, TranscriptLine } from "../../shared/protocol.ts";
import NOTE_PROMPT from "../prompts/note.md";
import { firstText, NOTE_MODEL, slideHeader, systemBlocks, transcript, usageOf, type Usage } from "./claude.ts";

const NOTE_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["none", "note", "exam", "link", "offtopic"] },
    text: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["type", "text", "confidence"],
  additionalProperties: false,
} as const;

export const NOTE_TIMEOUT_MS = 6000;

export function noteRequest(deck: Deck, profile: string, n: number, lines: TranscriptLine[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: NOTE_MODEL,
    max_tokens: 400,
    system: systemBlocks(NOTE_PROMPT, profile, deck),
    messages: [{ role: "user", content: `${slideHeader(deck, n)}\n\nLetzte 60 Sekunden des Dozenten (Transkript):\n${transcript(lines)}` }],
    // Latenz zählt: Denken aus, niedrige Stufe, festes JSON-Format.
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: NOTE_SCHEMA } },
  };
}

export function clampNote(raw: unknown): NoteResult {
  const r = (raw ?? {}) as Partial<NoteResult>;
  const type = ["none", "note", "exam", "link", "offtopic"].includes(String(r.type)) ? (r.type as NoteResult["type"]) : "none";
  let text = typeof r.text === "string" ? r.text.trim() : "";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 25) text = `${words.slice(0, 25).join(" ")} …`;
  const confidence = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0;
  return { type: type === "none" || !text ? (type === "offtopic" ? "offtopic" : "none") : type, text, confidence };
}

export async function liveNote(
  client: Anthropic,
  deck: Deck,
  profile: string,
  n: number,
  lines: TranscriptLine[],
): Promise<{ result: NoteResult; usage: Usage | null }> {
  try {
    const res = await client.messages.create(noteRequest(deck, profile, n, lines), { timeout: NOTE_TIMEOUT_MS, maxRetries: 0 });
    const usage = usageOf(NOTE_MODEL, res.usage);
    if (res.stop_reason === "refusal") return { result: { type: "none", text: "", confidence: 0 }, usage };
    return { result: clampNote(JSON.parse(firstText(res.content) || "{}")), usage };
  } catch (e) {
    console.warn("liveNote", e);
    return { result: { type: "none", text: "", confidence: 0 }, usage: null };
  }
}
