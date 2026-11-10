---
name: Live-Overlay
description: Jede Folie als gesetzter Lehrbuch-Absatz auf Tintenblau, mit einem Blick lesbar im dunklen Hörsaal.
colors:
  ground: "oklch(0.165 0.028 262)"
  ground-raised: "oklch(0.2 0.032 262)"
  rule: "oklch(0.31 0.03 262)"
  rule-strong: "oklch(0.42 0.03 262)"
  ink: "oklch(0.93 0.02 85)"
  ink-2: "oklch(0.8 0.02 85)"
  ink-3: "oklch(0.68 0.025 262)"
  here: "oklch(0.84 0.155 88)"
  here-ink: "oklch(0.2 0.04 88)"
  here-dim: "oklch(0.6 0.1 88)"
  marker: "oklch(0.86 0.17 95)"
  exam: "oklch(0.7 0.165 32)"
  unsure: "oklch(0.62 0.02 262)"
typography:
  card-glance:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontSize: "31px"
    fontWeight: 400
    lineHeight: 1.28
  card-glance-split:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.28
  card-more:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.45
  card-sub:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.4
  marginalia:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.4
  run-in-head:
    fontFamily: "STIX Two Text, STIX Symbols, Noto Serif, serif"
    fontWeight: 600
  chrome-action:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    fontFeature: "tnum"
  chrome-body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    fontFeature: "tnum"
  chrome-label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  tick: "1px"
  control: "8px"
  button: "10px"
  dialog: "14px"
spacing:
  gap-tight: "8px"
  pad-split: "16px"
  gap-card: "20px"
  pad: "24px"
  pad-card: "28px"
components:
  button-action:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.chrome-action}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "56px"
  button-action-hover:
    backgroundColor: "{colors.ground-raised}"
  button-action-pressed:
    backgroundColor: "{colors.rule}"
  button-primary:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome-action}"
    rounded: "{rounded.button}"
    height: "56px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    size: "48px"
  input-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome-body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "48px"
  register-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    typography: "{typography.chrome-label}"
    padding: "0 12px"
  register-tab-current:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.card-glance}"
    padding: "28px 28px 20px"
  settings-dialog:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    width: "min(640px, calc(100vw - 32px))"
---

# Design System: Live-Overlay

## Overview

**Creative North Star: "Der Lehrbuch-Satz auf Tintenblau"**

Live-Overlay setzt jede Folie als Absatz eines Lehrbuchs: fetter Einlauf, kursives Thema, Endzeichen. Live läuft kein Text durch, es steht eine gesetzte Karte da. Die Welt ist ein einziger tintenblau-schwarzer Grund, auf dem Licht nur aus warmweißem Text und einer Akzentfarbe kommt. Sie ist für den dunklen Hörsaal gebaut, für einen Blick von zwei bis drei Sekunden aus Armlänge, und hält deshalb Nachtsicht-Disziplin: keine hellen Flächen, die Folie selbst wird invertiert gezeigt.

Die Fläche wird durch 1-px-Haarlinien in Zonen geteilt, nicht durch Kästen oder Schatten. Oben liegt das Daumenregister, links die Nachtfolie, rechts die Marginalspalte mit Karte und Live-Notizen, unten „Gleich: …“ und zwei große Knöpfe. Die Dichte ist niedrig, die Schrift groß. Bedeutung trägt die Farbe nur in drei Rollen: Gelb heißt „hier bist du“, Korrekturrot heißt Klausur, Schiefer heißt unsicher.

Abgelehnt ist der Standard der Kategorie: eine dunkle Transkript-Spalte mit laufendem Text, Chat-Blasen und blauem Akzent.

**Key Characteristics:**
- Ein Grund (Tintenblau-Schwarz), Text in Papier-Warmweiß in drei Stufen.
- Gelb ausschließlich für „hier bist du“.
- Zonen nur durch 1-px-Haarlinien; keine Elevation, keine Schatten.
- Karten und Marginalien in STIX Two Text als Lehrbuch-Umgebung; Chrome in Atkinson Hyperlegible Next mit Tabellenziffern.
- Daumenregister als Signatur: Fortschritt und Position in einem.
- Bewegung nur als Zustandswechsel, 150–250 ms.

## Colors

Ein dunkler, leicht blauer Grund mit warmweißer Tinte und drei bedeutungstragenden Akzenten, die sich nie vertreten.

### Primary
- **Springer-Gelb** (`here`): „Hier bist du.“ Der aktuelle Folienstrich im Register, der Zustandspunkt „folgt“, der Randstrich einer frischen Karte, der aktuelle Abschnitt im Rückblick, die kurz aufleuchtende Unterstreichung eines gerade gefallenen Begriffs auf der Folie, S-Pen-Tinte und Einkreisung, Fokusring und Textauswahl.
- **Gedämpftes Gelb** (`here-dim`): Ruhezustand des Zustandspunkts, wenn kein anderer Zustand greift.
- **Gelb-Tinte** (`here-ink`): Text auf gelber Auswahl, sonst nirgends.
- **Textmarker-Gelb** (`marker`): nur die Markierungsrechtecke auf der Nachtfolie (Mischmodus multiply), damit die markierte Stelle wie mit einem Textmarker gezogen wirkt.

### Secondary
- **Korrekturrot** (`exam`): Klausur. Der rote Strich einer Folie mit Klausurhinweis im Register (bleibt auch, wenn die Folie vorbei ist; ist sie aktuell, teilt sich der Strich halb gelb, halb rot) und der fette Einlauf „Klausur, HH:MM.“ in Karte und Live-Notiz.

### Tertiary
- **Schiefer** (`unsure`): unsicher. Der hohle Zustandspunkt bei „unsicher“ und „manuell“.

### Neutral
- **Tintenblau-Schwarz** (`ground`): der einzige Grund, auch hinter der Folie und im aktiven Reiter.
- **Gehobener Grund** (`ground-raised`): Registerleiste, Einstellungsdialog, Toast, Hover von Knöpfen. Nur eine Stufe über dem Grund, nie hell.
- **Haarlinie** (`rule`): alle Zonentrennungen, Registerstriche ohne Status, gedrückte Knöpfe.
- **Kräftige Haarlinie** (`rule-strong`): Knopf- und Feldkonturen, erledigte Registerstriche, Scrollleiste.
- **Papierweiß** (`ink`): Kernsatz, Köpfe, aktive Beschriftung.
- **Papierweiß zweite Stufe** (`ink-2`): Beispiel, Regel, Notiztext, kursives Thema, Icons.
- **Blaugrau** (`ink-3`): Metatext, inaktive Reiter, Endzeichen ◇, „Laut Folie nicht klausurrelevant“.

### Named Rules
**The Here Rule.** Gelb bedeutet nur „hier bist du“ (oder „hier ist der Prof“). Gedrückte Knöpfe, Hauptaktionen und Hinweise bekommen kein Gelb.

**The Three Meanings Rule.** Gelb, Korrekturrot und Schiefer tragen je genau eine Bedeutung. Keine Farbe springt für eine andere ein, keine vierte Akzentfarbe kommt hinzu.

**The Night-Vision Rule.** Licht kommt nur aus Text und Akzent. Keine Fläche ist heller als `ground-raised`.

## Typography

**Text Font:** STIX Two Text (400, 400 italic, 600), selbst gehostet und reduziert, mit STIX Two Math als „STIX Symbols“ für mathematische Zeichen; Rückfall Noto Serif, serif.
**Chrome Font:** Atkinson Hyperlegible Next (400, 600) über @fontsource; Rückfall system-ui.

**Character:** Eine Buchschrift für alles, was gelesen wird, und eine Lesbarkeits-Grotesk für alles, was bedient wird. Die Grenze ist streng: Karte, Marginalie, Tafel-Hinweis und Leerzustand sind STIX; Register, Knöpfe, Einstellungen, Verweise und Metazeilen sind Atkinson. Überall gelten Tabellenziffern (`font-variant-numeric: tabular-nums` am body).

### Hierarchy
- **Kernsatz** (`card-glance`, 400, 31 px, 1.28; im Splitscreen `card-glance-split`, 26 px): der eine Satz der Karte, `text-wrap: pretty`.
- **Genauer / Rückblick** (`card-more`, 22 px, 1.45; auch der Rückblick-Kopf): ausführliche Fassung auf Anfrage.
- **Beispiel, Regel** (`card-sub`, 21 px, 1.4; 19 px im Splitscreen).
- **Marginalie** (`marginalia`, 19 px, 1.4; Klausur-Marginalie in der Karte 20 px).
- **Einlauf** (`run-in-head`, 600, aufrecht): der fette Kopf jedes Absatzes.
- **Leerzustand** (STIX 600, 34 px, 1.15) und **Tafel-Hinweis** (STIX 400, 30 px, 1.25).
- **Chrome-Aktion** (`chrome-action`, 600, 17 px): Knopfbeschriftung, „Folie **7** / 12“ (Ziffer 17 px 600, Rest 15 px).
- **Chrome-Text** (`chrome-body`, 16 px): Felder, Abschnittsliste im Rückblick.
- **Chrome-Label** (`chrome-label`, 14 px, Zeilenhöhe 1): Reiter, Zustand, Hinweise; Status 13 px.

### Named Rules
**The Two Hands Rule.** STIX für das, was man liest; Atkinson für das, was man bedient. Eine Karte enthält Atkinson nur für Metazeilen (Verweis, „nicht klausurrelevant“).

**The Unbroken Formula Rule.** Formeln brechen nicht mitten im Ausdruck: Leerzeichen in Klammern und vor Operatoren (= → ↦ ≠ ≤ ≥ + − · ×) werden geschützt, nach = und → nur, wenn der rechte Teil kurz ist (≤ 10 Zeichen). Umbruch bleibt nach + und nach Satzenden.

## Layout

Ein dreizeiliges Raster über die volle Höhe (`100dvh`): Register (56 px), Bühne (1fr), Fußleiste (min. 76 px). Die Bühne teilt sich in Folie (1fr) und Marginalspalte (`clamp(360px, 38vw, 520px)`); die Fußleiste übernimmt dieselbe Spaltung, sodass „Gleich: …“ unter der Folie und die Knöpfe unter der Karte stehen. Die Folie wird in ihrem Seitenverhältnis zentriert und auf die verfügbare Höhe begrenzt.

Satzrhythmus der Karte: Innenabstand 28 / 28 / 20 px, Absätze 20 px auseinander, nach dem Kernsatz 24 px. Live-Notizen liegen unter einer Haarlinie, höchstens drei, höchstens 40 % der Spaltenhöhe; Notizen älter als 20 s fallen beim Folienwechsel weg. Läuft die Karte über, blendet der untere Rand über 40 px aus.

### Splitscreen (≤ 900 px)
- Folie oben (höchstens 46 dvh), Karte darunter; die Haarlinie wechselt von links nach oben, der frische Randstrich ebenso.
- Seitenabstand 16 px, Karte 18 / 20 / 14 px, Absätze 14 px.
- Im Register trägt nur der aktuelle Reiter seinen Namen; die anderen bleiben schmale Reiter mit Strichen. Zustands- und Statustext verschwinden, Punkt und Icons bleiben.
- „Gleich: …“ steht als schmale Zeile (15 px) über den Knöpfen; die Fußleiste ist einspaltig.
- Ist ein Panel (Genauer, Rückblick, S-Pen-Stelle) offen, gehören ihm die Live-Notizen; sie kommen mit der Karte zurück.

### Named Rules
**The Hairline Zoning Rule.** Zonen trennt eine 1-px-Linie in `rule`. Keine Kästen um Inhalte, keine farbigen Panels, keine Abstände als einziger Trenner zwischen Register, Folie, Marginalspalte und Fußleiste.

## Elevation & Depth

Das System ist flach. Tiefe entsteht nur durch zwei Grundstufen (`ground`, `ground-raised`) und Haarlinien. Der aktive Reiter senkt sich auf `ground` und schließt mit einer 1-px-Brücke nahtlos an die Seite an, statt sich zu heben. Modale Tiefe (Einstellungen) entsteht durch eine Kontur in `rule-strong` und einen abgedunkelten Hintergrund (`oklch(0.1 0.02 262 / 0.7)`), nicht durch Schatten.

Inset-Ringe sind Zeichnung, keine Elevation: Der hohle Zustandspunkt („unsicher“, „manuell“) und die offenen Abschnittsringe im Rückblick werden mit `inset 0 0 0 2px` bzw. `1.5px` gezogen.

### Named Rules
**The No-Lift Rule.** Kein Element wirft einen Schatten oder schwebt. Was aktiv ist, wird heller im Text oder bekommt eine kräftigere Kontur.

## Shapes

Weich, aber zurückhaltend: Registerstriche 1 px gerundet und 6 px hoch, Felder und Icon-Knöpfe 8 px, Aktionsknöpfe und Toast 10 px, Dialog 14 px, Punkte und Ringe rund. Konturen sind immer 1 px; Fokus ist ein 2-px-Ring in `here` mit 2 px Abstand (1 px bei Feldern). Die einzige Signaturform ist der Reiter des Daumenregisters, dessen Breite proportional zur Folienzahl seines Abschnitts ist (`flex: <Folienzahl> 1 0`).

## Components

### Daumenregister (Signatur)
Volle Breite, 56 px hoch, auf `ground-raised`, unten eine Haarlinie. Jeder Abschnitt ist ein Reiter, so breit wie seine Folienzahl, rechts durch eine Haarlinie begrenzt; darin der Name (14 px) und darunter ein 6 px hoher Strich je Folie mit 2 px Lücke.
- **Striche:** offen `rule`, erledigt `rule-strong`, aktuell `here`, Klausurfolie `exam` (dauerhaft), aktuelle Klausurfolie halb gelb, halb rot.
- **Reiter:** offen `ink-3`, erledigt `ink-2` mit Haken (lucide check, 15 px), aktuell `ink` 600 auf `ground`, nach unten in die Seite geöffnet.
- **Rechts:** „Folie **n** / N“, Zustandspunkt (9 px) mit Zustandswort, Statushinweise („Ton unklar“, offline), Mikrofon und Einstellungen als 48-px-Icon-Knöpfe. Ein Tipp auf einen Reiter springt zur ersten Folie des Abschnitts.

### Karte (Lehrbuch-Umgebung)
Jeder Absatz beginnt mit einem fetten, aufrechten Einlauf, dem Punkt folgt der Text: **Definition** *(Thema)*. Kernsatz. Das kursive Thema in Klammern steht nur, wenn es nicht schon dem Kopf entspricht und die Folie kein Titel oder Abschnitt ist.
- **Köpfe:** Titel, Abschnitt, Worum es geht, Definition, Satz, Beispiel, Aufgabe, Bemerkung, Zusammenfassung.
- **Beispiel:** „**Beispiel** *(ausgedacht)*. …“, der Zusatz kursiv, wenn das Beispiel nicht von der Folie stammt.
- **Regel / Lösungsweg:** „**Regel**. …“; bei Aufgaben heißt derselbe Absatz „**Lösungsweg**. …“.
- **Endzeichen:** der letzte Absatz endet mit „ ◇“ in `ink-3`, 0,8 em.
- **Nicht klausurrelevant:** Kernsatz und Absätze treten auf `ink-3` zurück (Köpfe `ink-2`), darunter eine Atkinson-Zeile mit der Begründung.
- **Klausurhinweis:** am Ende der Karte eine Marginalie „**Klausur, HH:MM.** …“ mit rotem Einlauf.
- **Panels:** „**Genauer** *(Thema)*. …“, darunter nach Haarlinie „**Mit dem Vortrag**. …“; „**Zu dieser Stelle**. …“ für die S-Pen-Einkreisung; Rückblick mit nummerierten Punkten (Nummer 600 in `ink-3`) und Abschnittsliste mit Haken, Ring und gelbem Ring für den aktuellen Abschnitt. Ladeplatzhalter sind zwei Balken in `rule` (70 % und 45 % breit).

### Marginalien (Live-Notizen)
Format „**Kopf, HH:MM.** Text“, STIX 19 px, neueste oben. Köpfe: Prof, Klausur, Verweis, Tafel, Nebengespräch. Prof-Notizen in `ink-2` mit `ink`-Kopf; Klausur mit Kopf in `exam`; „nicht in der Klausur“, Verweis, Tafel und Nebengespräch treten auf `ink-3` zurück (Kopf `ink-2`).

### Nachtfolie
Das Folienbild läuft durch den SVG-Filter `#night`: invertieren, Farbton um 180° zurückdrehen, Sättigung 0,5, Tonwerttabelle `0 0.14 0.24 0.34 0.92` für helle Mitteltöne, sodass Weiß (Schrift) hell bleibt und Beamerblöcke nicht leuchten. Mischmodus `screen` auf eigenem `ground`, damit Schwarz im Grund verschwindet. Die Einstellung „Original“ zeigt die Folie unverändert, aber auf 62 % Helligkeit. Darüber liegen Markierungen (`marker`, multiply), die gelbe Begriffs-Unterstreichung (4 s sichtbar) und die S-Pen-Tinte (3 px, rund, `here`). Ohne Bild erscheint die Folie als STIX-Text (19 px, `ink-2`) in einer Haarlinien-Kontur.

### Zustände
Der Zustand steht als `data-state` am body und als Punkt mit Wort im Register.
- **folgt:** Punkt voll gelb.
- **unsicher:** hohler Punkt in Schiefer; das Tool sagt „unsicher“ statt zu raten.
- **manuell** („von Hand“): hohler Schieferpunkt; der Knopf „Folgen“ erscheint im Register (Kontur `rule-strong`, 8 px).
- **tafel:** Punkt `ink-3`. Alles außer dem Register dunkelt auf 22 % ab, die Karte verschwindet, an ihrer Stelle „Prof zeichnet – schau nach vorn.“ (30 px) mit kleiner Zeile in `ink-3`. Knöpfe bleiben bedienbar.
- **fresh:** Eine neue Karte färbt die Haarlinie zwischen Folie und Marginalspalte gelb, bis getippt wird oder 8 s vergehen.
- **Kartenwechsel:** Eine erkannte neue Folie wechselt die Karte bevorzugt in einer Sprechpause, spätestens nach 4 s.

### Buttons
- **Aktion:** 56 px hoch, 10 px Radius, 1-px-Kontur `rule-strong`, transparent, Atkinson 600 17 px, Icon (lucide, 22 px, Strich 1,9) links. Hover `ground-raised`, aktiv `rule`. Gedrückt (Panel offen): Kontur `ink-2` auf `rule`. Deaktiviert 45 % Deckkraft.
- **Hauptaktion:** Kontur `ink-2` auf `ground-raised`, Hover `rule`. Kontur statt Füllung.
- **Icon-Knopf:** 48 × 48 px, 8 px, transparent in `ink-2`; Hover `rule`, aktiv `rule-strong`; gedrückt nur hellere Ikone (`ink`), keine Kachel.

### Inputs / Fields
48 px hoch, 8 px Radius, Kontur `rule-strong` auf `ground`, Atkinson 16 px; Label 15 px 600 in `ink-2` darüber, Hinweis 14 px in `ink-3` darunter. Fokus: 2-px-Ring in `here`, 1 px Abstand.

### Einstellungsdialog und Toast
Dialog bis 640 px breit, 14 px Radius, Kontur `rule-strong` auf `ground-raised`, Titel 22 px, Felder zweispaltig; Aktionsleiste klebt unten unter einer Haarlinie. Toast unten mittig über der Fußleiste, 10 px Radius, Kontur `rule-strong`, 15 px `ink-2`, blendet in 200 ms ein.

### Bewegung
Nur Zustandswechsel, nie Dekoration: 150 ms für Knopfflächen und -konturen, 200 ms für Registerstriche, Begriffs-Unterstreichung und Toast, 250 ms für Folien- und Marginalspalten-Deckkraft, die Haarlinie der frischen Karte und Kopffarben. Kurve `cubic-bezier(0.16, 1, 0.3, 1)`. Bei `prefers-reduced-motion: reduce` sind alle Übergänge 0 ms.

## Do's and Don'ts

### Do:
- **Do** setze jeden Karten- und Notizabsatz mit fettem, aufrechtem Einlauf und Punkt („**Definition** *(Thema)*. …“, „**Prof, 10:06.** …“) und schließe die Karte mit ◇.
- **Do** halte Gelb (`here`) für „hier bist du“ allein: aktueller Strich, aktiver Abschnitt, Punkt „folgt“, frischer Randstrich, gefallener Begriff, Fokus.
- **Do** markiere Klausur doppelt: roter Strich im Register und rote Marginalie in der Karte.
- **Do** trenne Zonen mit 1-px-Haarlinien in `rule`; Konturen in `rule-strong`.
- **Do** zeige Folien als Nachtfolie über den Filter `#night` auf `ground`.
- **Do** halte Aktionsknöpfe 56 px hoch und Icon-Knöpfe mindestens 48 px.
- **Do** begrenze Bewegung auf Zustandswechsel von 150–250 ms und respektiere `prefers-reduced-motion`.
- **Do** nutze Tabellenziffern in jeder Zahl, die sich ändert (Folie n / N, Uhrzeiten).

### Don't:
- **Don't** fülle Flächen hell: keine Knopf-, Chip- oder Bannerfüllung in Gelb, Rot oder Weiß; Hauptaktionen bekommen eine Kontur.
- **Don't** setze Schatten oder Elevation; Inset-Ringe für hohle Punkte sind die einzige erlaubte `box-shadow`-Verwendung.
- **Don't** setze Etiketten über Überschriften oder Absätze (kein „KLAUSUR“-Label über dem Text); der Kopf läuft in den Absatz ein.
- **Don't** lass Text live durchlaufen oder setze Chat-Blasen; die Karte steht gesetzt da.
- **Don't** verwende Korrekturrot für etwas anderes als Klausur oder Schiefer für etwas anderes als unsicher.
- **Don't** brich Formeln mitten im Ausdruck um.
- **Don't** mische Atkinson in den Lesetext der Karte oder STIX ins Chrome.
