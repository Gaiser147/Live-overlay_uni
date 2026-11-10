// Schicht B: Folien-Tracker, Stichwort-Erkennung, Tafelmodus, Qualitätsfilter.
// Läuft komplett lokal ohne Sprachmodell. Eingabe: Transkript-Segmente mit Wortzeiten.
import type { Deck, Slide } from "../../shared/deck.ts";
import { cologne, contentTokens, judgeQuality, similarity, stem, STOPWORDS, tokenize, type VocabTerm } from "./text.ts";

export type TrackerState = "folgt" | "unsicher" | "tafel" | "manuell";

export interface Word {
  text: string;
  /** Wanduhrzeit des gesprochenen Worts in ms. */
  t: number;
  confidence?: number;
}

export interface Segment {
  /** Gleiche id = gleicher Turn; ein späteres Segment ersetzt das frühere. */
  id: string;
  words: Word[];
  final: boolean;
  confidence?: number;
  lang?: string;
  /** Empfangszeit (für Latenzmessung). */
  receivedAt?: number;
}

export interface TrackerFlags {
  exam?: { phrase: string; negative: boolean };
  link?: { courses: string[]; phrase: string };
  /** Gefallene Glossarbegriffe, die auf der aktuellen Folie stehen. */
  termHits: string[];
  /** 30 s unsicher: einmal Schicht C fragen. */
  askLocate?: boolean;
  /** Tafelmodus beendet; Zeichnung gehörte zu dieser Folie. */
  boardEnded?: number;
  /** Ton unklar (Segment verworfen). */
  unclear?: boolean;
}

export interface TrackerUpdate {
  n: number;
  changed: boolean;
  state: TrackerState;
  score: number;
  /** Abstand zwischen bester und zweitbester Folie. */
  margin: number;
  flags: TrackerFlags;
  scores: Map<number, number>;
}

export interface TrackerOptions {
  windowMs: number;
  /** Mindestscore, sonst „unsicher“. */
  minScore: number;
  /** Nötige aufeinanderfolgende Auswertungen vor einem Wechsel. */
  confirmEvals: number;
  /** Score für Sprünge über mehr als 3 Folien. */
  jumpScore: number;
  manualHoldMs: number;
  unsureAskMs: number;
  boardOn: number;
  boardOff: number;
  /** Zeitkonstante für das Abklingen alter Wörter. */
  recencyMs: number;
}

export const DEFAULTS: TrackerOptions = {
  windowMs: 20_000,
  minScore: 2.2,
  confirmEvals: 2,
  jumpScore: 9,
  manualHoldMs: 60_000,
  unsureAskMs: 30_000,
  boardOn: 0.12,
  boardOff: 0.06,
  recencyMs: 7000,
};

interface SlideTerm {
  term: string;
  weight: number;
}

const DEICTIC = new Set(
  "hier da dort dran drauf drueber rueber ding linie linien pfeil strich lineal zeichne zeichnen zeichnung male malen pack packe schreib schreibe schreiben gucken guck schauen schaut sehen".split(
    " ",
  ),
);
const FORMULA = new Set("a b c f g h u v w x y z plus minus mal gleich lambda alpha beta".split(" "));

const EXAM_PATTERNS: [RegExp, string][] = [
  [/\bklausur\w*/, "Klausur"],
  [/\bpruefung\w*/, "Prüfung"],
  [/\bmuessen (sie|ihr|du )?\w{0,12} ?zeigen\b/, "müssen Sie zeigen"],
  [/\bkommt (dran|in der klausur|garantiert)\b/, "kommt dran"],
  [/\bfragen wir\b/, "fragen wir"],
  [/\bsollten sie (koennen|wissen)\b/, "sollten Sie können"],
  [/\bganz wichtig\b|\bsehr wichtig\b|\bdas ist wichtig\b/, "wichtig"],
];

const COURSES: [RegExp, string][] = [
  [/\bmathe (1|eins|i)\b|\bmathematik fuer informatik (1|i)\b/, "Mathe I"],
  [/\bmamo\b|\bmaschinenmodelle\b/, "MaMo"],
  [/\bgdp\b|\bgrundlagen der programmierung\b/, "GdP"],
  [/\bin der schule\b/, "Schule"],
  [/\bletzte woche\b|\bletzten vorlesung\b|\bhaben wir schon\b/, "frühere Vorlesung"],
];

export class SlideTracker {
  readonly deck: Deck;
  readonly opts: TrackerOptions;
  private slideTerms = new Map<number, SlideTerm[]>();
  private slideNorm = new Map<number, number>();
  private vocab: VocabTerm[] = [];
  private matchCache = new Map<string, { term: string; sim: number }[]>();
  private segments = new Map<string, Segment>();
  private order: string[] = [];

  current: number;
  state: TrackerState = "folgt";
  private pending: { n: number; count: number } | null = null;
  private manualUntil = 0;
  private unsureSince: number | null = null;
  private askedLocate = false;
  private boardLowCount = 0;
  private boardSlide = 0;
  lastWordAt = 0;
  unclearUntil = 0;
  private lastExamAt = 0;
  private lastLinkAt = 0;
  private termShownAt = new Map<string, number>();

  constructor(deck: Deck, opts: Partial<TrackerOptions> = {}) {
    this.deck = deck;
    this.opts = { ...DEFAULTS, ...opts };
    this.current = deck.slides[0]?.n ?? 1;
    this.buildIndex();
  }

  private buildIndex(): void {
    const df = new Map<string, number>();
    const perSlide = new Map<number, Map<string, number>>();
    for (const s of this.deck.slides) {
      const boost = new Map<string, number>();
      const add = (txt: string, b: number) => {
        for (const tok of contentTokens(txt)) {
          const st = stem(tok);
          if (st.length < 3 && !/^\d+$/.test(st)) continue;
          boost.set(st, Math.max(boost.get(st) ?? 0, b));
        }
      };
      add(s.text ?? "", 1);
      add(s.title, 1.3);
      for (const k of s.keywords) add(k, 1.6);
      perSlide.set(s.n, boost);
      for (const st of boost.keys()) df.set(st, (df.get(st) ?? 0) + 1);
    }
    const N = this.deck.slides.length;
    for (const [n, boost] of perSlide) {
      const terms: SlideTerm[] = [];
      for (const [term, b] of boost) {
        // Seltene Begriffe zählen deutlich mehr (idf^1,5); sehr häufige kaum.
        const idf = Math.log(1 + N / (df.get(term) ?? 1)) ** 1.5;
        const common = (df.get(term) ?? 0) > N * 0.5 ? 0.3 : 1;
        terms.push({ term, weight: idf * b * common });
      }
      this.slideTerms.set(n, terms);
    }
    // Längennormierung (wie BM25): textreiche Folien sammeln sonst automatisch mehr Treffer.
    const lens = [...this.slideTerms.values()].map((ts) => ts.reduce((a, t) => a + t.weight, 0));
    const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length) || 1;
    for (const [n, ts] of this.slideTerms) {
      const len = ts.reduce((a, t) => a + t.weight, 0);
      this.slideNorm.set(n, 0.6 + 0.4 * (len / avg));
    }
    this.vocab = [...df.keys()].map((term) => ({ term, phon: cologne(term) }));
  }

  /** Vokabular-Treffer für ein gesprochenes Token (gecacht). */
  private matches(tok: string): { term: string; sim: number }[] {
    const cached = this.matchCache.get(tok);
    if (cached) return cached;
    const st = stem(tok);
    const phon = cologne(st);
    const out: { term: string; sim: number }[] = [];
    for (const v of this.vocab) {
      const sim = similarity(st, phon, v);
      if (sim > 0) out.push({ term: v.term, sim });
    }
    out.sort((a, b) => b.sim - a.sim);
    const top = out.slice(0, 4);
    this.matchCache.set(tok, top);
    return top;
  }

  /** Nimmt ein Segment auf. Gibt false zurück, wenn der Qualitätsfilter es verwirft. */
  push(seg: Segment): boolean {
    const text = seg.words.map((w) => w.text).join(" ");
    const verdict = judgeQuality(text, { confidence: seg.confidence, lang: seg.lang });
    if (!verdict.ok) {
      if (seg.final) {
        this.segments.delete(seg.id);
        const last = seg.words.at(-1)?.t ?? Date.now();
        this.unclearUntil = last + 10_000;
      }
      return false;
    }
    if (!this.segments.has(seg.id)) this.order.push(seg.id);
    this.segments.set(seg.id, seg);
    const last = seg.words.at(-1);
    if (last && last.t > this.lastWordAt) this.lastWordAt = last.t;
    return true;
  }

  private windowWords(now: number, ms: number, finalOnly = false): Word[] {
    const from = now - ms;
    const out: Word[] = [];
    for (const id of this.order) {
      const seg = this.segments.get(id);
      if (!seg || (finalOnly && !seg.final)) continue;
      for (const w of seg.words) if (w.t >= from && w.t <= now) out.push(w);
    }
    // Alte Segmente aufräumen.
    while (this.order.length > 400) {
      const id = this.order.shift()!;
      this.segments.delete(id);
    }
    return out;
  }

  /** Letzte Sätze als Text (für Schicht C/D). */
  recentText(now: number, ms: number): string {
    return this.windowWords(now, ms)
      .map((w) => w.text)
      .join(" ");
  }

  setManual(n: number, now: number): void {
    this.current = n;
    this.state = "manuell";
    this.manualUntil = now + this.opts.manualHoldMs;
    this.pending = null;
  }

  follow(): void {
    this.manualUntil = 0;
    this.state = "folgt";
  }

  /** Setzt die Position hart (z. B. Antwort von Schicht C auf „Welche Folie?“). */
  locate(n: number): void {
    this.current = n;
    this.pending = null;
    this.unsureSince = null;
    if (this.state !== "manuell") this.state = "folgt";
  }

  isPause(now: number, ms = 1200): boolean {
    return now - this.lastWordAt >= ms;
  }

  slide(n = this.current): Slide | undefined {
    return this.deck.slides.find((s) => s.n === n);
  }

  evaluate(now: number): TrackerUpdate {
    const o = this.opts;
    const flags: TrackerFlags = { termHits: [] };
    if (now < this.unclearUntil) flags.unclear = true;

    // Bei dünnem Transkript (Pausen, Tafel) das Fenster bis auf 40 s verlängern.
    let words = this.windowWords(now, o.windowMs);
    if (contentTokens(words.map((w) => w.text).join(" ")).length < 15) words = this.windowWords(now, o.windowMs * 2);
    const raw = words.map((w) => w.text).join(" ");
    const allToks = tokenize(raw);

    // Stichwörter: Klausur, Verweise. Nur fertige Sätze (ein Zwischenergebnis „fragen wir in der
    // Klausur" kann noch mit „nicht" enden) aus den letzten 12 s, damit nichts doppelt feuert.
    const recent = tokenize(this.windowWords(now, 12_000, true).map((w) => w.text).join(" ")).join(" ");
    if (now - this.lastExamAt > 20_000) {
      for (const [re, label] of EXAM_PATTERNS) {
        const m = re.exec(recent);
        if (m) {
          const around = recent.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
          flags.exam = { phrase: label, negative: /\bnicht\b|\bkein\w*\b/.test(around) };
          this.lastExamAt = now;
          break;
        }
      }
    }
    let linkHit = false;
    const courses: string[] = [];
    for (const [re, label] of COURSES) if (re.test(recent)) courses.push(label);
    if (courses.length) {
      linkHit = true;
      if (now - this.lastLinkAt > 30_000) {
        flags.link = { courses, phrase: courses.join(", ") };
        this.lastLinkAt = now;
      }
    }

    // Folien-Scores.
    // Neuere Wörter zählen deutlich mehr (Halbwertszeit ~5 s), damit ein Folienwechsel
    // nicht warten muss, bis die Wörter der alten Folie aus dem Fenster gefallen sind.
    const recency = (t: number) => Math.exp(-(now - t) / o.recencyMs);
    const termEvidence = new Map<string, { sim: number; count: number; rec: number }>();
    for (const w of words) {
      const rec = recency(w.t);
      for (const tok of contentTokens(w.text)) {
        for (const m of this.matches(tok)) {
          const e = termEvidence.get(m.term);
          const v = m.sim * rec;
          if (!e) termEvidence.set(m.term, { sim: v, count: 1, rec });
          else {
            e.sim = Math.max(e.sim, v);
            e.count++;
          }
        }
      }
    }
    const scores = new Map<number, number>();
    for (const s of this.deck.slides) {
      let sc = 0;
      for (const st of this.slideTerms.get(s.n) ?? []) {
        const e = termEvidence.get(st.term);
        if (e) sc += st.weight * e.sim * (1 + 0.25 * Math.min(e.count - 1, 3));
      }
      scores.set(s.n, sc / (this.slideNorm.get(s.n) ?? 1));
    }

    // Tafel: Zeigewörter („hier“, „das Ding“, „pack das dran“) auf den letzten 12 s.
    // Gesprochene Formeln allein reichen nicht – die liest der Prof auch von der Folie vor.
    const contentCount = allToks.filter((t) => !STOPWORDS.has(t) || DEICTIC.has(t)).length;
    const boardToks = tokenize(this.windowWords(now, 12_000).map((w) => w.text).join(" "));
    let deictic = 0;
    let formula = 0;
    for (const t of boardToks) {
      if (DEICTIC.has(t)) deictic++;
      else if (FORMULA.has(t)) formula++;
    }
    const boardRatio = boardToks.length >= 12 && deictic >= 3 ? (deictic + 0.25 * formula) / boardToks.length : 0;

    // Bewegungsmodell.
    const cur = this.current;
    const prior = (n: number) => {
      const d = n - cur;
      if (d === 0) return 0;
      if (d === 1) return Math.log(0.55);
      if (d === 2) return Math.log(0.3);
      if (d === 3) return Math.log(0.15);
      if (d === -1) return Math.log(0.15);
      if (d === -2) return Math.log(0.06);
      return d > 0 ? Math.log(0.03) : Math.log(0.015);
    };
    let best = cur;
    let bestPost = -Infinity;
    let bestScore = 0;
    let second = 0;
    for (const [n, sc] of scores) {
      if (sc > bestScore) {
        second = bestScore;
        bestScore = sc;
      } else if (sc > second) second = sc;
      const post = sc + prior(n);
      if (post > bestPost) {
        bestPost = post;
        best = n;
      }
    }
    const curScore = scores.get(cur) ?? 0;
    const margin = bestScore - second;

    let changed = false;
    const manual = this.state === "manuell" && now < this.manualUntil;
    if (this.state === "manuell" && !manual) this.state = "folgt";

    // Tafelmodus an/aus.
    if (!manual) {
      if (this.state === "tafel") {
        if (boardRatio < o.boardOff) this.boardLowCount++;
        else this.boardLowCount = 0;
        // Spricht der Prof eindeutig über eine andere Folie, ist die Zeichnung vorbei.
        const elsewhere = best !== cur && (scores.get(best) ?? 0) >= o.minScore * 2.5 && (scores.get(best) ?? 0) > curScore * 2;
        if (this.boardLowCount >= 2 || elsewhere) {
          this.state = "folgt";
          flags.boardEnded = this.boardSlide;
          this.boardLowCount = 0;
        }
      } else if (boardRatio >= o.boardOn || (boardRatio >= o.boardOn * 0.75 && bestScore < o.minScore)) {
        this.state = "tafel";
        this.boardSlide = cur;
        this.boardLowCount = 0;
        this.pending = null;
      }
    }

    const suppress = manual || this.state === "tafel" || (linkHit && bestScore < o.minScore * 2);
    if (!suppress && best !== cur) {
      const d = best - cur;
      const jump = Math.abs(d) > 3;
      const back = d < 0;
      const far = d >= 3 || back;
      const bs = scores.get(best)!;
      // Zurück nur bei klarer Evidenz: Profs blättern selten zurück, und frühere Folien
      // (Definitionen) teilen viele Begriffe mit den folgenden Beispielen.
      const strongEnough = jump ? bs >= o.jumpScore : back ? bs >= o.minScore * 2 : bs >= o.minScore;
      const beatsCurrent = back ? bs > curScore * 1.8 + 1.5 : bs > curScore * 1.05 + 0.3;
      if (strongEnough && beatsCurrent) {
        if (this.pending && this.pending.n === best) this.pending.count++;
        else this.pending = { n: best, count: 1 };
        const veryStrong = !far && bs >= o.minScore * 2.5 && bs > curScore * 2;
        const need = far ? o.confirmEvals + 1 : o.confirmEvals;
        if (this.pending.count >= need || veryStrong) {
          this.current = best;
          this.pending = null;
          changed = true;
        }
      } else if (this.pending && this.pending.n !== best) this.pending = null;
      // Liegt der Kandidat weiter vorn, aber knapp unter der Schwelle, bleibt die Zählung stehen.
    } else if (best === cur) this.pending = null;

    // Unsicherheit.
    if (!manual && this.state !== "tafel") {
      const sure = (scores.get(this.current) ?? 0) >= o.minScore * 0.6 || bestScore >= o.minScore;
      if (contentCount >= 6 && !sure) {
        this.state = "unsicher";
        this.unsureSince ??= now;
        if (!this.askedLocate && now - this.unsureSince >= o.unsureAskMs) {
          flags.askLocate = true;
          this.askedLocate = true;
        }
      } else if (this.state === "unsicher" && sure) {
        this.state = "folgt";
        this.unsureSince = null;
        this.askedLocate = false;
      }
    }

    // Glossarbegriffe der aktuellen Folie, die gerade gefallen sind (letzte 4 s).
    const slideTermSet = new Set((this.slideTerms.get(this.current) ?? []).map((t) => t.term));
    for (const w of this.windowWords(now, 4000)) {
      for (const tok of contentTokens(w.text)) {
        const st = stem(tok);
        if (slideTermSet.has(st) && st.length >= 4 && now - (this.termShownAt.get(st) ?? 0) > 15_000) {
          flags.termHits.push(st);
          this.termShownAt.set(st, now);
        }
      }
    }

    return {
      n: this.current,
      changed,
      state: this.state,
      score: scores.get(this.current) ?? 0,
      margin,
      flags,
      scores,
    };
  }

  /** Anteil der Inhaltswörter im Text, die nicht auf Folie/Karte stehen (Vorfilter für Schicht C). */
  novelty(text: string, n = this.current): { ratio: number; count: number } {
    const s = this.slide(n);
    if (!s) return { ratio: 0, count: 0 };
    const known = new Set(
      contentTokens([s.text ?? "", s.title, s.glance, s.example?.text ?? "", s.rule ?? "", s.more, ...s.keywords].join(" ")).map(stem),
    );
    const toks = contentTokens(text).map(stem);
    if (!toks.length) return { ratio: 0, count: 0 };
    const fresh = toks.filter((t) => !known.has(t)).length;
    return { ratio: fresh / toks.length, count: toks.length };
  }
}
