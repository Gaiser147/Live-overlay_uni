// Kleine DOM-Helfer ohne Framework.
import { CircleHelp, Check, createElement, History, LocateFixed, Mic, MicOff, PenLine, Settings, TriangleAlert, WifiOff, X, type IconNode } from "lucide";

type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const svgNS = "http://www.w3.org/2000/svg";

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const ICONS = {
  ask: CircleHelp,
  lost: History,
  settings: Settings,
  mic: Mic,
  micOff: MicOff,
  offline: WifiOff,
  pen: PenLine,
  check: Check,
  follow: LocateFixed,
  close: X,
  exam: TriangleAlert,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGElement {
  const el = createElement(ICONS[name]) as unknown as SVGElement;
  el.setAttribute("class", "icon");
  el.setAttribute("aria-hidden", "true");
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Uhrzeit HH:MM. Werte unter 24 h gelten als Tageszeit (Wiedergabe-Uhr). */
export function clock(t: number): string {
  if (t < 86_400_000) {
    const m = Math.floor(t / 60_000);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  return new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
