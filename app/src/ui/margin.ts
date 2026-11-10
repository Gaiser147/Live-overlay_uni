// Marginalspalte: die Karte als Lehrbuch-Absatz, „Genauer“, „Faden verloren“, S-Pen-Stelle,
// darunter die Live-Notizen des Profs.
import { KIND_HEAD, type Slide } from "../../../shared/deck.ts";
import { clock, h, icon } from "./dom.ts";

export type MarginMode = "card" | "more" | "recap" | "circle";

export type NoteKind = "note" | "exam" | "examOff" | "link" | "board" | "offtopic";

/** Kopf der Marginalie, als fetter Einlauf wie im Lehrbuch. */
const NOTE_HEAD: Record<NoteKind, string> = {
  note: "Prof",
  exam: "Klausur",
  examOff: "Klausur",
  link: "Verweis",
  board: "Tafel",
  offtopic: "Nebengespräch",
};

/**
 * Formeln nicht mitten im Ausdruck umbrechen: Leerzeichen in Klammern und vor Operatoren werden
 * geschützt, nach = und → nur, wenn der rechte Teil kurz ist. Umbruch bleibt nach + und nach Satzenden.
 */
export function mathText(s: string): string {
  const NB = "\u00a0";
  let out = s.replace(/\(([^()]{0,24})\)/g, (m) => m.replace(/ /g, NB));
  out = out.replace(/ (=|→|↦|≠|≤|≥|\+|−|·|×) /g, `${NB}$1 `);
  out = out.replace(/(=|→|↦) (\S{1,10})(?=[\s.,;]|$)/g, `$1${NB}$2`);
  return out;
}

export interface Recap {
  here: string;
  points: { ref?: string; text: string }[];
  sections: { name: string; status: "done" | "current" | "todo" }[];
}

/** „Beispiel: Drehung um 90°" → Kopf „Beispiel", Thema „Drehung um 90°". */
export function topicOf(slide: Slide): string {
  return slide.title.replace(/^(Beispiel|Definition|Satz|Aufgabe|Bemerkung)\s*[:—–-]\s*/i, "").trim() || slide.title;
}

export class Margin {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private live: HTMLElement;
  private boardMsg: HTMLElement;
  mode: MarginMode = "card";

  constructor() {
    this.body = h("article", { class: "card", "aria-live": "polite" });
    this.live = h("section", { class: "live", "aria-label": "Live-Notizen" });
    this.boardMsg = h(
      "div",
      { class: "board-msg", role: "status" },
      h("p", { class: "big" }, "Prof zeichnet – schau nach vorn."),
      h("p", { class: "small" }, "Die Karte kommt zurück, sobald es weitergeht."),
    );
    this.el = h("aside", { class: "margin", "aria-label": "Karte" }, this.body, this.live, this.boardMsg);
  }

  /** Klausurhinweis zu Folie n, mit Uhrzeit und Wortlaut (bleibt für die Sitzung gespeichert). */
  private examSlides = new Map<number, { t: number; text: string }>();

  markExam(n: number, t: number, text: string): void {
    if (!this.examSlides.has(n)) this.examSlides.set(n, { t, text });
  }

  hasExam(n: number): boolean {
    return this.examSlides.has(n);
  }

  showCard(slide: Slide): void {
    this.mode = "card";
    const b = this.body;
    b.dataset.kind = slide.kind;
    b.dataset.exam = slide.exam_relevant ? "on" : "off";
    const parts: Node[] = [];
    const head = KIND_HEAD[slide.kind];
    const topic = topicOf(slide);
    const showTopic = !["title", "section"].includes(slide.kind) && topic.toLowerCase() !== head.toLowerCase();
    const hasMore = Boolean(slide.example || slide.rule);
    parts.push(
      h(
        "p",
        { class: `glance${hasMore ? "" : " end"}` },
        h("b", { class: "head" }, head),
        showTopic ? h("span", { class: "topic" }, ` (${topic})`) : null,
        ". ",
        mathText(slide.glance),
      ),
    );
    if (slide.example) {
      parts.push(
        h(
          "p",
          { class: `sub${slide.rule ? "" : " end"}` },
          h("b", { class: "head" }, "Beispiel"),
          slide.example.invented ? h("span", { class: "tag" }, " (ausgedacht)") : null,
          ". ",
          mathText(slide.example.text),
        ),
      );
    }
    if (slide.rule) {
      const isHint = slide.kind === "task";
      parts.push(h("p", { class: "sub end" }, h("b", { class: "head" }, isHint ? "Lösungsweg" : "Regel"), ". ", mathText(slide.rule.replace(/^Lösungsweg:\s*/i, ""))));
    }
    if (!slide.exam_relevant) parts.push(h("p", { class: "exam-off" }, slide.exam_note ?? "Laut Folie nicht klausurrelevant"));
    // Klausurhinweis des Profs: eine Marginalie in Korrekturrot am Ende der Karte (dazu der rote Strich im Register).
    const exam = this.examSlides.get(slide.n);
    if (exam) parts.push(h("p", { class: "exam-flag" }, h("b", { class: "head" }, "Klausur"), ` (${clock(exam.t)}). `, exam.text));
    b.replaceChildren(...parts);
    b.scrollTop = 0;
  }

  /** „Genauer“: vorbereitete Erklärung sofort, frische Erklärung des Proxys darunter, sobald sie da ist. */
  showMore(slide: Slide, fresh: Promise<string | null> | null): void {
    this.mode = "more";
    this.body.dataset.exam = "on";
    const answer = fresh ? h("p", { class: "fresh-answer", "data-loading": "" }) : null;
    this.body.replaceChildren(
      h("p", { class: "more" }, h("b", { class: "head" }, "Genauer"), h("span", { class: "topic" }, ` (${topicOf(slide)})`), ". ", mathText(slide.more)),
      ...(answer ? [answer] : []),
    );
    if (fresh && answer) {
      void fresh.then((text) => {
        if (this.mode !== "more") return;
        answer.removeAttribute("data-loading");
        if (text) answer.replaceChildren(h("b", { class: "head" }, "Mit dem Vortrag"), ". ", mathText(text));
        else answer.remove();
      });
    }
  }

  showRecap(r: Recap, fresh: Promise<string[] | null> | null): void {
    this.mode = "recap";
    this.body.dataset.exam = "on";
    const item = (p: { ref?: string; text: string }) => h("li", {}, p.ref ? h("span", { class: "ref" }, p.ref) : null, mathText(p.text));
    const list = h("ol", { class: "recap-points" }, ...r.points.map(item));
    this.body.replaceChildren(
      h("p", { class: "recap-here" }, r.here),
      list,
      h(
        "ul",
        { class: "recap-sections" },
        ...r.sections.map((sct) =>
          h("li", { "data-s": sct.status }, h("span", { class: "mark" }, sct.status === "done" ? icon("check") : h("span", { class: "ring" })), sct.name),
        ),
      ),
    );
    if (fresh) {
      void fresh.then((pts) => {
        if (this.mode !== "recap" || !pts?.length) return;
        list.replaceChildren(...pts.slice(0, 3).map((p) => item({ text: p })));
      });
    }
  }

  showCircle(slide: Slide, excerpt: string, fresh: Promise<string | null> | null): void {
    this.mode = "circle";
    this.body.dataset.exam = "on";
    const answer = h("p", { class: "fresh-answer", "data-loading": fresh ? "" : null });
    this.body.replaceChildren(
      h("p", { class: "more" }, h("b", { class: "head" }, "Zu dieser Stelle"), ". ", excerpt ? mathText(excerpt) : "Hier steht kein Text – frag lieber mit „Genauer“."),
      answer,
    );
    if (!fresh) {
      answer.textContent = slide.more;
      return;
    }
    void fresh.then((text) => {
      if (this.mode !== "circle") return;
      answer.removeAttribute("data-loading");
      answer.textContent = text ?? slide.more;
    });
  }

  /** Live-Notiz als Marginalie: „**Prof, 10:06.** Projektion = Schatten …“ */
  addNote(kind: NoteKind, text: string, t: number): void {
    const note = h("p", { class: "live-note", "data-type": kind, "data-t": t }, h("b", { class: "head" }, `${NOTE_HEAD[kind]}, ${clock(t)}.`), " ", mathText(text));
    this.live.prepend(note);
    while (this.live.children.length > 3) this.live.lastElementChild!.remove();
  }

  /** Beim Folienwechsel: Notizen, die älter als 20 s sind, gehören zur vorigen Folie. */
  clearNotes(now: number): void {
    for (const el of [...this.live.children] as HTMLElement[]) if (now - Number(el.dataset.t) > 20_000) el.remove();
  }
}
