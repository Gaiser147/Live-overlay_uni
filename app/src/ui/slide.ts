// Folie mit Markierungen. Finger: wischen = blättern. S Pen: einkreisen = „?“ zu dieser Stelle.
import type { BBox, Slide, TextBlock } from "../../../shared/deck.ts";
import type { LoadedDeck } from "../deck.ts";
import { h, s } from "./dom.ts";

export interface SlideHandlers {
  onSwipe(dir: 1 | -1): void;
  onCircle(bbox: BBox, blocks: TextBlock[]): void;
}

function overlap(a: BBox, b: BBox): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const hh = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (b[2] - b[0]) * (b[3] - b[1]);
  return area > 0 ? (w * hh) / area : 0;
}

/** Nachtfolie: invertieren, Farbton zurückdrehen, helle Töne per Gamma dämpfen (Weiß bleibt hell). */
function nightFilter(): Node {
  const svg = s("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
  const f = s("filter", { id: "night", "color-interpolation-filters": "sRGB" });
  f.append(
    s("feColorMatrix", { type: "matrix", values: "-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" }),
    s("feColorMatrix", { type: "hueRotate", values: "180" }),
    // Farbige Flächen (Beamer-Blöcke) entsättigen, sonst leuchten sie nach dem Invertieren.
    s("feColorMatrix", { type: "saturate", values: "0.5" }),
  );
  const ct = s("feComponentTransfer");
  for (const ch of ["feFuncR", "feFuncG", "feFuncB"] as const) ct.append(s(ch, { type: "gamma", amplitude: 0.92, exponent: 1.5, offset: 0 }));
  f.append(ct);
  svg.append(f);
  return svg as unknown as Node;
}

export class SlideView {
  readonly el: HTMLElement;
  private fig: HTMLElement;
  private img: HTMLImageElement;
  private textFallback: HTMLElement;
  private overlay: SVGSVGElement;
  private ink: SVGSVGElement;
  private slide: Slide | null = null;
  private readonly deck: LoadedDeck;
  private readonly on: SlideHandlers;
  /** Sichtbarer Bereich der Folie (ohne Navigationsleiste und Fußzeile). */
  private readonly top: number;
  private readonly bottom: number;

  constructor(deck: LoadedDeck, on: SlideHandlers) {
    this.deck = deck;
    this.on = on;
    [this.top, this.bottom] = deck.deck.crop ?? [0, 1];
    const span = this.bottom - this.top;
    // Seitenverhältnis des sichtbaren Ausschnitts; die SVG-Ebenen nutzen dieselben Folienkoordinaten.
    const aspect = (deck.deck.aspect ?? 4 / 3) / span;
    this.img = h("img", {
      alt: "",
      draggable: "false",
      decoding: "async",
      style: `height: ${(100 / span).toFixed(3)}%; top: ${((-this.top / span) * 100).toFixed(3)}%`,
    });
    this.textFallback = h("div", { class: "slide-text", hidden: true });
    const vb = `0 ${this.top} 1 ${span}`;
    this.overlay = s("svg", { class: "overlay", viewBox: vb, preserveAspectRatio: "none" });
    this.ink = s("svg", { class: "ink", viewBox: vb, preserveAspectRatio: "none" });
    this.fig = h("figure", { class: "slide", style: `--aspect: ${aspect}; --aspect-n: ${aspect}` }, this.img, this.textFallback, this.overlay as unknown as Node, this.ink as unknown as Node);
    this.el = h("section", { class: "slide-pane", "aria-label": "Aktuelle Folie" }, this.fig, nightFilter());
    this.bindPointers();
  }

  show(slide: Slide): void {
    this.slide = slide;
    const url = this.deck.imageUrl(slide.n);
    if (url) {
      this.img.hidden = false;
      this.textFallback.hidden = true;
      this.img.src = url;
      this.img.alt = `Folie ${slide.n}: ${slide.title}`;
    } else {
      // Ohne Bild (z. B. nur Text aus dem Handout): Folientext als Ersatz.
      this.img.hidden = true;
      this.textFallback.hidden = false;
      this.textFallback.replaceChildren(h("h2", {}, slide.title), slide.text ?? "");
    }
    this.overlay.replaceChildren();
    for (const hl of slide.highlights) {
      const [x0, y0, x1, y1] = hl.bbox;
      const pad = 0.006;
      const r = s("rect", { class: "hl", x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad, rx: 0.004 });
      const title = s("title");
      title.textContent = hl.label;
      r.append(title);
      this.overlay.append(r);
    }
    this.ink.replaceChildren();
  }

  /** Gefallener Fachbegriff: Linie unter dem Textblock, der ihn enthält (5 s). */
  flashTerm(stemmed: string): void {
    const block = this.slide?.blocks?.find((b) => b.text.toLowerCase().includes(stemmed.slice(0, Math.max(4, stemmed.length - 1))));
    if (!block) return;
    const [x0, , x1, y1] = block.bbox;
    const line = s("rect", { class: "term", x: x0, y: y1 + 0.004, width: x1 - x0, height: 0.006, rx: 0.002 });
    this.overlay.append(line);
    requestAnimationFrame(() => line.classList.add("on"));
    setTimeout(() => {
      line.classList.remove("on");
      setTimeout(() => line.remove(), 300);
    }, 4000);
  }

  private markCircled(blocks: TextBlock[]): void {
    for (const b of blocks) {
      const [x0, y0, x1, y1] = b.bbox;
      this.overlay.append(s("rect", { class: "circled", x: x0 - 0.008, y: y0 - 0.008, width: x1 - x0 + 0.016, height: y1 - y0 + 0.016, rx: 0.006 }));
    }
  }

  private bindPointers(): void {
    let start: { x: number; y: number; id: number } | null = null;
    let path: SVGPathElement | null = null;
    let pts: [number, number][] = [];
    const rel = (e: PointerEvent): [number, number] => {
      const r = this.fig.getBoundingClientRect();
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), this.top + y * (this.bottom - this.top)];
    };
    // Stift = Schreiben/Markieren, Finger = Wischen. Am Desktop: Shift + Maus wirkt wie der Stift.
    const isPen = (e: PointerEvent) => e.pointerType === "pen" || (e.pointerType === "mouse" && e.shiftKey);

    this.el.addEventListener("pointerdown", (e) => {
      if (isPen(e)) {
        e.preventDefault();
        this.ink.setPointerCapture(e.pointerId);
        pts = [rel(e)];
        path = s("path", { d: "" });
        this.ink.replaceChildren(path);
        return;
      }
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    this.el.addEventListener("pointermove", (e) => {
      if (path && isPen(e)) {
        pts.push(rel(e));
        path.setAttribute("d", "M" + pts.map((p) => `${p[0].toFixed(4)} ${p[1].toFixed(4)}`).join(" L"));
      }
    });
    const end = (e: PointerEvent) => {
      if (path) {
        const done = path;
        path = null;
        if (pts.length > 6) {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const bbox: BBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          const blocks = (this.slide?.blocks ?? []).filter((b) => overlap(bbox, b.bbox) >= 0.3);
          this.markCircled(blocks);
          this.on.onCircle(bbox, blocks);
        }
        setTimeout(() => done.remove(), 1500);
        return;
      }
      if (start && e.pointerId === start.id) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) this.on.onSwipe(dx < 0 ? 1 : -1);
        start = null;
      }
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", () => {
      start = null;
      path = null;
    });
  }
}
