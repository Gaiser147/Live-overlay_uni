// Einstellungen: localStorage (nur auf diesem Tablet) plus URL-Parameter für Tests.

export type AudioMode = "off" | "browser" | "native" | "replay";
export type SttProvider = "assemblyai" | "deepgram";
export type SlideLook = "night" | "original";

export interface Settings {
  /** URL der deck.json (relativ oder absolut). */
  deckUrl: string;
  audio: AudioMode;
  stt: SttProvider;
  /** z. B. https://overlay.example.workers.dev */
  proxyUrl: string;
  /** Gemeinsamer Schlüssel für den Proxy. Bleibt nur auf diesem Gerät. */
  proxyKey: string;
  slideLook: SlideLook;
  /** Weg 2: komprimierte Aufnahme für den späteren Upload zu TwinMind. */
  record: boolean;
  /** Wiedergabe-Tempo im Demo-Modus. */
  replaySpeed: number;
}

const KEY = "live-overlay:settings";

export const DEFAULT_SETTINGS: Settings = {
  deckUrl: "decks/demo/deck.json",
  audio: "off",
  stt: "assemblyai",
  proxyUrl: "",
  proxyKey: "",
  slideLook: "night",
  record: false,
  replaySpeed: 1,
};

export function loadSettings(): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
  } catch {
    stored = {};
  }
  const s: Settings = { ...DEFAULT_SETTINGS, ...stored };
  const q = new URLSearchParams(location.search);
  if (q.get("deck")) s.deckUrl = q.get("deck")!;
  if (q.get("audio")) s.audio = q.get("audio") as AudioMode;
  if (q.get("proxy")) s.proxyUrl = q.get("proxy")!;
  if (q.get("look")) s.slideLook = q.get("look") as SlideLook;
  if (q.get("speed")) s.replaySpeed = Number(q.get("speed")) || 1;
  if (q.has("demo")) {
    s.deckUrl = "decks/demo/deck.json";
    s.audio = "replay";
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* privates Fenster o. Ä.: Einstellungen gelten dann nur für diese Sitzung */
  }
}
