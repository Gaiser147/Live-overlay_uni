// Textwerkzeuge für den Folien-Tracker: Normalisierung, leichtes Stemming,
// Kölner Phonetik und unscharfer Abgleich gegen das Folienvokabular.

const UMLAUT: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Zerlegt in Kleinbuchstaben-Tokens; Bindestriche und Satzzeichen trennen. */
export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export const STOPWORDS = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines und oder aber auch als am an auf aus bei bis da dann " +
    "dass dazu denn doch du durch er es etwas fuer ganz gibt hab habe haben hat hier ich ihm ihn ihr ihnen im in " +
    "ist ja jetzt kann koennen man mal mit muss muessen nach nicht noch nur ob oben schon sehr sein sich sie sind " +
    "so soll sollen ueber um unter uns vom von vor war waere was weil wenn wer wie wieder wir wird wo zu zum zur " +
    "aeh aehm aem hm mhm oehm okay ok genau einfach also eben irgendwie sozusagen gut na nochmal mehr kommt gerade " +
    "dieser diese dieses diesem diesen jeder jede jedes alle alles man mein meine meinen meiner ihre unsere unser " +
    "tatsaechlich eigentlich bisschen ne nen mir mich dir dich kein keine keinen machen macht mache gemacht haben " +
    "the of and to is was"
  ).split(" "),
);

/** Leichter deutscher Stemmer – nur Endungen, die das Wort nicht entstellen. */
export function stem(t: string): string {
  if (t.length <= 4 || /^\d+$/.test(t)) return t;
  const special: Record<string, string> = { matrizen: "matrix", matrix: "matrix", indizes: "index" };
  if (special[t]) return special[t];
  for (const suf of ["ungen", "en", "er", "es", "e", "n", "s"]) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) {
      return suf === "ungen" ? t.slice(0, -suf.length) + "ung" : t.slice(0, -suf.length);
    }
  }
  return t;
}

/** Kölner Phonetik (für Transkriptfehler wie „Nachhofketten“ statt „Markov-Ketten“). */
export function cologne(word: string): string {
  const w = normalize(word).replace(/[^a-z]/g, "");
  if (!w) return "";
  const code: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    const prev = i > 0 ? w[i - 1]! : "";
    const next = i < w.length - 1 ? w[i + 1]! : "";
    let d = "";
    if ("aeijouy".includes(c)) d = "0";
    else if (c === "h") d = "";
    else if (c === "b") d = "1";
    else if (c === "p") d = next === "h" ? "3" : "1";
    else if (c === "d" || c === "t") d = "csz".includes(next) ? "8" : "2";
    else if (c === "f" || c === "v" || c === "w") d = "3";
    else if (c === "g" || c === "k" || c === "q") d = "4";
    else if (c === "c") {
      if (i === 0) d = "ahkloqrux".includes(next) ? "4" : "8";
      else d = "sz".includes(prev) ? "8" : "ahkoqux".includes(next) ? "4" : "8";
    } else if (c === "x") d = "ckq".includes(prev) ? "8" : "48";
    else if (c === "l") d = "5";
    else if (c === "m" || c === "n") d = "6";
    else if (c === "r") d = "7";
    else if (c === "s" || c === "z") d = "8";
    code.push(d);
  }
  // Doppelte zusammenfassen, dann Nullen (außer am Anfang) entfernen.
  let out = "";
  let last = "";
  for (const d of code.join("")) {
    if (d !== last) out += d;
    last = d;
  }
  return out[0] + out.slice(1).replace(/0/g, "");
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export interface VocabTerm {
  term: string; // gestemmt
  phon: string;
}

/**
 * Ähnlichkeit eines gesprochenen Tokens mit einem Vokabelbegriff (0–1).
 * 1 = gleich nach Stemming, 0.8 = fast gleich geschrieben, 0.6 = gleich klingend oder
 * Kompositum endet auf den Begriff, 0.45 = klingt ähnlich.
 */
export function similarity(spoken: string, spokenPhon: string, v: VocabTerm): number {
  const s = spoken;
  const t = v.term;
  if (s === t) return 1;
  if (/^\d+$/.test(s) || /^\d+$/.test(t)) return 0;
  const minLen = Math.min(s.length, t.length);
  if (minLen >= 5) {
    const maxEdits = Math.floor(Math.max(s.length, t.length) * 0.2);
    const d = levenshtein(s, t, maxEdits);
    if (d <= maxEdits) return 0.8;
  }
  if (s.length >= 9 && t.length >= 4 && s.endsWith(t)) return 0.6;
  if (minLen >= 4 && spokenPhon.length >= 3 && spokenPhon === v.phon) return 0.6;
  if (minLen >= 6 && spokenPhon.length >= 5 && v.phon.length >= 5 && levenshtein(spokenPhon, v.phon, 1) <= 1) return 0.45;
  return 0;
}

export function contentTokens(s: string): string[] {
  return tokenize(s).filter((t) => (t.length >= 3 || /^\d{2,}$/.test(t)) && !STOPWORDS.has(t));
}

/** Grobe Spracherkennung für den Qualitätsfilter. */
const DE_HINTS = new Set(
  "der die das und ist nicht ich wir sie ein eine mit auf wenn dann auch noch haben hat wird von zu den dem aeh aehm also".split(
    " ",
  ),
);
const EN_HINTS = new Set("the of and is was were this that with have has it to things nearly big one".split(" "));

export type QualityVerdict = { ok: true } | { ok: false; reason: "confidence" | "language" | "empty" };

export function judgeQuality(text: string, opts: { confidence?: number; lang?: string } = {}): QualityVerdict {
  if (opts.confidence !== undefined && opts.confidence < 0.45) return { ok: false, reason: "confidence" };
  if (opts.lang && opts.lang !== "de") return { ok: false, reason: "language" };
  if (/[øåæþð]/i.test(text)) return { ok: false, reason: "language" };
  const toks = tokenize(text);
  if (toks.length === 0) return { ok: false, reason: "empty" };
  let de = 0;
  let en = 0;
  for (const t of toks) {
    if (DE_HINTS.has(t)) de++;
    if (EN_HINTS.has(t)) en++;
  }
  if (toks.length >= 4 && en >= 2 && en > de) return { ok: false, reason: "language" };
  // Mindestens ein deutsches Inhaltswort (Länge ≥ 4, kein Füllwort).
  if (!toks.some((t) => t.length >= 4 && !STOPWORDS.has(t))) return { ok: false, reason: "empty" };
  return { ok: true };
}
