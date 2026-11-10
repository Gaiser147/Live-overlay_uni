// Einstellungen als natives <dialog>: Vorlesung, Tonquelle, Proxy. Wird vor der Vorlesung benutzt.
import type { Settings } from "../config.ts";
import { h } from "./dom.ts";

export interface DeckChoice {
  url: string;
  label: string;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), control, hint ? h("p", { class: "hint" }, hint) : null);
}

function select(name: string, value: string, options: [string, string][]): HTMLSelectElement {
  const el = h("select", { name });
  for (const [v, l] of options) el.append(h("option", { value: v, selected: v === value }, l));
  return el;
}

export function openSettings(current: Settings, decks: DeckChoice[], onSave: (s: Settings) => void): void {
  const deckOptions: [string, string][] = decks.map((d) => [d.url, d.label]);
  if (!decks.some((d) => d.url === current.deckUrl)) deckOptions.unshift([current.deckUrl, current.deckUrl]);

  const deck = select("deckUrl", current.deckUrl, deckOptions);
  const audio = select("audio", current.audio, [
    ["off", "Aus – nur Karten, von Hand blättern"],
    ["native", "Android-Dienst (TwinMind läuft weiter)"],
    ["browser", "Mikrofon im Browser"],
    ["replay", "Wiedergabe der Demo-Vorlesung"],
  ]);
  const stt = select("stt", current.stt, [
    ["assemblyai", "AssemblyAI"],
    ["deepgram", "Deepgram"],
  ]);
  const look = select("slideLook", current.slideLook, [
    ["night", "Nachtfolie (invertiert)"],
    ["original", "Originalfarben, gedimmt"],
  ]);
  const proxy = h("input", { name: "proxyUrl", type: "url", value: current.proxyUrl, placeholder: "https://…workers.dev", inputmode: "url", autocomplete: "off" });
  const key = h("input", { name: "proxyKey", type: "password", value: current.proxyKey, autocomplete: "off" });
  const record = h("select", { name: "record" }, h("option", { value: "0", selected: !current.record }, "Nein"), h("option", { value: "1", selected: current.record }, "Ja, für den Upload zu TwinMind"));

  const dlg = h("dialog", { class: "settings", "aria-labelledby": "settings-title" });
  const form = h(
    "form",
    { method: "dialog" },
    h("h2", { id: "settings-title" }, "Vorlesung einrichten"),
    h("p", { class: "lead" }, "Vor der Vorlesung einmal einstellen. Ohne Proxy und Ton laufen Karten und Blättern trotzdem, auch ohne Netz."),
    field("Vorlesung", deck),
    h("div", { class: "row" }, field("Ton", audio), field("Transkription", stt)),
    h("div", { class: "row" }, field("Folien", look), field("Ton zusätzlich speichern", record)),
    h("div", { class: "row" }, field("Proxy-Adresse", proxy), field("Proxy-Schlüssel", key)),
    h(
      "p",
      { class: "hint" },
      "Der Proxy liefert Live-Notizen, frische Erklärungen und das Token für die Transkription. Der Schlüssel bleibt auf diesem Tablet. Ton speichern ist nur nötig, wenn TwinMind nicht mitläuft (Weg 2).",
    ),
    h(
      "div",
      { class: "settings-actions" },
      h("button", { class: "btn", type: "button", value: "cancel", onclick: () => dlg.close() }, "Abbrechen"),
      h("button", { class: "btn primary", type: "submit", value: "save" }, "Speichern"),
    ),
  );
  dlg.append(form);
  form.addEventListener("submit", () => {
    const fd = new FormData(form);
    onSave({
      ...current,
      deckUrl: String(fd.get("deckUrl")),
      audio: fd.get("audio") as Settings["audio"],
      stt: fd.get("stt") as Settings["stt"],
      slideLook: fd.get("slideLook") as Settings["slideLook"],
      proxyUrl: String(fd.get("proxyUrl") ?? "").trim(),
      proxyKey: String(fd.get("proxyKey") ?? "").trim(),
      record: fd.get("record") === "1",
    });
  });
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
