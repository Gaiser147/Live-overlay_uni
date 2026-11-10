"""Erzeugt ein synthetisches Beamer-Handout für Demo und Tests (keine echte Vorlesung).

Aufruf:
    python prep/make_demo_pdf.py test/fixtures/demo/demo-handout.pdf

Die Folien imitieren das Beamer-Layout (Navigationsleiste oben mit hervorgehobenem Abschnitt,
Fußzeile mit Seitenzahl), damit extract.py daran getestet werden kann. Inhalt: eigene, kurze
Standardbeispiele zu linearen Abbildungen.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf as fitz

W, H = 364.0, 273.0  # 128 × 96 mm, Beamer 4:3
SECTIONS = ["Einstieg", "Lineare Abbildungen", "Matrizen"]
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
]
BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]

NAVY = (0.10, 0.16, 0.33)
GREY = (0.55, 0.58, 0.66)
INK = (0.08, 0.08, 0.1)
BLUE = (0.12, 0.33, 0.70)
RED = (0.75, 0.16, 0.12)

SLIDES: list[dict] = [
    {"sec": 0, "title": "", "big": "Lineare Abbildungen (Demo)", "sub": "Synthetische Beispielfolien für das Live-Overlay\nKeine echte Vorlesung"},
    {"sec": 0, "title": "Warum linear?", "body": [
        "• Viele Probleme lassen sich durch lineare ersetzen.",
        "• Lineare Gleichungssysteme löst man schnell und sicher.",
        "• Drehen, Spiegeln und Strecken sind lineare Abbildungen.",
    ]},
    {"sec": 1, "title": "Lineare Abbildung", "box": ("Definition 1 (lineare Abbildung)", [
        "Eine Abbildung f : V → W heißt linear, wenn für alle",
        "x, y ∈ V und λ ∈ R gilt:",
        "      f(x + y) = f(x) + f(y)   und   f(λx) = λ f(x).",
    ]), "body": ["Insbesondere gilt immer f(0) = 0."]},
    {"sec": 1, "title": "Beispiel: Drehung um 90°", "body": [
        "f dreht jeden Pfeil um 90° gegen den Uhrzeigersinn.",
        "Gedreht und addiert ist dasselbe wie addiert und gedreht:",
        "      f(a) + f(b) = f(a + b).",
    ], "figure": "rotation"},
    {"sec": 1, "title": "Beispiel: Streckung", "body": [
        "f(x) = 2x streckt jeden Pfeil auf doppelte Länge.",
        "f(x + y) = 2x + 2y = f(x) + f(y).",
        "Der Beweis für allgemeine Faktoren ist nicht klausurrelevant.",
    ]},
    {"sec": 1, "title": "Kern", "box": ("Definition 2 (Kern)", [
        "Der Kern von f ist die Menge aller Vektoren, die auf 0 abgebildet werden:",
        "      ker f = { v ∈ V | f(v) = 0 }.",
    ]), "body": ["Der Kern ist immer ein Unterraum von V."]},
    {"sec": 1, "title": "Beispiel: Projektion auf die x-Achse", "body": [
        "f(x, y) = (x, 0) fällt das Lot auf die x-Achse.",
        "Der Schatten eines Pfeils bei Licht genau von oben.",
    ], "figure": "projection"},
    {"sec": 1, "title": "Aufgabe", "body": [
        "Welche Vektoren liegen im Kern der Projektion f(x, y) = (x, 0)?",
        "Begründen Sie Ihre Antwort.",
    ]},
    {"sec": 2, "title": "Abbildungsmatrix", "body": [
        "Jede lineare Abbildung f : Rᵐ → Rⁿ hat eine Matrix A mit f(x) = Ax.",
        "Die Spalten von A sind die Bilder der Einheitsvektoren:",
        "      A = ( f(e₁)  f(e₂)  …  f(eₘ) ).",
    ]},
    {"sec": 2, "title": "Matrix mal Vektor", "box": ("Rechenregel", [
        "Ax = x₁·(Spalte 1) + x₂·(Spalte 2) + … + xₘ·(Spalte m)",
    ]), "body": [
        "Beispiel:  ( 1  2 ; 0  −5 ) · (2, 1) = 2·(1, 0) + 1·(2, −5) = (4, −5).",
    ]},
    {"sec": 2, "title": "Matrixprodukt ist nicht kommutativ", "body": [
        "Im Allgemeinen gilt AB ≠ BA.",
        "Klammern dürfen versetzt werden: A(BC) = (AB)C.",
        "Die Reihenfolge der Faktoren darf man nicht tauschen.",
    ]},
    {"sec": 2, "title": "Zusammenfassung", "body": [
        "• Linear: Summen und Vielfache bleiben erhalten.",
        "• Kern: alles, was auf 0 landet.",
        "• Jede lineare Abbildung ist Matrix mal Vektor.",
    ]},
]


def _font(cands: list[str]) -> str | None:
    for c in cands:
        if Path(c).exists():
            return c
    return None


def draw_arrow(page: fitz.Page, p0: fitz.Point, p1: fitz.Point, color: tuple, label: str, font: str) -> None:
    page.draw_line(p0, p1, color=color, width=1.4)
    d = p1 - p0
    ln = (d.x**2 + d.y**2) ** 0.5 or 1
    ux, uy = d.x / ln, d.y / ln
    left = fitz.Point(p1.x - 6 * ux + 3 * uy, p1.y - 6 * uy - 3 * ux)
    right = fitz.Point(p1.x - 6 * ux - 3 * uy, p1.y - 6 * uy + 3 * ux)
    page.draw_polyline([left, p1, right], color=color, fill=color, width=1, closePath=True)
    page.insert_text(fitz.Point(p1.x + 3, p1.y - 2), label, fontsize=8, fontname="body", fontfile=font, color=color)


def build(out: Path) -> None:
    regular = _font(FONT_CANDIDATES)
    bold = _font(BOLD_CANDIDATES) or regular
    doc = fitz.open()
    total = len(SLIDES)
    for i, s in enumerate(SLIDES, start=1):
        page = doc.new_page(width=W, height=H)
        kw = {"fontname": "body", "fontfile": regular} if regular else {"fontname": "helv"}
        kwb = {"fontname": "bold", "fontfile": bold} if bold else {"fontname": "hebo"}
        # Navigationsleiste
        page.draw_rect(fitz.Rect(0, 0, W, 16), color=None, fill=NAVY)
        x = 8
        for k, name in enumerate(SECTIONS):
            col = (1, 1, 1) if k == s["sec"] else (0.55, 0.6, 0.75)
            page.insert_text(fitz.Point(x, 11), name, fontsize=6.5, color=col, **kw)
            x += 30 + len(name) * 3.6
        # Fußzeile
        page.draw_rect(fitz.Rect(0, H - 14, W, H), color=None, fill=(0.92, 0.93, 0.96))
        page.insert_text(fitz.Point(8, H - 5), "Demo · synthetische Folien", fontsize=5.5, color=GREY, **kw)
        page.insert_text(fitz.Point(W - 30, H - 5), f"{i}/{total}", fontsize=5.5, color=GREY, **kw)

        if "big" in s:
            page.insert_textbox(fitz.Rect(20, 90, W - 20, 130), s["big"], fontsize=16, align=1, color=NAVY, **kwb)
            page.insert_textbox(fitz.Rect(20, 135, W - 20, 175), s["sub"], fontsize=8, align=1, color=GREY, **kw)
            continue
        page.insert_text(fitz.Point(14, 36), s["title"], fontsize=12, color=NAVY, **kwb)
        y = 52
        if "box" in s:
            head, lines = s["box"]
            hbox = fitz.Rect(14, y, W - 14, y + 13)
            page.draw_rect(hbox, color=None, fill=BLUE)
            page.insert_text(fitz.Point(20, y + 9.5), head, fontsize=7.5, color=(1, 1, 1), **kwb)
            body_h = 12 * len(lines) + 8
            page.draw_rect(fitz.Rect(14, y + 13, W - 14, y + 13 + body_h), color=None, fill=(0.93, 0.95, 0.99))
            for k, line in enumerate(lines):
                page.insert_text(fitz.Point(20, y + 26 + 12 * k), line, fontsize=7.5, color=INK, **kw)
            y += 13 + body_h + 14
        for line in s.get("body", []):
            page.insert_text(fitz.Point(18, y), line, fontsize=8, color=INK, **kw)
            y += 14
        fig = s.get("figure")
        if fig and regular:
            o = fitz.Point(W / 2 - 20, H - 32)
            if fig == "rotation":
                a, b = fitz.Point(o.x + 60, o.y - 10), fitz.Point(o.x + 25, o.y - 40)
                ab = fitz.Point(a.x + (b.x - o.x), a.y + (b.y - o.y))
                draw_arrow(page, o, a, BLUE, "a", regular)
                draw_arrow(page, o, b, BLUE, "b", regular)
                draw_arrow(page, o, ab, NAVY, "a+b", regular)
                # 90° gegen den Uhrzeigersinn (Bildschirm-y zeigt nach unten): (dx, dy) → (dy, −dx)
                draw_arrow(page, o, fitz.Point(o.x + (a.y - o.y), o.y - (a.x - o.x)), RED, "f(a)", regular)
            elif fig == "projection":
                page.draw_line(fitz.Point(o.x - 70, o.y), fitz.Point(o.x + 110, o.y), color=GREY, width=0.8)
                tip = fitz.Point(o.x + 70, o.y - 45)
                draw_arrow(page, o, tip, BLUE, "v", regular)
                page.draw_line(tip, fitz.Point(tip.x, o.y), color=GREY, width=0.6, dashes="[2 2] 0")
                draw_arrow(page, fitz.Point(o.x, o.y + 0.1), fitz.Point(tip.x, o.y + 0.1), RED, "f(v)", regular)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out)
    print(f"{total} Folien → {out}")


if __name__ == "__main__":
    build(Path(sys.argv[1] if len(sys.argv) > 1 else "test/fixtures/demo/demo-handout.pdf"))
