import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Deck } from "../../shared/deck.ts";
import { deckContext, usageOf } from "../src/claude.ts";
import { clampNote, noteRequest } from "../src/note.ts";
import { HttpError, sttToken } from "../src/token.ts";

const deck = JSON.parse(readFileSync("test/fixtures/demo/deck.json", "utf8")) as Deck;

describe("Schicht C", () => {
  it("Anfrage: Deck im Cache, Denken aus, JSON-Schema, nur die neuen Sätze im User-Teil", () => {
    const r = noteRequest(deck, "Profil", 7, [{ t: 0, text: "Schatten bei Licht von oben" }]);
    expect(r.model).toBe("claude-haiku-5-5");
    const sys = r.system as { text: string; cache_control?: unknown }[];
    expect(sys[0]!.text).toContain("Profil");
    expect(sys[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(r.thinking).toEqual({ type: "disabled" });
    expect(r.output_config?.format?.type).toBe("json_schema");
    expect(JSON.stringify(r.messages)).toContain("Schatten");
    expect(JSON.stringify(r.messages)).not.toContain("## Folie 1");
  });

  it("Deck-Kontext ist stabil (Prompt-Cache)", () => {
    expect(deckContext(deck)).toBe(deckContext(JSON.parse(JSON.stringify(deck)) as Deck));
  });

  it("begrenzt Notizen auf 25 Wörter und unbekannte Typen auf none", () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    expect(clampNote({ type: "note", text: long, confidence: 0.9 }).text.split(" ").length).toBe(26);
    expect(clampNote({ type: "rant", text: "x", confidence: 2 })).toEqual({ type: "none", text: "x", confidence: 1 });
    expect(clampNote(null).type).toBe("none");
  });

  it("berechnet Kosten mit Cache-Lesen", () => {
    const u = usageOf("claude-haiku-5-5", { input_tokens: 800, output_tokens: 120, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 0 } as never);
    // 800·0,10 + 20 000·0,01 + 120·0,50 = 340 → 0,00034 $
    expect(u.usd).toBeCloseTo(0.00034, 6);
  });
});

describe("STT-Token", () => {
  it("AssemblyAI: v1/token mit Produkt streaming", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ token: "tok", expires_in_seconds: 60 })));
    const r = await sttToken({ ASSEMBLYAI_API_KEY: "k" }, "assemblyai", f as unknown as typeof fetch);
    expect(r.token).toBe("tok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://token.assemblyai.com/v1/token");
    expect(JSON.parse(String(init.body))).toMatchObject({ product: "streaming", expires_in_seconds: 60 });
  });
  it("Deepgram: auth/grant", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "dg", expires_in: 30 })));
    expect((await sttToken({ DEEPGRAM_API_KEY: "k" }, "deepgram", f as unknown as typeof fetch)).token).toBe("dg");
  });
  it("ohne Schlüssel: 501", async () => {
    await expect(sttToken({}, "assemblyai")).rejects.toBeInstanceOf(HttpError);
  });
});
