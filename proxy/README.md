# Cloud-Proxy (Cloudflare Worker)

Versteckt die API-Schlüssel, gibt Kurzzeit-Token für die Transkription aus, hält pro Vorlesung ein Sitzungsobjekt (Durable Object mit WebSocket zur App) und ruft Claude auf:

| Schicht | Modell | Was |
|---|---|---|
| C – Live-Notiz | Claude Haiku 5.5, Denken aus, `effort: low`, JSON-Schema, 6 s Zeitlimit | „none“ ist die Standardantwort |
| D – „Genauer“, „Faden verloren“, S-Pen-Kreis | Claude Sonnet 5.5, `effort: low`, Server-Fallback bei Ablehnung | |
| D – „Welche Folie?“ (Tracker 30 s unsicher) | Claude Haiku 5.5 | |

Das ganze Deck liegt als stabiler Block im Prompt-Cache. Pro Aufruf kommen nur die aktuelle Folie und die letzten Sätze neu dazu. Transkripttext wird nicht gespeichert, nur Ereignisse, Notizen und Kosten (`GET /log/:session`).

## Einrichten

```bash
cd proxy
npx wrangler kv namespace create DECKS        # id in wrangler.toml eintragen
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY    # und/oder DEEPGRAM_API_KEY
npx wrangler secret put APP_KEY               # beliebiger langer Zufallswert, kommt in die App-Einstellungen
npx wrangler secret put PI_KEY                # für Upload und Protokoll vom Pi
cd .. && npm run build && npm --workspace proxy run deploy
```

Der Worker liefert unter derselben Adresse auch die App aus (`app/dist`). Decks, die der Pi hochlädt, gibt es nur mit Schlüssel: Handouts sind Material der Dozenten.

## Lokal testen

```bash
printf 'ANTHROPIC_API_KEY=test\nANTHROPIC_BASE_URL=http://127.0.0.1:8899\nAPP_KEY=app-test\nPI_KEY=pi-test\n' > .dev.vars
node test/mock-anthropic.mjs 8899 &           # Ersatz für die Messages-API
npx wrangler dev --port 8790 &
node test/e2e.mjs                             # 18 Prüfungen: Schlüssel, Deck, WebSocket, C/D, Protokoll, Cache, Fallback
```

In der App dann `http://127.0.0.1:8790` als Proxy-Adresse und `app-test` als Schlüssel eintragen.
