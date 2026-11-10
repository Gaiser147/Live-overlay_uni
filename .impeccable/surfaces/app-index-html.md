---
version: 1
slug: "app-index-html"
primary_target: "app/index.html"
related_targets: []
---

# Surface: Live-Overlay (Tablet-App, Reiter „Live")

Mode: Operate. Ein Nutzer (Leonhard) in der Vorlesung, Galaxy Tab S9 aufrecht am Tischrand, Querformat 1280×800 CSS-px oder Splitscreen (≈ 640×800). Aufgabe: mit einem Blick von 2–3 s erfassen, wo der Prof ist und was die Folie in seiner Sprache bedeutet, dann wieder zuhören. Zustände: folgt, unsicher, tafel, pause, manuell; offline lauffähig.

## Direction contract

THESIS: Jede Folie wird als Lehrbuch-Absatz in Leonhards Sprache gesetzt. Abgelehnt wird der Standard der Kategorie: eine dunkle Transkript-Spalte mit Live-Text, Chat-Blasen und blauem Akzent. Live läuft hier kein Text durch. Es steht eine gesetzte Karte da.

OWN-WORLD: Grund Tintenblau-Schwarz (≈ oklch 0.17 0.03 260), Text Papier-Warmweiß, Springer-Gelb nur für „hier bist du" (aktuelle Folie, aktiver Abschnitt, Randmarke einer neuen Karte), Klausur in Korrekturrot, unsicher in Schiefergrau. Zonen trennen 1-px-Haarlinien, keine Kästen, keine Schatten (Raise aus dem Modulraster). Karten-Typo in STIX Two Text als Lehrbuch-Umgebung mit fettem Kopf („Definition." / „Beispiel (ausgedacht)." / „Regel." / „Aufgabe.") und Endzeichen ◇. Chrome-Typo in Atkinson Hyperlegible Next mit Tabellenziffern. Nachtsicht-Disziplin (Raise aus dem Sternatlas): keine hellen Flächen, die Folie wird invertiert gezeigt, Licht kommt nur aus Text und einer Akzentfarbe.

STORY: Leonhard schaut hoch zum Prof, kurz runter, liest höchstens 12 Wörter, sieht die markierte Stelle auf der Folie und schaut wieder hoch. Er vertraut dem Tool, weil es „unsicher" sagt statt zu raten. Mehr gibt es nur, wenn er „?" oder „Faden verloren" drückt oder mit dem S Pen einkreist.

FIRST VIEWPORT: Oben über die volle Breite das Daumenregister (40 px). Jeder Abschnitt ist ein Reiter, so breit wie seine Folienzahl (Raise aus dem Zoo-Plan). Darin ein Strich je Folie, die aktuelle Folie gelb, erledigte Abschnitte mit ✓. Rechts im Register „Folie 12 / 34" mit dem Zustandspunkt. Links (≈ 62 %) die invertierte Folie mit SVG-Markierung im Textmarker-Gelb. Rechts (≈ 38 %) die Marginalspalte: die Karte groß (glance 30 px), darunter Beispiel und Regel (20 px), darunter durch eine Haarlinie getrennt die Live-Notiz „Prof: …". Unten links „Gleich: …", unten rechts die Knöpfe [?] und [Faden verloren], je 56 px hoch. Eine neue Karte zeigt einen gelben Randstrich an der Marginalspalte. Er bleibt, bis Leonhard tippt oder 8 s vergehen (Raise aus der Bordkarte).

FORM: Lehrbuch-Satz, Platz 6 meiner Liste. seed:034521e169bc815a. Signatur-Bewegung: das Daumenregister als Fortschritts- und Positionsanzeige.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Offene Punkte

- Splitscreen bei halber Breite: Folie oben, Karte darunter, Knöpfe unten.
- Tafelmodus: alles bis auf das Register und „Prof zeichnet — schau nach vorn" auf ca. 25 % abgedunkelt.
