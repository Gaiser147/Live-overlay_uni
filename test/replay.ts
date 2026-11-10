// Aufruf: node test/replay.ts --fixture test/fixtures/2026-11-10 [--strict] [--verbose]
// Erwartet im Fixture-Ordner: deck.json, transcript.txt, reference.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Deck } from "../shared/deck.ts";
import { fmt, parseTranscript, runReplay, score, type Reference } from "./replay-lib.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = opt("--fixture") ?? "test/fixtures/demo";
const strict = args.includes("--strict");
const verbose = args.includes("--verbose");

const deck = JSON.parse(readFileSync(join(dir, "deck.json"), "utf8")) as Deck;
const paras = parseTranscript(readFileSync(join(dir, "transcript.txt"), "utf8"));
const ref = JSON.parse(readFileSync(join(dir, "reference.json"), "utf8")) as Reference;

const res = runReplay(deck, paras, {}, ref.slides[0]?.n);
const sc = score(res, ref);

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const yes = (b: boolean | null) => (b === null ? "–" : b ? "ja" : "NEIN");
console.log(`Replay ${dir} (${paras.length} Absätze, ${deck.slides.length} Folien)`);
console.log(`  richtige Folie:            ${pct(sc.accuracy)} von ${sc.seconds} s   (Ziel ≥ 85 %)`);
console.log(`  … nur mit Ton (40 s):     ${pct(sc.accuracyHeard)}`);
console.log(`  mittlere Wechsel-Latenz:   ${(sc.meanLatencyMs / 1000).toFixed(1)} s   (Ziel < 5 s)`);
const missed = sc.latencies.filter((l) => l.ms === null);
console.log(`  verpasste Wechsel:         ${missed.length} von ${sc.latencies.length}${missed.length ? "  (" + missed.map((m) => `${m.at}→${m.to}`).join(", ") + ")" : ""}`);
console.log(`  Wechsel in Ruhefenstern:   ${sc.switchesInNoSwitch}   (Ziel 0)`);
console.log(`  Tafelmodus im Fenster:     ${yes(sc.boardHit)}`);
console.log(`  Klausurhinweis erkannt:    ${yes(sc.examHit)}`);
console.log(`  Live-Notiz angefragt:      ${sc.noteHits} von ${sc.noteWindows} Fenstern, ${sc.notesPerMinute.toFixed(2)} Anfragen/min`);
console.log(`  Ton unklar (verworfen):    ${res.unclear.length} Segmente`);

if (verbose) {
  console.log("\nWechsel:");
  for (const c of res.changes) console.log(`  ${fmt(c.t)}  ${c.from} → ${c.to}`);
  console.log("Zustände:");
  let last = "";
  for (const e of res.timeline) {
    if (e.state !== last) console.log(`  ${fmt(e.t)}  ${e.state} (Folie ${e.n})`);
    last = e.state;
  }
  for (const e of res.exams) console.log(`  Klausur ${fmt(e.t)}: ${e.phrase}${e.negative ? " (verneint)" : ""}`);
  for (const l of res.links) console.log(`  Verweis ${fmt(l.t)}: ${l.courses.join(", ")}`);
  for (const n of res.noteRequests) console.log(`  Notiz-Anfrage ${fmt(n.t)} (Folie ${n.n})`);
  for (const l of sc.latencies) console.log(`  Latenz ${l.at} → ${l.to}: ${l.ms === null ? "verpasst" : (l.ms / 1000).toFixed(0) + " s"}`);
}

if (strict) {
  const fail =
    sc.accuracy < 0.85 || !(sc.meanLatencyMs < 5000) || sc.switchesInNoSwitch > 0 || sc.boardHit === false;
  if (fail) {
    console.error("\nAbnahme Phase 2 nicht erfüllt.");
    process.exit(1);
  }
}
