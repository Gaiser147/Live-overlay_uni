// Schicht D: auf Abruf. „?" (Genauer), „Faden verloren", S-Pen-Kreis, und „Welche Folie?".
import type Anthropic from "@anthropic-ai/sdk";
import type { Deck } from "../../shared/deck.ts";
import type { AskKind, TranscriptLine } from "../../shared/protocol.ts";
import ONDEMAND_PROMPT from "../prompts/ondemand.md";
import { ASK_MODEL, firstText, NOTE_MODEL, slideHeader, systemBlocks, transcript, usageOf, type Usage } from "./claude.ts";

export interface AskInput {
  kind: AskKind;
  n: number;
  lines: TranscriptLine[];
  block?: { text: string };
}

export interface AskOutput {
  text: string;
  n?: number;
  usage: Usage | null;
}

const TASK: Record<Exclude<AskKind, "locate">, (i: AskInput) => string> = {
  more: () =>
    "Der Student hat „Genauer“ gedrückt. Erkläre die aktuelle Folie neu, höchstens 60 Wörter, anders als die Karte, und knüpfe an das an, was der Dozent gerade gesagt hat. Ende mit einer kurzen Handlungsanweisung („Jetzt du: …“).",
  recap: () =>
    "Der Student hat den Faden verloren. Fasse die letzten 3 Minuten in genau 3 Punkten zusammen, je höchstens 15 Wörter, eine Zeile pro Punkt, ohne Aufzählungszeichen, in der Reihenfolge des Vortrags.",
  circle: (i) =>
    `Der Student hat mit dem Stift diese Stelle der Folie eingekreist:\n„${i.block?.text ?? ""}“\nErkläre genau diese Stelle, höchstens 40 Wörter.`,
};

const LOCATE_SCHEMA = {
  type: "object",
  properties: { n: { type: "integer" }, confidence: { type: "number" } },
  required: ["n", "confidence"],
  additionalProperties: false,
} as const;

export async function ask(client: Anthropic, deck: Deck, profile: string, input: AskInput): Promise<AskOutput> {
  const system = systemBlocks(ONDEMAND_PROMPT, profile, deck);
  const context = `${slideHeader(deck, input.n)}\n\nTranskript der letzten Minuten:\n${transcript(input.lines)}`;

  if (input.kind === "locate") {
    // Schicht B war 30 s unsicher: einmal fragen, welche Folie passt. Schnelles Modell genügt.
    const res = await client.messages.create(
      {
        model: NOTE_MODEL,
        max_tokens: 200,
        system,
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: { type: "json_schema", schema: LOCATE_SCHEMA } },
        messages: [{ role: "user", content: `${context}\n\nZu welcher Folie passen diese Sätze am besten? Antworte mit der Foliennummer und deiner Sicherheit (0–1).` }],
      },
      { timeout: 8000, maxRetries: 0 },
    );
    const usage = usageOf(NOTE_MODEL, res.usage);
    const j = JSON.parse(firstText(res.content) || "{}") as { n?: number; confidence?: number };
    const valid = typeof j.n === "number" && deck.slides.some((s) => s.n === j.n) && (j.confidence ?? 0) >= 0.6;
    return { text: "", n: valid ? j.n : undefined, usage };
  }

  const res = await client.beta.messages.create(
    {
      model: ASK_MODEL,
      max_tokens: 1500,
      system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `${context}\n\n${TASK[input.kind](input)}` }],
      // Bei einer Ablehnung durch die Sicherheitsfilter übernimmt automatisch ein anderes Modell.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: 20_000, maxRetries: 1 },
  );
  const usage = usageOf(ASK_MODEL, res.usage);
  if (res.stop_reason === "refusal") return { text: "", usage };
  return { text: firstText(res.content).trim(), usage };
}
