"""Folien aus einem Beamer-Handout extrahieren: Text, Textblöcke mit Koordinaten, PNG je Folie (250 dpi: scharf auf dem Tab S9 mit doppelter Pixeldichte).

Aufruf:
    python prep/extract.py handout.pdf out_dir [--dpi 250]

Ergebnis in out_dir:
    pages.json        – je Folie: n, title, section, text, blocks (bbox relativ 0–1), image
    slides/NNN.png    – Folienbilder

Kopf- und Fußzeilen (Beamer-Navigationsleiste, Autor/Titel/Seitenzahl) werden entfernt:
Blöcke, die auf mehr als der Hälfte der Seiten an derselben Stelle mit demselben Text stehen,
und Blöcke im oberen bzw. unteren Randstreifen. Der aktive Abschnitt wird aus der
Navigationsleiste gelesen (Beamer zeichnet ihn heller als die übrigen Einträge).
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf as fitz

HEADER_BAND = 0.09
FOOTER_BAND = 0.92


def _luma(color: int) -> float:
    r, g, b = (color >> 16) & 255, (color >> 8) & 255, color & 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _clean(text: str) -> str:
    text = text.replace("­", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def _key(text: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", text.strip().lower()))


def read_pages(pdf: fitz.Document) -> list[dict]:
    pages = []
    for page in pdf:
        w, h = page.rect.width, page.rect.height
        d = page.get_text("dict")
        blocks = []
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            spans = [s for line in b["lines"] for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = _clean("\n".join(" ".join(s["text"] for s in line["spans"]) for line in b["lines"]))
            x0, y0, x1, y1 = b["bbox"]
            blocks.append(
                {
                    "bbox": [round(max(0, x0 / w), 4), round(max(0, y0 / h), 4), round(min(1, x1 / w), 4), round(min(1, y1 / h), 4)],
                    "text": text,
                    "size": max(s["size"] for s in spans),
                    "spans": [{"text": s["text"].strip(), "color": s["color"], "bbox": s["bbox"]} for s in spans],
                }
            )
        pages.append({"n": page.number + 1, "width": w, "height": h, "blocks": blocks})
    return pages


def repeated_keys(pages: list[dict]) -> set[str]:
    """Blöcke, die auf mehr als der Hälfte der Seiten gleich und an gleicher Stelle stehen."""
    c: Counter[str] = Counter()
    for p in pages:
        seen = set()
        for b in p["blocks"]:
            k = f"{_key(b['text'])}@{round(b['bbox'][1], 1)}"
            if k not in seen:
                c[k] += 1
                seen.add(k)
    limit = max(2, len(pages) // 2)
    return {k for k, v in c.items() if v > limit}


def merge_nav_words(spans: list[dict]) -> list[dict]:
    """Manche Beamer-PDFs setzen jedes Wort eines Navigationseintrags als eigenen Span.
    Nah beieinander (Lücke < Zeilenhöhe) und gleichfarbig = ein Eintrag; zwischen Einträgen ist viel Platz."""
    out: list[dict] = []
    for s in spans:
        prev = out[-1] if out else None
        if prev and prev["color"] == s["color"] and s["bbox"][0] - prev["bbox"][2] < (prev["bbox"][3] - prev["bbox"][1]):
            out[-1] = dict(prev, text=f"{prev['text']} {s['text']}", bbox=(prev["bbox"][0], prev["bbox"][1], s["bbox"][2], max(prev["bbox"][3], s["bbox"][3])))
        else:
            out.append(s)
    return out


def nav_sections(pages: list[dict]) -> tuple[list[str], list[str | None]]:
    """Abschnittsnamen aus der Navigationsleiste und der aktive Abschnitt je Seite."""
    names: list[str] = []
    active: list[str | None] = []
    for p in pages:
        spans = [s for b in p["blocks"] if b["bbox"][3] <= HEADER_BAND for s in b["spans"] if s["text"]]
        if not spans:
            active.append(None)
            continue
        spans = merge_nav_words(sorted(spans, key=lambda s: s["bbox"][0]))
        if not names:
            names = [s["text"] for s in spans]
        lum = [_luma(s["color"]) for s in spans]
        # Aktiv = deutlich heller (oder dunkler, je nach Theme) als der Median.
        med = sorted(lum)[len(lum) // 2]
        dev = [abs(v - med) for v in lum]
        best = max(range(len(spans)), key=lambda i: dev[i])
        active.append(spans[best]["text"] if dev[best] > 25 else None)
    return names, active


def crop_bands(page: fitz.Page, blocks: list[dict]) -> tuple[float, float]:
    """Oberen und unteren Rand (Navigationsleiste, Fußzeile) als Anteil der Seitenhöhe.

    Erst gefüllte Rechtecke über die ganze Breite am Rand, sonst die Textblöcke im Randstreifen.
    Die App schneidet diese Streifen ab: Abschnitt und Seitenzahl zeigt sie selbst, und die
    farbige Leiste würde invertiert im dunklen Saal hell leuchten.
    """
    w, h = page.rect.width, page.rect.height
    top, bottom = 0.0, 1.0
    for d in page.get_drawings():
        r = d.get("rect")
        if not r or d.get("fill") is None or r.width < 0.9 * w or r.height > 0.15 * h:
            continue
        if r.y0 <= 0.02 * h:
            top = max(top, r.y1 / h)
        if r.y1 >= 0.98 * h:
            bottom = min(bottom, r.y0 / h)
    if top == 0.0:
        head = [b["bbox"][3] for b in blocks if b["bbox"][3] <= HEADER_BAND]
        top = min(HEADER_BAND, max(head) + 0.01) if head else 0.0
    if bottom == 1.0:
        foot = [b["bbox"][1] for b in blocks if b["bbox"][1] >= FOOTER_BAND]
        bottom = max(FOOTER_BAND, min(foot) - 0.01) if foot else 1.0
    # Etwas Sicherheitsabstand, damit keine Kante der Leiste stehen bleibt.
    if top > 0:
        top += 0.005
    if bottom < 1:
        bottom -= 0.005
    return round(top, 4), round(bottom, 4)


def extract(pdf_path: Path, out_dir: Path, dpi: int = 250) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "slides").mkdir(exist_ok=True)
    pdf = fitz.open(pdf_path)
    pages = read_pages(pdf)
    rep = repeated_keys(pages)
    sections, active = nav_sections(pages)

    out_pages = []
    last_section = sections[0] if sections else ""
    for p, act in zip(pages, active):
        body = []
        for b in p["blocks"]:
            y0, y1 = b["bbox"][1], b["bbox"][3]
            if y1 <= HEADER_BAND or y0 >= FOOTER_BAND:
                continue
            if f"{_key(b['text'])}@{round(y0, 1)}" in rep:
                continue
            body.append(b)
        body.sort(key=lambda b: (round(b["bbox"][1], 2), b["bbox"][0]))
        title = ""
        if body:
            top = [b for b in body if b["bbox"][1] < 0.3]
            cand = max(top or body, key=lambda b: (b["size"], -b["bbox"][1]))
            title = cand["text"].split("\n")[0]
        if act:
            last_section = act
        img = f"slides/{p['n']:03d}.png"
        pix = pdf[p["n"] - 1].get_pixmap(dpi=dpi)
        pix.save(out_dir / img)
        out_pages.append(
            {
                "n": p["n"],
                "title": title,
                "section": last_section,
                "text": "\n".join(b["text"] for b in body),
                "blocks": [{"bbox": b["bbox"], "text": b["text"]} for b in body],
                "image": img,
            }
        )
    first = pdf[0].rect
    # Zuschnitt aus einer typischen Inhaltsfolie (nicht der Titelfolie).
    probe = min(2, len(pdf) - 1)
    crop = crop_bands(pdf[probe], pages[probe]["blocks"])
    result = {
        "crop": list(crop),
        "source": pdf_path.name,
        "sections": sections,
        "aspect": round(first.width / first.height, 4),
        "pages": out_pages,
    }
    (out_dir / "pages.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--dpi", type=int, default=250)
    a = ap.parse_args()
    r = extract(a.pdf, a.out_dir, a.dpi)
    print(f"{len(r['pages'])} Folien, Abschnitte: {', '.join(r['sections']) or '–'}")


if __name__ == "__main__":
    main()
