// Daumenregister: Abschnitte als Reiter, so breit wie ihre Folienzahl, ein Strich je Folie.
import { sectionSpans, type Deck } from "../../../shared/deck.ts";
import { h, icon } from "./dom.ts";

export type MicState = "off" | "on" | "silenced" | "denied" | "error";

export interface RegisterHandlers {
  onSection(firstSlide: number): void;
  onSettings(): void;
  onMic(): void;
  onFollow(): void;
}

const STATE_LABEL: Record<string, string> = {
  folgt: "folgt",
  unsicher: "unsicher",
  tafel: "Tafel",
  manuell: "von Hand",
};

export class Register {
  readonly el: HTMLElement;
  private tabs: { el: HTMLButtonElement; first: number; last: number; label: HTMLElement; check: SVGElement; ticks: HTMLElement[] }[] = [];
  private pos: HTMLElement;
  private stateLabel: HTMLElement;
  private offline: HTMLElement;
  private unclear: HTMLElement;
  private micBtn: HTMLButtonElement;
  private total: number;

  constructor(deck: Deck, on: RegisterHandlers) {
    this.total = deck.slides.length;
    const nav = h("nav", { class: "tabs", "aria-label": "Abschnitte" });
    for (const sp of sectionSpans(deck)) {
      if (!sp.count) continue;
      const check = icon("check");
      const label = h("span", { class: "tab-label" }, check, h("span", {}, sp.name));
      const ticks = deck.slides.filter((s) => s.section === sp.name).map((s) => h("i", { class: "tick", "data-n": s.n }));
      const btn = h(
        "button",
        { class: "tab", type: "button", style: `flex: ${sp.count} 1 0`, title: `${sp.name}: Folie ${sp.first}–${sp.last}`, onclick: () => on.onSection(sp.first) },
        label,
        h("span", { class: "ticks", "aria-hidden": "true" }, ...ticks),
      );
      this.tabs.push({ el: btn, first: sp.first, last: sp.last, label, check, ticks });
      nav.append(btn);
    }
    this.pos = h("span", { class: "pos", "aria-live": "polite" });
    this.stateLabel = h("span", { class: "state-label" });
    this.offline = h("span", { class: "status-item", hidden: true, title: "Proxy nicht erreichbar: Live-Notizen ruhen, alles andere läuft." }, icon("offline"), h("span", { class: "status-text" }, "offline"));
    this.unclear = h("span", { class: "status-item status-text", hidden: true }, "Ton unklar");
    this.micBtn = h("button", { class: "icon-btn", type: "button", "aria-pressed": "false", "aria-label": "Zuhören starten", onclick: on.onMic }, icon("micOff"));
    const follow = h("button", { class: "follow-btn", type: "button", onclick: on.onFollow }, icon("follow"), "Folgen");
    this.el = h(
      "header",
      { class: "register" },
      nav,
      h(
        "div",
        { class: "where" },
        this.pos,
        h("span", { class: "state" }, h("span", { class: "state-dot", "aria-hidden": "true" }), this.stateLabel),
        follow,
        h("span", { class: "status" }, this.unclear, this.offline),
        this.micBtn,
        h("button", { class: "icon-btn", type: "button", "aria-label": "Einstellungen", onclick: on.onSettings }, icon("settings")),
      ),
    );
  }

  setPosition(n: number): void {
    this.pos.replaceChildren("Folie ", h("b", {}, String(n)), ` / ${this.total}`);
    for (const t of this.tabs) {
      const status = n > t.last ? "done" : n >= t.first ? "current" : "todo";
      t.el.dataset.status = status;
      t.el.setAttribute("aria-current", status === "current" ? "step" : "false");
      t.check.style.display = status === "done" ? "" : "none";
      for (const tick of t.ticks) {
        const k = Number(tick.dataset.n);
        tick.dataset.s = k < n ? "done" : k === n ? "current" : "todo";
      }
    }
  }

  /** Strich einer Folie dauerhaft als „Klausurhinweis" markieren. */
  markExam(n: number): void {
    for (const t of this.tabs) for (const tick of t.ticks) if (Number(tick.dataset.n) === n) tick.dataset.exam = "1";
  }

  setState(state: string): void {
    this.stateLabel.textContent = STATE_LABEL[state] ?? state;
  }

  setOnline(online: boolean | null): void {
    this.offline.hidden = online !== false;
  }

  setUnclear(on: boolean): void {
    this.unclear.hidden = !on;
  }

  setMic(state: MicState): void {
    const on = state === "on";
    this.micBtn.setAttribute("aria-pressed", String(on));
    this.micBtn.setAttribute(
      "aria-label",
      on ? "Zuhören beenden" : state === "silenced" ? "Ton wird von Android stumm geschaltet" : state === "denied" ? "Mikrofon nicht erlaubt" : "Zuhören starten",
    );
    this.micBtn.title = this.micBtn.getAttribute("aria-label")!;
    this.micBtn.replaceChildren(icon(on ? "mic" : "micOff"));
    this.micBtn.style.color = state === "silenced" || state === "denied" || state === "error" ? "var(--exam)" : "";
  }
}
