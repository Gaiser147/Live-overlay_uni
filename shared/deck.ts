// Gemeinsames Datenformat für deck.json (erzeugt von prep/, gelesen von App, Proxy und Replay).

/** Rechteck relativ zur Folie: [x0, y0, x1, y1], jeweils 0–1. */
export type BBox = [number, number, number, number];

export type SlideKind =
  | "title"
  | "section"
  | "motivation"
  | "definition"
  | "theorem"
  | "example"
  | "task"
  | "remark"
  | "summary";

export interface CardExample {
  text: string;
  /** true = ausgedachtes Beispiel, nicht aus der Vorlesung. */
  invented: boolean;
}

export interface Highlight {
  bbox: BBox;
  label: string;
}

export interface TextBlock {
  bbox: BBox;
  text: string;
}

export interface Slide {
  n: number;
  section: string;
  title: string;
  kind: SlideKind;
  /** Höchstens 12 Wörter, lesbar in 2–3 s. */
  glance: string;
  example?: CardExample | null;
  rule?: string | null;
  /** Ausführliche Erklärung für den ?-Knopf, höchstens 80 Wörter. */
  more: string;
  next_hint?: string | null;
  exam_relevant: boolean;
  /** z. B. „Laut Folie nicht klausurrelevant“. */
  exam_note?: string | null;
  highlights: Highlight[];
  keywords: string[];
  links?: string[];
  /** Pfad zum PNG relativ zur deck.json. */
  image?: string;
  /** Bereinigter Folientext (ohne Kopf-/Fußzeile). */
  text?: string;
  /** Textblöcke mit Koordinaten (für S-Pen-Kreis und Markierungen). */
  blocks?: TextBlock[];
}

export interface Deck {
  version: 1;
  course: string;
  date: string;
  title: string;
  lecturers?: string[];
  sections: string[];
  slides: Slide[];
  keyterms?: string[];
  /** Seitenverhältnis Breite/Höhe der Folienbilder. */
  aspect?: number;
  /** Sichtbarer Bereich [oben, unten] als Anteil der Höhe (ohne Navigationsleiste und Fußzeile). */
  crop?: [number, number] | null;
  generated?: { by: "claude" | "heuristic" | "hand"; model?: string; at: string };
  /** true = erfundene Demo-Daten, keine echte Vorlesung. */
  synthetic?: boolean;
}

export const KIND_HEAD: Record<SlideKind, string> = {
  title: "Titel",
  section: "Abschnitt",
  motivation: "Worum es geht",
  definition: "Definition",
  theorem: "Satz",
  example: "Beispiel",
  task: "Aufgabe",
  remark: "Bemerkung",
  summary: "Zusammenfassung",
};

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export interface DeckProblem {
  n: number | null;
  problem: string;
}

/** Prüft die Regeln aus dem Plan (5.1): Wortgrenzen, Kennzeichnung, Aufgaben ohne Lösung. */
export function validateDeck(deck: Deck): DeckProblem[] {
  const out: DeckProblem[] = [];
  if (deck.version !== 1) out.push({ n: null, problem: "version muss 1 sein" });
  if (!deck.slides.length) out.push({ n: null, problem: "keine Folien" });
  const seen = new Set<number>();
  for (const s of deck.slides) {
    if (seen.has(s.n)) out.push({ n: s.n, problem: "Foliennummer doppelt" });
    seen.add(s.n);
    if (!deck.sections.includes(s.section)) out.push({ n: s.n, problem: `Abschnitt „${s.section}“ fehlt in sections` });
    if (wordCount(s.glance) > 12) out.push({ n: s.n, problem: `glance hat ${wordCount(s.glance)} Wörter (max. 12)` });
    if (s.example && wordCount(s.example.text) > 25)
      out.push({ n: s.n, problem: `example hat ${wordCount(s.example.text)} Wörter (max. 25)` });
    if (wordCount(s.more) > 80) out.push({ n: s.n, problem: `more hat ${wordCount(s.more)} Wörter (max. 80)` });
    for (const h of s.highlights) {
      if (h.bbox.length !== 4 || h.bbox.some((v) => v < 0 || v > 1) || h.bbox[0] >= h.bbox[2] || h.bbox[1] >= h.bbox[3])
        out.push({ n: s.n, problem: "bbox ungültig" });
    }
    if (s.kind === "task" && /\b(lösung|ergebnis)\s*(ist|lautet|:)/i.test(`${s.glance} ${s.rule ?? ""} ${s.example?.text ?? ""}`))
      out.push({ n: s.n, problem: "Aufgabe enthält offenbar eine Lösung" });
  }
  return out;
}

/** Abschnittsgrenzen für das Daumenregister. */
export function sectionSpans(deck: Deck): { name: string; first: number; last: number; count: number }[] {
  return deck.sections.map((name) => {
    const ns = deck.slides.filter((s) => s.section === name).map((s) => s.n);
    const first = ns.length ? Math.min(...ns) : 0;
    const last = ns.length ? Math.max(...ns) : 0;
    return { name, first, last, count: ns.length };
  });
}
