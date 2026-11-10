# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Die Oberfläche ist eine Web-App in TypeScript. Sie läuft entweder in einer nativen Android-Hülle als WebView (Weg 1, AccessibilityService für den Ton) oder als installierte Web-App in Chrome (Weg 2). Die Designsprache bleibt in beiden Fällen dieselbe Web-Oberfläche.)

## Stack

- App: Vanilla TypeScript + Vite, kein UI-Framework. SVG-Ebene für Markierungen, vorbereitete PNGs je Folie.
- Proxy: Cloudflare Worker mit Durable Object (Sitzung, Live-Notiz, Abruf-Funktionen, Kurzzeit-Token für STT).
- Vorbereitung und Nachbereitung: Python (PyMuPDF, Anthropic SDK), läuft auf dem Raspberry Pi des Lernbegleiters.
- Android-Hülle: Kotlin, AccessibilityService (`VOICE_RECOGNITION`) + WebView. Als Gerüst für den Mikrofon-Spike gebaut, Test auf dem echten Gerät steht aus.

## Users

Ein Nutzer: Leonhard, B.Sc. Informatik an der Uni Potsdam (ab WiSe 2026/27). Er sitzt in der Vorlesung (z. B. Mathematik für Informatik II) und will dem Prof folgen. Das Tablet zeigt ihm die aktuelle Folie und übersetzt sie in seine Sprache: ein einfacher Satz, ein Zahlenbeispiel, eine Markierung. Er schaut nur kurz aufs Tablet und hört dabei weiter zu.

## Product Purpose

Ein Live-Overlay für Vorlesungen. Für jede Folie gibt es eine vorbereitete Karte (höchstens 12 Wörter, Beispiel, Regel). Live erkennt das Tool, wo der Prof gerade ist, und ergänzt nur, was nicht auf der Folie steht: Klausurhinweise, eigene Bilder des Profs, Verweise auf andere Kurse. Erfolg heißt: Leonhard verliert seltener den Faden und muss seltener „Faden verloren" drücken. Das Tool darf nicht mehr ablenken, als es hilft.

## Positioning

Etwa 80 % der Übersetzung entsteht vor der Vorlesung aus dem Handout. Live muss das Tool nur die Position erkennen, ohne Sprachmodell und in unter 2 Sekunden. Dazu kommt ein persönliches Sprachprofil („meine Sprache"). Ein allgemeines Transkriptions- oder Notiz-Tool zeigt Text in Echtzeit, dieses Tool zeigt bewusst weniger.

## Operating Context

- Gerät im Hörsaal: nur ein Samsung Galaxy Tab S9 mit S Pen. Es steht aufrecht am vorderen Tischrand, im Querformat als Vollbild oder im Android-Splitscreen (halbe Breite, z. B. neben Samsung Notes).
- Dunkler oder halbdunkler Hörsaal mit Beamer, Nachbarn links und rechts. Ein heller Bildschirm stört.
- TwinMind läuft auf dem Tablet und bleibt das Archiv für Transkripte. Das Overlay darf TwinMind nicht ersetzen oder stumm schalten.
- Keine Fotos, keine Kamera im Hörsaal.
- Handouts kommen aus Moodle, oft erst am Vorlesungstag (im Test um 09:28, Vorlesung um 14:00).
- Der Lernbegleiter (Raspberry Pi zu Hause) übernimmt Vor- und Nachbereitung und hängt die Ergebnisse an die Wochen-Quest am Sonntag an.
- Der Hörsaal kann ohne WLAN sein: Phase 1 muss offline laufen, für Live gibt es den Handy-Hotspot.

## Capabilities and Constraints

- Schichten: A Vorab-Karte (0 s) · B Sofort-Erkennung im Browser (< 2 s) · C Live-Notiz mit kleinem Modell (4–8 s) · D auf Abruf: „?", „Faden verloren", S-Pen-Kreis (5–15 s).
- Zustände der App: `folgt`, `unsicher`, `tafel`, `pause`, `manuell`.
- Bedienung: Mit dem Finger wischen = Folie wechseln, zwei Knöpfe mit mindestens 56 px Höhe. Mit dem S Pen einkreisen = „?" zu dieser Stelle. Stift und Finger werden über `pointerType` unterschieden.
- Regeln für Inhalte: `glance` höchstens 12 Wörter, Beispiel höchstens 25 Wörter, erfundene Beispiele als „ausgedacht" markieren. Aufgaben-Folien zeigen keine Lösung, nur einen Hinweis zum Lösungsweg. Folien, die nicht klausurrelevant sind, bekommen eine graue Karte.
- Kein Dauer-Audio. Kein Ton und keine Vibration beim Kartenwechsel, nur ein Farbwechsel am Rand.
- Fachbegriffe sind deutsch, so wie sie auf der Folie stehen.
- Noch offen: Erlaubnis der Dozenten für die Live-Transkription. Weg 1 oder Weg 2 (entscheidet der Spike). Welcher STT-Anbieter (Standard: AssemblyAI).

## Evidence on Hand

- Implementierungsplan vom 10.11.2026 mit Messung und Simulation an der echten Vorlesung.
- Handout „Lineare Abbildungen und Matrix-Matrix-Multiplikation" (34 Folien) und das TwinMind-Transkript vom 10.11.2026. Beide werden nur lokal als Testdaten genutzt und nicht ins Repo committet: Sie sind Material der Dozenten.
- Es gibt keine Nutzerstudien und keine Messwerte zur Ablenkung. Solche Werte nicht erfinden.

## Product Principles

1. Hören hat Vorrang. Was den Prof übertönt, fliegt raus.
2. Lieber nichts zeigen als Unsinn. `none` und `unsicher` sind gültige Ergebnisse.
3. Vorab statt live. Was sich vorbereiten lässt, wird vorbereitet.
4. Ziehen statt drücken. Ausführliches gibt es nur auf Wunsch.
5. Die App funktioniert ohne Server. Fällt eine Schicht aus, laufen die anderen weiter.

## Accessibility & Inclusion

- Lesbar in 2–3 Sekunden bei einem Blick aus Armlänge und schräg von oben. Großer Text für Karten, hoher Kontrast auf dunklem Grund ohne Blendung.
- Touch-Ziele mindestens 56 px.
- Keine Bewegung, die den Blick zieht. `prefers-reduced-motion` respektieren.
