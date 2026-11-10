import "./styles.css";
import { loadSettings, saveSettings } from "./config.ts";
import { Controller } from "./controller.ts";
import { loadDeck, preloadImages } from "./deck.ts";
import { h } from "./ui/dom.ts";
import { openSettings, type DeckChoice } from "./ui/settings.ts";

async function deckChoices(): Promise<DeckChoice[]> {
  try {
    const res = await fetch("decks/index.json", { cache: "no-cache" });
    return res.ok ? ((await res.json()) as DeckChoice[]) : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const settings = loadSettings();
  const choices = await deckChoices();
  const showSettings = () =>
    openSettings(settings, choices, (next) => {
      saveSettings(next);
      // Neu laden: Deck, Tonquelle und Proxy werden beim Start verdrahtet.
      location.search = "";
    });

  try {
    const d = await loadDeck(settings.deckUrl, { url: settings.proxyUrl, key: settings.proxyKey });
    if (d.problems.length) console.warn("deck.json:", d.problems);
    // Geschützte Decks: erst alle Bilder holen, dann anzeigen. Sonst parallel.
    const pre = preloadImages(d);
    if (Object.keys(d.headers).length) await pre;
    const app = new Controller(d, settings, showSettings);
    document.body.replaceChildren(app.root);
    document.title = `${d.deck.title} – Live`;
    const q = new URLSearchParams(location.search);
    if (q.has("demo") || q.has("autostart")) setTimeout(() => void app.startListening(), 800);
  } catch (e) {
    const offline = !navigator.onLine;
    document.body.replaceChildren(
      h(
        "main",
        { class: "empty" },
        h("h2", {}, "Noch keine Vorlesung geladen"),
        h(
          "p",
          {},
          offline
            ? "Das Tablet ist offline und diese Vorlesung liegt noch nicht im Speicher. Öffne sie einmal mit Netz, danach geht es auch ohne."
            : "Wähl in den Einstellungen die Vorlesung von heute. Die Karten erzeugt der Lernbegleiter, sobald das Handout in Moodle liegt.",
        ),
        h("p", { class: "detail" }, `${settings.deckUrl}: ${(e as Error).message}`),
        h("button", { class: "btn primary", type: "button", onclick: showSettings }, "Einstellungen öffnen"),
      ),
    );
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(new URL("sw.js", location.href)).catch((e) => console.warn("Service Worker:", e));
}

void main();
