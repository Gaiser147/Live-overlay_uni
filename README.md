# Live-Vorlesungs-Overlay

Tablet-App für die Vorlesung. Sie zeigt die aktuelle Folie und daneben eine Karte „in deiner Sprache“: einen Kernsatz mit höchstens 12 Wörtern, ein Zahlenbeispiel und eine Regel. Live erkennt sie, wo der Prof gerade ist, und ergänzt nur das, was nicht auf der Folie steht: Klausurhinweise, eigene Bilder des Profs, Verweise auf andere Kurse. Alles Ausführliche gibt es nur auf Knopfdruck. Grundlage ist der Implementierungsplan vom 10.11.2026.

```
prep/      Vorbereitung (Pi): Handout → Folienbilder, Textblöcke → Karten (deck.json)
app/       Tablet-App (Vanilla TypeScript + Vite), offline-fähig
proxy/     Cloud-Proxy (Cloudflare Worker + Durable Object): Token, Live-Notiz, „Genauer“, Protokoll
post/      Nachbereitung (Pi): „?“-Liste, Klausurhinweise, Wiederholungsfragen, Heimfahrt-Text
android/   Hülle für Weg 1: AccessibilityService nimmt parallel zu TwinMind auf, WebView zeigt die App
shared/    Datenformat (deck.json) und Nachrichten App ↔ Proxy
test/      Replay: spielt ein Transkript im Originaltempo durch den Folien-Tracker
profile.md Sprachprofil, wird in jeden Modellaufruf eingefügt
```

## Schnell ausprobieren (ohne Schlüssel, ohne Mikrofon)

```bash
npm install
npm run dev                       # → http://localhost:5173/?demo
```

`?demo` lädt eine **synthetische** Demo-Vorlesung (12 erfundene Folien zu linearen Abbildungen) und spielt ein erfundenes Transkript ab. Du siehst dabei Folienwechsel, Klausurhinweis, Tafelmodus und Verweise. `&speed=6` spielt sechsmal so schnell. Ohne `?demo` blätterst du von Hand: wischen, Pfeiltasten oder Tipp auf einen Abschnitt im Register. Am Desktop wirkt Shift + Maus wie der S Pen.

## Die Oberfläche

Die Gestaltung folgt der Richtung „Lehrbuch-Satz“ (siehe `app/DESIGN.md` und `app/.impeccable/surfaces/index-html.md`).

- **Daumenregister** oben: ein Reiter je Abschnitt, so breit wie seine Folienzahl, darin ein Strich pro Folie. Die aktuelle Folie ist gelb, Folien mit Klausurhinweis bleiben rot.
- **Folie** links als Nachtfolie: invertiert, Navigationsleiste und Fußzeile abgeschnitten, helle Flächen gedämpft. Markierungen sehen aus wie Textmarker.
- **Karte** rechts als Lehrbuch-Absatz: „**Definition** *(Kern)*. Kern = alles, was auf 0 landet.“ Darunter Beispiel (ausgedacht) und Regel. Eine neue Karte färbt die Trennlinie gelb, bis du hinschaust oder 8 s vergehen. Kein Ton, kein Blinken.
- **Genauer** zeigt sofort die vorbereitete Erklärung und darunter eine frische, die zum gerade Gesagten passt (über den Proxy). **Faden verloren** zeigt „Du bist bei Folie X“, drei Punkte und den Stand der Abschnitte.
- **S Pen**: Eine Stelle einkreisen heißt „?“ genau zu diesem Textblock. Mit dem Finger wischst du zum Blättern. Danach folgt der Tracker 60 s lang nicht, oder bis du auf „Folgen“ tippst.
- **Tafelmodus**: Die Karte verschwindet, dort steht nur noch „Prof zeichnet – schau nach vorn.“
- **Splitscreen** (halbe Breite, z. B. neben Samsung Notes): Folie oben, Karte darunter, Knöpfe unten.

## Einrichten für die echte Vorlesung

### 1. Proxy (einmalig)

Siehe `proxy/README.md`. Kurz: KV-Namespace anlegen, Geheimnisse setzen (`ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY` und/oder `DEEPGRAM_API_KEY`, `APP_KEY`, `PI_KEY`), dann `npm run build && npm --workspace proxy run deploy`. Der Worker liefert auch die App selbst aus.

### 2. Vorbereitung auf dem Pi (am Vorlesungstag)

```bash
cd prep && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export MOODLE_URL=https://moodle2.uni-potsdam.de MOODLE_TOKEN=…   # wie im uni_mcp
export ANTHROPIC_API_KEY=… PROXY_URL=https://live-overlay.….workers.dev PI_KEY=…
.venv/bin/python fetch_handout.py --course-id 50680 --pattern 'w\d+_handout\.pdf' \
    --out ../lectures/mathe-info-2/2026-11-17/handout.pdf --watch-until 13:30
.venv/bin/python run.py --course mathe-info-2 --date 2026-11-17 \
    --pdf ../lectures/mathe-info-2/2026-11-17/handout.pdf --upload
```

`run.py` gibt die Deck-URL aus. Die trägst du in der App unter Einstellungen → Vorlesung ein, oder du rufst die App einmal mit `?deck=<url>` auf. Die Karten erzeugt Claude Sonnet 5.5, eine Anfrage pro Folie, parallel und mit Prompt-Cache, für 34 Folien rechnerisch unter 5 Minuten. Ohne `ANTHROPIC_API_KEY` entstehen heuristische Karten: Der Tracker funktioniert damit, die Karten sind aber nur eine Notlösung.

### 3. Im Hörsaal

App öffnen (installiert als Web-App oder in der Android-Hülle) und unter Einstellungen die Tonquelle wählen:
- **Android-Dienst** (Weg 1): TwinMind läuft parallel weiter, siehe `android/README.md`.
- **Mikrofon im Browser** (Weg 2): TwinMind läuft dann nicht. Mit „Ton zusätzlich speichern“ entsteht eine Datei für den späteren Upload zu TwinMind.

Dann aufs Mikrofon-Symbol oben rechts tippen. Ohne Netz laufen Karten und Blättern weiter.

### 4. Nachbereitung (Pi, ca. 30 min nach Ende)

```bash
.venv/bin/python ../post/summarize.py --deck ../lectures/mathe-info-2/2026-11-17/deck.json \
    --transcript ../lectures/mathe-info-2/2026-11-17/twinmind.txt
```

Das Skript holt das Protokoll vom Proxy und schreibt `post/nachbereitung.md`, `post/heimfahrt.md` (Text für die Audio-Zusammenfassung) und `post/quest.json` für die Wochen-Quest. Außerdem ergänzt es `profile.md`.

## Tests

```bash
npm test                          # Vitest: Tracker, Textabgleich, Deck-Regeln, Proxy-Logik (24 Tests)
prep/.venv/bin/python -m pytest prep/tests
npm run replay:demo               # Replay der synthetischen Demo
npm run replay:real               # Replay der echten Vorlesung (nur lokal, siehe unten)
node proxy/test/e2e.mjs           # Proxy Ende-zu-Ende gegen wrangler dev + Mock (Anleitung in proxy/README.md)
```

## Stand der Abnahme (ehrlich)

| Phase | Kriterium | Stand |
|---|---|---|
| 1 | gültiges deck.json, ≤ 12 Wörter, ausgedacht markiert, Aufgaben ohne Lösung | geprüft (`validateDeck`, pytest). Claude-Modus geschrieben, aber ohne API-Schlüssel nicht gelaufen. |
| 1 | Markierungen auf dem richtigen Textblock | bbox kommt aus PyMuPDF; Demo sichtbar korrekt |
| 1 | App läuft ohne Netz | Service Worker cacht App, Schriften, Deck und Bilder. Auf dem Tablet noch nicht getestet. |
| 2 | ≥ 85 % richtige Folie | **nicht erreicht/messbar**: Demo-Transkript 81 %. Das TwinMind-Transkript vom 10.11. ergibt nur ~41 %, weil es lückenhaft ist (~27 Wörter/min, Absätze fehlen, Begriffe verfälscht) und die Referenzzeiten nur geschätzt sind. Die echte Abnahme braucht den Originalton, abgespielt durch den Streaming-Dienst. |
| 2 | Wechsel < 5 s | Demo im Mittel ~9 s ab Absatzbeginn. Gemessen wird ab dem Folienwechsel, das Kennwort fällt oft erst später. |
| 2 | kein Wechsel bei Nebengespräch und Kauderwelsch, Tafelmodus 14:38–14:40 | erfüllt (Demo und Replay vom 10.11.) |
| 3 | Notizen „Klausurhinweis“ (14:32) und „Schatten“ (15:01) | Klausur: Schicht B erkennt sie lokal. Schatten: Anfrage wird zur richtigen Zeit ausgelöst. Die Antwort kam im Test von einem Mock, nicht vom echten Modell. |
| 3 | Kosten < 1,50 $ | wird pro Aufruf protokolliert (`ev: cost`), `post/` summiert |

Echte Vorlesungsdaten (Handout-Text, TwinMind-Transkript, Referenz) liegen nur lokal unter `test/fixtures/2026-11-10/` und sind per `.gitignore` ausgeschlossen. Es ist Material der Dozenten.

## Offen / vor dem Einsatz

- **Erlaubnis der Dozenten** für Live-Transkription (Plan, Entscheidung 2). Ohne sie nur Phase 1.
- **Spike Mikrofon** (Phase 0) mit `android/` auf dem Tab S9: Bekommen TwinMind und der Dienst beide Ton?
- **STT-Anbieter**: Standard ist AssemblyAI `universal-streaming-multilingual` (0,15 $/h). Laut Doku unterstützen Keyterms sicher nur `universal-streaming-english`, `universal-3-5-pro` und `universal-3-6-pro` (0,45 $/h). Ob Keyterms bei multilingual wirken, zeigt das `Begin`-Ereignis (wird geloggt). Deepgram Nova-3 mit `keyterm` ist eingebaut.
- Preise im Proxy (`proxy/src/claude.ts`) und in `prep/make_deck.py` vor dem Einsatz prüfen.
- Phase 4 (S-Pen-Abschrift von Tafelformeln, Flüstersatz, lokale Transkription) ist nicht gebaut.
