import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDeck, type Deck } from "../../shared/deck.ts";
import { parseTranscript, runReplay, score, type Reference } from "../../test/replay-lib.ts";
import { NoteGate } from "./notegate.ts";
import { cologne, judgeQuality, levenshtein, normalize, similarity, stem } from "./text.ts";
import { SlideTracker, type Segment } from "./tracker.ts";

const demo = JSON.parse(readFileSync("test/fixtures/demo/deck.json", "utf8")) as Deck;

function seg(id: string, text: string, t0: number, final = true, extra: Partial<Segment> = {}): Segment {
  return { id, final, words: text.split(/\s+/).map((w, i) => ({ text: w, t: t0 + i * 350 })), ...extra };
}

describe("text", () => {
  it("normalisiert Umlaute und ß", () => {
    expect(normalize("Größe Übung")).toBe("groesse uebung");
  });
  it("stemmt nur harmlose Endungen", () => {
    expect(stem("abbildungen")).toBe("abbildung");
    expect(stem("matrizen")).toBe("matrix");
    expect(stem("kern")).toBe("kern");
  });
  it("Kölner Phonetik", () => {
    expect(cologne("Müller")).toBe(cologne("Mueller"));
    expect(cologne("Meier")).toBe(cologne("Mayer"));
  });
  it("Levenshtein mit Abbruch", () => {
    expect(levenshtein("kern", "kerne")).toBe(1);
    expect(levenshtein("abcdef", "uvwxyz", 2)).toBe(3);
  });
  it("erkennt Transkriptfehler bei Fachbegriffen", () => {
    const v = (term: string) => ({ term: stem(term), phon: cologne(stem(term)) });
    // „Nachhofketten" statt „Markov-Ketten": Kompositum endet auf den Begriff.
    expect(similarity(stem("nachhofketten"), cologne(stem("nachhofketten")), v("ketten"))).toBeGreaterThan(0);
    expect(similarity(stem("schlauchungen"), cologne(stem("schlauchungen")), v("stauchungen"))).toBeGreaterThan(0);
    expect(similarity(stem("kern"), cologne("kern"), v("kurs"))).toBe(0);
  });
  it("Qualitätsfilter verwirft Kauderwelsch und Englisch", () => {
    expect(judgeQuality("Øhm, rum, øhm, muddervogn eller").ok).toBe(false);
    expect(judgeQuality("One of the big things was the nearly").ok).toBe(false);
    expect(judgeQuality("Der Kern ist alles, was auf null abgebildet wird").ok).toBe(true);
    expect(judgeQuality("Kern ist wichtig", { confidence: 0.2 }).ok).toBe(false);
  });
});

describe("SlideTracker", () => {
  it("wechselt nach zwei Auswertungen zur passenden nächsten Folie", () => {
    const tr = new SlideTracker(demo);
    tr.locate(5);
    const t = 100_000;
    tr.push(seg("a", "Jetzt kommt der Kern. Der Kern von f ist die Menge aller Vektoren, die auf null abgebildet werden, ker f.", t));
    const u1 = tr.evaluate(t + 8000);
    const u2 = tr.evaluate(t + 10_000);
    expect(u1.changed || u2.changed).toBe(true);
    expect(tr.current).toBe(6);
  });

  it("bleibt bei Nebengespräch über andere Kurse stehen", () => {
    const tr = new SlideTracker(demo);
    tr.locate(6);
    const t = 200_000;
    tr.push(seg("b", "Das hatten Sie schon in Mathe eins und in Mamo und in GdP, wer hatte das schon?", t));
    const u = tr.evaluate(t + 6000);
    tr.evaluate(t + 8000);
    expect(tr.current).toBe(6);
    expect(u.flags.link?.courses).toContain("MaMo");
  });

  it("verwirft unbrauchbaren Ton und meldet ‚Ton unklar'", () => {
    const tr = new SlideTracker(demo);
    const t = 300_000;
    expect(tr.push(seg("c", "Øhm rum øhm muddervogn eller", t))).toBe(false);
    expect(tr.evaluate(t + 2000).flags.unclear).toBe(true);
  });

  it("erkennt Tafelmodus an Zeigewörtern", () => {
    const tr = new SlideTracker(demo);
    tr.locate(4);
    const t = 400_000;
    tr.push(seg("d", "Ich zeichne das mal hier an die Tafel. Das ist a, das hier ist b, und jetzt pack ich b hier dran, das Ding hier ist a plus b.", t));
    expect(tr.evaluate(t + 12_000).state).toBe("tafel");
  });

  it("Klausurhinweis, verneint und nicht verneint", () => {
    const tr = new SlideTracker(demo);
    const t = 500_000;
    tr.push(seg("e", "Das müssen Sie in der Klausur zeigen können.", t));
    expect(tr.evaluate(t + 4000).flags.exam).toMatchObject({ negative: false });
    const tr2 = new SlideTracker(demo);
    tr2.push(seg("f", "Den Beweis fragen wir in der Klausur nicht.", t));
    expect(tr2.evaluate(t + 4000).flags.exam).toMatchObject({ negative: true });
  });

  it("ein Zwischenergebnis löst keinen Klausurhinweis aus", () => {
    const tr = new SlideTracker(demo);
    const t = 600_000;
    tr.push(seg("g", "Den Beweis fragen wir in der Klausur", t, false));
    expect(tr.evaluate(t + 3000).flags.exam).toBeUndefined();
  });

  it("manuelles Blättern hält 60 s", () => {
    const tr = new SlideTracker(demo);
    const t = 700_000;
    tr.setManual(9, t);
    tr.push(seg("h", "Der Kern von f ist die Menge aller Vektoren, die auf null abgebildet werden.", t + 1000));
    tr.evaluate(t + 5000);
    tr.evaluate(t + 7000);
    expect(tr.current).toBe(9);
    expect(tr.state).toBe("manuell");
  });
});

describe("NoteGate", () => {
  it("fragt nur bei neuem Inhalt und höchstens alle 8 s", () => {
    const tr = new SlideTracker(demo);
    tr.locate(7);
    const gate = new NoteGate();
    expect(gate.shouldRequest(1000, "f von x y ist x null, das Lot auf die x-Achse.", tr)).toBe(false);
    expect(gate.shouldRequest(2000, "Stellen Sie sich eine Lampe genau senkrecht darüber vor, dann wirft der Pfeil diesen Schatten.", tr)).toBe(true);
    expect(gate.shouldRequest(5000, "Eine Taschenlampe im Hörsaal zeigt dasselbe Phänomen sehr anschaulich.", tr)).toBe(false);
  });
});

describe("Deck", () => {
  it("Demo-Deck ist gültig", () => {
    expect(validateDeck(demo)).toEqual([]);
  });
  it("findet zu lange Karten und Aufgaben mit Lösung", () => {
    const bad: Deck = JSON.parse(JSON.stringify(demo));
    bad.slides[0]!.glance = "eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn";
    bad.slides[7]!.rule = "Lösung: alle (0, y)";
    const probs = validateDeck(bad).map((p) => p.problem);
    expect(probs.some((p) => p.includes("glance"))).toBe(true);
    expect(probs.some((p) => p.includes("Lösung"))).toBe(true);
  });
});

describe("Replay (synthetische Demo-Vorlesung)", () => {
  it("bleibt über den Mindestwerten", () => {
    const paras = parseTranscript(readFileSync("test/fixtures/demo/transcript.txt", "utf8"));
    const ref = JSON.parse(readFileSync("test/fixtures/demo/reference.json", "utf8")) as Reference;
    const sc = score(runReplay(demo, paras, {}, 1), ref);
    // Regressionsschutz, keine Abnahme: Die echte Abnahme braucht Hörsaalton (siehe README).
    expect(sc.accuracy).toBeGreaterThan(0.75);
    expect(sc.switchesInNoSwitch).toBe(0);
    expect(sc.boardHit).toBe(true);
    expect(sc.examHit).toBe(true);
    expect(sc.latencies.every((l) => l.ms !== null)).toBe(true);
  });
});
