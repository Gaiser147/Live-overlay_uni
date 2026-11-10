// Lokaler Ende-zu-Ende-Test: node proxy/test/e2e.mjs (erwartet wrangler dev auf :8790 und den Mock auf :8899)
import { readFileSync } from "node:fs";

const base = process.env.BASE ?? "http://127.0.0.1:8790";
const deck = JSON.parse(readFileSync(new URL("../../app/public/decks/demo/deck.json", import.meta.url)));
let fails = 0;
// Der Mock zählt alle Aufrufe seit seinem Start; nur die dieses Laufs prüfen.
const callsBefore = (await (await fetch("http://127.0.0.1:8899/calls")).json()).length;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

const h = await fetch(`${base}/health`);
check("health", h.ok);
check("token ohne Schlüssel → 401", (await fetch(`${base}/token`, { method: "POST", body: "{}" })).status === 401);
const tk = await fetch(`${base}/token`, { method: "POST", headers: { authorization: "Bearer app-test" }, body: JSON.stringify({ provider: "assemblyai" }) });
check("token ohne STT-Schlüssel → 501", tk.status === 501);
const put = await fetch(`${base}/decks/demo-e2e/deck.json`, { method: "PUT", headers: { authorization: "Bearer pi-test", "content-type": "application/json" }, body: JSON.stringify(deck) });
check("Deck hochladen (Pi)", put.ok);
check("Deck ohne Schlüssel → 401", (await fetch(`${base}/decks/demo-e2e/deck.json`)).status === 401);
const got = await fetch(`${base}/decks/demo-e2e/deck.json`, { headers: { authorization: "Bearer app-test" } });
check("Deck mit App-Schlüssel", got.ok && (await got.json()).slides.length === deck.slides.length);
const bad = await new Promise((res) => {
  const w = new WebSocket(`${base.replace("http", "ws")}/ws?session=x&key=nope`);
  w.onopen = () => res("open");
  w.onerror = () => res("refused");
});
check("WS mit falschem Schlüssel abgelehnt", bad === "refused");

const session = "demo_2026-11-10";
const ws = new WebSocket(`${base.replace("http", "ws")}/ws?session=${session}&key=app-test`);
const waiting = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  const key = m.id ?? m.t;
  waiting.get(key)?.(m);
};
const req = (msg, key = msg.id) => new Promise((res) => { waiting.set(key, res); ws.send(JSON.stringify(msg)); setTimeout(() => res(null), 15000); });
await new Promise((r) => (ws.onopen = r));
const ready = await req({ t: "hello", session, deck }, "ready");
check("hello → ready mit Deck", ready?.hasDeck === true);
const lines = [{ t: Date.now(), text: "Stellen Sie sich den Schatten vor, wenn das Licht genau von oben kommt." }];
const note = await req({ t: "note_req", id: "n1", n: 7, lines });
check("Live-Notiz (Schatten)", note?.result?.type === "note" && note.result.confidence >= 0.6, JSON.stringify(note?.result));
const none = await req({ t: "note_req", id: "n2", n: 7, lines: [{ t: Date.now(), text: "f von x y ist x null." }] });
check("Live-Notiz none", none?.result?.type === "none");
const more = await req({ t: "ask", id: "a1", kind: "more", n: 6, lines });
check("Genauer", typeof more?.text === "string" && more.text.length > 10);
const recap = await req({ t: "ask", id: "a2", kind: "recap", n: 7, lines });
check("Faden verloren: 3 Zeilen", recap?.text?.split("\n").length === 3);
const loc = await req({ t: "ask", id: "a3", kind: "locate", n: 3, lines });
check("Welche Folie? → 7", loc?.n === 7);
ws.send(JSON.stringify({ t: "log", at: Date.now(), event: { ev: "mark", kind: "question", n: 6 } }));
await new Promise((r) => setTimeout(r, 300));
ws.close();

const log = await (await fetch(`${base}/log/${session}`, { headers: { authorization: "Bearer pi-test" } })).text();
const evs = log.trim().split("\n").map((l) => JSON.parse(l).ev);
check("Protokoll enthält note, cost, answer, mark", ["note", "cost", "answer", "mark"].every((e) => evs.includes(e)), `${evs.length} Ereignisse`);
check("Protokoll ohne Transkripttext", !log.includes("Stellen Sie sich den Schatten"));

const calls = (await (await fetch("http://127.0.0.1:8899/calls")).json()).slice(callsBefore);
const haiku = calls.filter((c) => c.model === "claude-haiku-5-5");
const sonnet = calls.filter((c) => c.model === "claude-sonnet-5-5");
check("Haiku: Deck im Cache, Denken aus, JSON", haiku.length >= 2 && haiku.every((c) => c.system[1]?.cached && c.thinking?.type === "disabled" && c.format === "json_schema"));
check("Sonnet: Fallback-Beta gesetzt", sonnet.length === 2 && sonnet.every((c) => String(c.beta).includes("server-side-fallback-2026-07-01") && c.fallbacks === "default"));
process.exit(fails ? 1 : 0);
