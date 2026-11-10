export interface Env {
  SESSIONS: DurableObjectNamespace;
  /** Decks, Folienbilder und profile.md, hochgeladen vom Lernbegleiter (Pi). */
  DECKS?: KVNamespace;
  /** Statische App (app/dist), optional. */
  ASSETS?: Fetcher;
  ANTHROPIC_API_KEY: string;
  /** Nur für lokale Tests (Mock-Server). */
  ANTHROPIC_BASE_URL?: string;
  ASSEMBLYAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  /** Schlüssel der Tablet-App. */
  APP_KEY: string;
  /** Schlüssel des Lernbegleiters auf dem Pi (Upload, Protokoll abholen). */
  PI_KEY: string;
  ALLOWED_ORIGIN?: string;
}
