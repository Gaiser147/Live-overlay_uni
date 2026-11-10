// Steuerung: Transkript → Schicht B (Tracker) → Anzeige, dazu Schicht C/D über den Proxy.
// Grundsatz: Alles funktioniert ohne Server-Antwort weiter.
import { sectionSpans, type Slide } from "../../shared/deck.ts";
import { sessionName, type TranscriptLine } from "../../shared/protocol.ts";
import { BrowserMic, NativeAudio, type AudioSource } from "./audio.ts";
import type { Settings } from "./config.ts";
import type { LoadedDeck } from "./deck.ts";
import { NoteGate } from "./notegate.ts";
import { ProxySession } from "./session.ts";
import { AssemblyAI, Deepgram, proxyTokenSource, ReplaySTT, type SttClient } from "./stt.ts";
import { SlideTracker, type Segment, type TrackerUpdate } from "./tracker.ts";
import { h, icon } from "./ui/dom.ts";
import { Margin, type Recap } from "./ui/margin.ts";
import { Register } from "./ui/register.ts";
import { SlideView } from "./ui/slide.ts";

const FRESH_MS = 8000;

const EXAM_TEXT: Record<string, string> = {
  "müssen Sie zeigen": "„Das müssen Sie zeigen können.“ Typische Klausuraufgabe.",
  "kommt dran": "Der Prof sagt: Das kommt dran.",
  "fragen wir": "Der Prof sagt, dass das gefragt wird.",
  "sollten Sie können": "„Das sollten Sie können.“",
  wichtig: "Der Prof nennt das wichtig.",
  Klausur: "Der Prof spricht über die Klausur. Merk dir diese Stelle.",
  Prüfung: "Der Prof spricht über die Prüfung. Merk dir diese Stelle.",
};
const MAX_CARD_DELAY_MS = 4000;

export class Controller {
  readonly root: HTMLElement;
  private readonly d: LoadedDeck;
  private readonly settings: Settings;
  private readonly tracker: SlideTracker;
  private readonly gate = new NoteGate();
  private register: Register;
  private slideView: SlideView;
  private margin: Margin;
  private nextEl: HTMLElement;
  private askBtn: HTMLButtonElement;
  private lostBtn: HTMLButtonElement;
  private toastEl: HTMLElement;

  private shown = 0;
  private pendingShow: { n: number; since: number } | null = null;
  private history: { n: number; t: number }[] = [];
  private lines: TranscriptLine[] = [];
  private finals = new Set<string>();
  private proxy: ProxySession | null = null;
  private stt: SttClient | null = null;
  private audio: AudioSource | null = null;
  private loop = 0;
  private freshTimer = 0;
  private listening = false;
  private wakeLock: WakeLockSentinel | null = null;
  private lastSegmentAt = 0;
  private lastTermAt = 0;
  private readonly onSettings: () => void;

  constructor(d: LoadedDeck, settings: Settings, onSettings: () => void) {
    this.d = d;
    this.settings = settings;
    this.onSettings = onSettings;
    this.tracker = new SlideTracker(d.deck);
    document.body.dataset.slideLook = settings.slideLook;

    this.register = new Register(d.deck, {
      onSection: (n) => this.manual(n),
      onSettings: () => this.onSettings(),
      onMic: () => void (this.listening ? this.stopListening() : this.startListening()),
      onFollow: () => {
        this.tracker.follow();
        this.setState("folgt");
      },
    });
    this.slideView = new SlideView(d, {
      onSwipe: (dir) => this.manual(this.shown + dir),
      onCircle: (_bbox, blocks) => this.circle(blocks.map((b) => b.text).join("\n")),
    });
    this.margin = new Margin();
    this.nextEl = h("p", { class: "next" });
    this.askBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false", onclick: () => this.toggleMore() });
    this.askBtn.append(...this.btnContent("ask", "Genauer"));
    this.lostBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false", onclick: () => this.toggleRecap() });
    this.lostBtn.append(...this.btnContent("lost", "Faden verloren"));
    this.toastEl = h("div", { class: "toast", role: "status" });

    this.root = h(
      "div",
      { class: "app" },
      this.register.el,
      h("main", { class: "stage" }, this.slideView.el, this.margin.el),
      h("footer", { class: "bar" }, this.nextEl, h("div", { class: "actions" }, this.askBtn, this.lostBtn)),
      this.toastEl,
    );

    // Neue Karte gesehen: jede Berührung nimmt die gelbe Randmarke weg.
    this.root.addEventListener("pointerdown", () => document.body.classList.remove("fresh"), { capture: true });
    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") this.manual(this.shown + 1);
      if (e.key === "ArrowLeft") this.manual(this.shown - 1);
    });

    if (settings.proxyUrl) {
      this.proxy = new ProxySession(settings.proxyUrl, settings.proxyKey, sessionName(d.deck.course, d.deck.date), d.deck);
      this.proxy.onStatus = (online) => this.register.setOnline(online);
      this.proxy.connect();
    } else this.register.setOnline(null);

    this.display(d.deck.slides[0]!.n, false);
    this.setState("folgt");
    this.register.setMic("off");
  }

  private btnContent(name: "ask" | "lost", label: string): Node[] {
    return [icon(name), document.createTextNode(label)];
  }

  private now(): number {
    return this.stt?.now?.() ?? Date.now();
  }

  private markExam(n: number): void {
    this.margin.markExam(n, this.now());
    this.register.markExam(n);
    if (n === this.shown && this.margin.mode === "card") this.margin.showCard(this.slide(n)!);
  }

  private slide(n: number): Slide | undefined {
    return this.d.deck.slides.find((s) => s.n === n);
  }

  toast(text: string, ms = 3500): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("on");
    setTimeout(() => this.toastEl.classList.remove("on"), ms);
  }

  // ---------------------------------------------------------------- Anzeige

  private display(n: number, fresh = true): void {
    const s = this.slide(n);
    if (!s) return;
    const changed = n !== this.shown;
    this.shown = n;
    this.pendingShow = null;
    this.slideView.show(s);
    this.register.setPosition(n);
    if (changed) {
      this.history.push({ n, t: this.now() });
      this.margin.clearNotes(this.now());
    }
    this.margin.showCard(s);
    this.askBtn.setAttribute("aria-pressed", "false");
    this.lostBtn.setAttribute("aria-pressed", "false");
    this.nextEl.replaceChildren(...(s.next_hint ? [h("span", {}, ...this.formatNext(s.next_hint))] : []));
    if (fresh && changed) {
      document.body.classList.add("fresh");
      clearTimeout(this.freshTimer);
      this.freshTimer = window.setTimeout(() => document.body.classList.remove("fresh"), FRESH_MS);
    }
  }

  private formatNext(hint: string): (Node | string)[] {
    const m = /^(Gleich:)\s*(.*)$/.exec(hint);
    return m ? [h("b", {}, m[1]!), ` ${m[2]}`] : [hint];
  }

  private setState(state: string): void {
    document.body.dataset.state = state;
    this.register.setState(state);
  }

  private manual(n: number): void {
    const s = this.slide(n);
    if (!s) return;
    this.tracker.setManual(n, this.now());
    this.setState("manuell");
    this.display(n, false);
    this.proxy?.log({ ev: "slide", n, source: "manual" }, this.now());
  }

  // ---------------------------------------------------------------- Schicht D

  private recentLines(ms: number): TranscriptLine[] {
    const from = this.now() - ms;
    return this.lines.filter((l) => l.t >= from);
  }

  private toggleMore(): void {
    const s = this.slide(this.shown);
    if (!s) return;
    if (this.margin.mode === "more") {
      this.margin.showCard(s);
      this.askBtn.setAttribute("aria-pressed", "false");
      return;
    }
    this.lostBtn.setAttribute("aria-pressed", "false");
    this.askBtn.setAttribute("aria-pressed", "true");
    this.proxy?.log({ ev: "mark", kind: "question", n: s.n }, this.now());
    const fresh = this.proxy?.online ? this.proxy.ask("more", s.n, this.recentLines(120_000)).then((r) => r?.text ?? null) : null;
    this.margin.showMore(s, fresh);
  }

  private localRecap(): Recap {
    const s = this.slide(this.shown)!;
    const since = this.now() - 180_000;
    const seen: number[] = [];
    for (const e of [...this.history].reverse()) {
      if (e.t < since && seen.length >= 1) break;
      if (!seen.includes(e.n)) seen.push(e.n);
      if (seen.length >= 3) break;
    }
    const points = seen
      .reverse()
      .map((n) => this.slide(n))
      .filter((x): x is Slide => Boolean(x))
      .map((x) => ({ ref: `Folie ${x.n} · ${x.title}`, text: x.glance }));
    return {
      here: `Du bist bei Folie ${s.n}, Abschnitt „${s.section}“.`,
      points,
      sections: sectionSpans(this.d.deck)
        .filter((sp) => sp.count)
        .map((sp) => ({ name: sp.name, status: s.n > sp.last ? "done" : s.n >= sp.first ? "current" : "todo" })),
    };
  }

  private toggleRecap(): void {
    const s = this.slide(this.shown);
    if (!s) return;
    if (this.margin.mode === "recap") {
      this.margin.showCard(s);
      this.lostBtn.setAttribute("aria-pressed", "false");
      return;
    }
    this.askBtn.setAttribute("aria-pressed", "false");
    this.lostBtn.setAttribute("aria-pressed", "true");
    this.proxy?.log({ ev: "mark", kind: "lost", n: s.n }, this.now());
    const fresh = this.proxy?.online
      ? this.proxy.ask("recap", s.n, this.recentLines(180_000)).then((r) =>
          r ? r.text.split("\n").map((l) => l.replace(/^\s*[-•\d.)]+\s*/, "").trim()).filter(Boolean) : null,
        )
      : null;
    this.margin.showRecap(this.localRecap(), fresh);
  }

  private circle(text: string): void {
    const s = this.slide(this.shown);
    if (!s) return;
    this.askBtn.setAttribute("aria-pressed", "false");
    this.lostBtn.setAttribute("aria-pressed", "false");
    this.proxy?.log({ ev: "mark", kind: "circle", n: s.n }, this.now());
    const block = s.blocks?.find((b) => b.text === text.split("\n")[0]);
    const fresh = this.proxy?.online
      ? this.proxy.ask("circle", s.n, this.recentLines(60_000), block ? { bbox: block.bbox, text } : undefined).then((r) => r?.text ?? null)
      : null;
    this.margin.showCircle(s, text, fresh);
  }

  // ---------------------------------------------------------------- Ton und Transkript

  async startListening(): Promise<void> {
    const st = this.settings;
    if (st.audio === "off") {
      this.toast("Ton ist in den Einstellungen aus. Karten und Blättern funktionieren trotzdem.");
      this.onSettings();
      return;
    }
    const keyterms = this.d.deck.keyterms ?? [];
    try {
      if (st.audio === "replay") {
        this.stt = new ReplaySTT(new URL("transcript.txt", this.d.url).toString(), st.replaySpeed);
      } else {
        if (!st.proxyUrl) {
          this.toast("Für Live-Ton braucht die App die Proxy-Adresse (Token für die Transkription).");
          this.onSettings();
          return;
        }
        const tokens = proxyTokenSource(st.proxyUrl, st.proxyKey);
        this.stt = st.stt === "deepgram" ? new Deepgram(tokens, keyterms) : new AssemblyAI(tokens, keyterms);
        this.audio = st.audio === "native" ? new NativeAudio() : new BrowserMic({ record: st.record });
      }
      await this.stt.start({
        onSegment: (seg) => this.onSegment(seg),
        onStatus: (status, detail) => {
          this.proxy?.log({ ev: "audio", status: `stt:${status}${detail ? ` ${detail}` : ""}` }, this.now());
          if (status === "error") this.toast("Transkription nicht erreichbar. Karten laufen weiter, blättern geht von Hand.");
          if (status === "closed" && this.listening && st.audio === "replay") void this.stopListening();
        },
      });
      if (this.audio) {
        await this.audio.start(
          (pcm) => this.stt?.send(pcm),
          (status) => {
            this.proxy?.log({ ev: "audio", status }, this.now());
            if (status === "silenced") {
              this.register.setMic("silenced");
              this.toast("Android schaltet die Aufnahme stumm. Prüf, ob TwinMind noch aufnimmt.", 6000);
            } else if (status === "running") this.register.setMic("on");
            else if (status === "denied") this.register.setMic("denied");
          },
        );
      }
      this.listening = true;
      this.register.setMic("on");
      this.tracker.locate(this.shown);
      const every = st.audio === "replay" ? 2000 / Math.max(1, st.replaySpeed) : 2000;
      this.loop = window.setInterval(() => this.tick(), every);
      await this.keepAwake();
    } catch (e) {
      console.error(e);
      this.register.setMic("error");
      this.toast(`Zuhören ging nicht: ${(e as Error).message}`);
      await this.stopListening();
    }
  }

  async stopListening(): Promise<void> {
    clearInterval(this.loop);
    this.stt?.stop();
    this.audio?.stop();
    if (this.audio instanceof BrowserMic) {
      const blob = this.audio.recording();
      if (blob) offerDownload(blob, `${this.d.deck.course}_${this.d.deck.date}.webm`);
    }
    this.stt = null;
    this.audio = null;
    this.listening = false;
    this.register.setMic("off");
    await this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  private async keepAwake(): Promise<void> {
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible" && this.listening) this.wakeLock = await navigator.wakeLock?.request("screen");
      });
    } catch {
      /* Wake-Lock nicht verfügbar: Bildschirm-Timeout in den Android-Einstellungen hochsetzen */
    }
  }

  private onSegment(seg: Segment): void {
    const accepted = this.tracker.push(seg);
    const last = seg.words.at(-1);
    if (last && seg.receivedAt) {
      this.lastSegmentAt = seg.receivedAt;
      if (!seg.final) this.proxy?.log({ ev: "latency", spokenToPartialMs: Math.round(seg.receivedAt - last.t) }, this.now());
    }
    if (!seg.final || this.finals.has(seg.id)) return;
    this.finals.add(seg.id);
    const text = seg.words.map((w) => w.text).join(" ");
    if (!accepted) return;
    this.lines.push({ t: seg.words[0]?.t ?? this.now(), text });
    const cutoff = this.now() - 300_000;
    while (this.lines.length && this.lines[0]!.t < cutoff) this.lines.shift();
    // Schicht C: am Satzende, nur wenn der Satz etwas Neues enthält.
    if (this.proxy?.online && this.gate.shouldRequest(this.now(), text, this.tracker)) void this.requestNote();
  }

  private async requestNote(): Promise<void> {
    const n = this.tracker.current;
    const r = await this.proxy!.note(n, this.recentLines(60_000));
    if (!r) return;
    const { result, latencyMs } = r;
    const shown = result.type !== "none" && result.confidence >= 0.6 && Boolean(result.text);
    this.proxy?.log({ ev: "note", type: result.type, text: result.text, n, shown, latencyMs }, this.now());
    if (!shown) return;
    if (result.type === "exam") this.markExam(n);
    this.margin.addNote(result.type as Exclude<typeof result.type, "none">, result.text, this.now());
  }

  private tick(): void {
    const now = this.now();
    const u = this.tracker.evaluate(now);
    this.applyUpdate(u, now);
  }

  private applyUpdate(u: TrackerUpdate, now: number): void {
    const state = u.state;
    if (document.body.dataset.state !== state) {
      this.setState(state);
      this.proxy?.log({ ev: "state", state }, now);
    }
    this.register.setUnclear(Boolean(u.flags.unclear));

    if (u.changed) {
      this.pendingShow = { n: u.n, since: now };
      this.proxy?.log({ ev: "slide", n: u.n, source: "tracker", score: Math.round(u.score * 100) / 100 }, now);
    }
    // Karte bevorzugt in einer Sprechpause wechseln, spätestens nach 4 s.
    if (this.pendingShow && this.pendingShow.n !== this.shown) {
      const waited = now - this.pendingShow.since;
      if (this.tracker.isPause(now) || waited >= MAX_CARD_DELAY_MS) {
        const shownAt = Date.now();
        this.display(this.pendingShow.n);
        if (this.lastSegmentAt) this.proxy?.log({ ev: "latency", partialToDisplayMs: Math.round(shownAt - this.lastSegmentAt) }, now);
      }
    }

    const f = u.flags;
    if (f.exam) {
      const n = this.tracker.current;
      if (f.exam.negative) this.margin.addNote("exam", "Der Prof sagt: Das wird in der Klausur nicht gefragt.", now);
      else {
        this.markExam(n);
        this.margin.addNote("exam", EXAM_TEXT[f.exam.phrase] ?? "Der Prof spricht über die Klausur. Merk dir diese Stelle.", now);
      }
      this.proxy?.log({ ev: "exam", n, phrase: f.exam.phrase }, now);
    }
    if (f.link) this.margin.addNote("link", `Kennst du schon aus: ${f.link.courses.join(", ")}.`, now);
    if (f.boardEnded) {
      const s = this.slide(f.boardEnded);
      if (s) this.margin.addNote("board", `Das war die Zeichnung zu Folie ${s.n} (${s.title}).`, now);
    }
    // Höchstens ein Begriff auf einmal, und nicht direkt nach einem Kartenwechsel (zu viel Bewegung).
    const settled = now - (this.history.at(-1)?.t ?? 0) > 6000;
    if (settled && f.termHits.length && now - this.lastTermAt > 7000) {
      this.slideView.flashTerm(f.termHits[0]!);
      this.lastTermAt = now;
    }
    if (f.askLocate && this.proxy?.online) {
      void this.proxy.ask("locate", this.tracker.current, this.recentLines(60_000)).then((r) => {
        if (r?.n && this.slide(r.n)) {
          this.tracker.locate(r.n);
          this.pendingShow = { n: r.n, since: this.now() };
          this.proxy?.log({ ev: "slide", n: r.n, source: "proxy" }, this.now());
        }
      });
    }
  }
}

function offerDownload(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.textContent = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 10_000);
}
