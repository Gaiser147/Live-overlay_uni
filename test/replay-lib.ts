// Spielt ein Vorlesungstranskript im Originaltempo durch Schicht B ab und misst gegen eine Referenz.
// Das Transkript hat das TwinMind-Format: Absätze mit „HH:MM Text“.
import type { Deck } from "../shared/deck.ts";
import { NoteGate } from "../app/src/notegate.ts";
import { SlideTracker, type TrackerOptions, type TrackerState } from "../app/src/tracker.ts";
import { clock, parseTranscript, simulateStt, type Paragraph } from "../app/src/replay.ts";

export { clock, parseTranscript, simulateStt, type Paragraph };

export function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}


export interface Reference {
  date: string;
  slides: { from: string; to: string; n: number }[];
  noSwitch?: [string, string][];
  board?: [string, string];
  exam?: [string, string];
  noteRequest?: [string, string][];
}

export interface ReplayResult {
  timeline: { t: number; n: number; state: TrackerState; heard: boolean }[];
  changes: { t: number; from: number; to: number }[];
  exams: { t: number; phrase: string; negative: boolean }[];
  links: { t: number; courses: string[] }[];
  noteRequests: { t: number; n: number }[];
  boardEnded: { t: number; n: number }[];
  unclear: number[];
  askLocate: number[];
}

export function runReplay(deck: Deck, paras: Paragraph[], opts: Partial<TrackerOptions> = {}, startSlide?: number): ReplayResult {
  const tracker = new SlideTracker(deck, opts);
  if (startSlide) tracker.locate(startSlide);
  const gate = new NoteGate();
  const events = simulateStt(paras);
  const res: ReplayResult = { timeline: [], changes: [], exams: [], links: [], noteRequests: [], boardEnded: [], unclear: [], askLocate: [] };
  if (!events.length) return res;
  const t0 = events[0]!.at;
  const t1 = events[events.length - 1]!.at + 30_000;
  let ei = 0;
  let nextEval = t0;
  for (let now = t0; now <= t1; now += 250) {
    while (ei < events.length && events[ei]!.at <= now) {
      const { seg } = events[ei]!;
      const ok = tracker.push(seg);
      if (!ok && seg.final) res.unclear.push(now);
      if (ok && seg.final) {
        const sentence = seg.words.map((w) => w.text).join(" ");
        if (gate.shouldRequest(now, sentence, tracker)) res.noteRequests.push({ t: now, n: tracker.current });
      }
      ei++;
    }
    if (now >= nextEval) {
      const before = tracker.current;
      const u = tracker.evaluate(now);
      if (u.changed) res.changes.push({ t: now, from: before, to: u.n });
      if (u.flags.exam) res.exams.push({ t: now, ...u.flags.exam });
      if (u.flags.link) res.links.push({ t: now, courses: u.flags.link.courses });
      if (u.flags.boardEnded) res.boardEnded.push({ t: now, n: u.flags.boardEnded });
      if (u.flags.askLocate) res.askLocate.push(now);
      res.timeline.push({ t: now, n: u.n, state: u.state, heard: tracker.recentText(now, 40_000).length > 0 });
      nextEval = now + 2000;
    }
  }
  return res;
}

export interface Score {
  accuracy: number;
  /** Nur Zeitpunkte, zu denen in den letzten 40 s überhaupt Text ankam. */
  accuracyHeard: number;
  seconds: number;
  meanLatencyMs: number;
  latencies: { at: string; to: number; ms: number | null }[];
  switchesInNoSwitch: number;
  boardHit: boolean | null;
  examHit: boolean | null;
  noteHits: number;
  noteWindows: number;
  notesPerMinute: number;
}

function stateAt(res: ReplayResult, t: number): ReplayResult["timeline"][number] | undefined {
  let lo = 0;
  let hi = res.timeline.length - 1;
  let found: (typeof res.timeline)[number] | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (res.timeline[mid]!.t <= t) {
      found = res.timeline[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function score(res: ReplayResult, ref: Reference): Score {
  let ok = 0;
  let total = 0;
  let okH = 0;
  let totalH = 0;
  for (const r of ref.slides) {
    for (let t = clock(r.from); t < clock(r.to); t += 1000) {
      const s = stateAt(res, t);
      if (!s) continue;
      total++;
      if (s.n === r.n) ok++;
      if (s.heard) {
        totalH++;
        if (s.n === r.n) okH++;
      }
    }
  }
  const latencies: Score["latencies"] = [];
  for (let i = 1; i < ref.slides.length; i++) {
    const r = ref.slides[i]!;
    const T = clock(r.from);
    const hit = res.timeline.find((e) => e.t >= T - 10_000 && e.n === r.n);
    latencies.push({ at: r.from, to: r.n, ms: hit && hit.t - T < 120_000 ? Math.max(0, hit.t - T) : null });
  }
  const found = latencies.filter((l) => l.ms !== null).map((l) => l.ms!);
  const inWin = (t: number, [a, b]: [string, string]) => t >= clock(a) && t <= clock(b);
  const switchesInNoSwitch = res.changes.filter((c) => (ref.noSwitch ?? []).some((w) => inWin(c.t, w))).length;
  const boardHit = ref.board ? res.timeline.some((e) => e.state === "tafel" && inWin(e.t, ref.board!)) : null;
  const examHit = ref.exam ? res.exams.some((e) => inWin(e.t, ref.exam!)) : null;
  const noteWindows = ref.noteRequest ?? [];
  const noteHits = noteWindows.filter((w) => res.noteRequests.some((n) => inWin(n.t, w))).length;
  const span = res.timeline.length ? (res.timeline.at(-1)!.t - res.timeline[0]!.t) / 60_000 : 1;
  return {
    accuracy: total ? ok / total : 0,
    accuracyHeard: totalH ? okH / totalH : 0,
    seconds: total,
    meanLatencyMs: found.length ? found.reduce((a, b) => a + b, 0) / found.length : NaN,
    latencies,
    switchesInNoSwitch,
    boardHit,
    examHit,
    noteHits,
    noteWindows: noteWindows.length,
    notesPerMinute: res.noteRequests.length / Math.max(1, span),
  };
}
