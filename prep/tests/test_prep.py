"""Tests für extract.py und make_deck.py am synthetischen Demo-Handout."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prep"))

import extract  # noqa: E402
import make_deck  # noqa: E402
import make_demo_pdf  # noqa: E402


def build(tmp_path: Path) -> Path:
    pdf = tmp_path / "demo.pdf"
    make_demo_pdf.build(pdf)
    out = tmp_path / "deck"
    extract.extract(pdf, out, dpi=60)
    return out


def test_extract_sections_crop_and_blocks(tmp_path):
    out = build(tmp_path)
    pages = json.loads((out / "pages.json").read_text())
    assert pages["sections"] == ["Einstieg", "Lineare Abbildungen", "Matrizen"]
    top, bottom = pages["crop"]
    assert 0.05 < top < 0.08 and 0.92 < bottom < 0.96
    p6 = pages["pages"][5]
    assert p6["section"] == "Lineare Abbildungen" and p6["title"] == "Kern"
    # Navigationsleiste und Fußzeile sind entfernt.
    assert "Matrizen" not in p6["text"] and "6/12" not in p6["text"] and "synthetische" not in p6["text"]
    assert all(0 <= v <= 1 for b in p6["blocks"] for v in b["bbox"])
    assert (out / "slides" / "006.png").exists()


def test_heuristic_deck_follows_rules(tmp_path):
    out = build(tmp_path)
    deck = make_deck.build(out, "demo", "2026-11-10", "heuristic", None, ROOT / "profile.md", 1)
    assert len(deck["slides"]) == 12
    for s in deck["slides"]:
        assert len(s["glance"].split()) <= 13  # 12 Wörter + Auslassungszeichen
        assert s["section"] in deck["sections"]
    assert deck["slides"][4]["exam_relevant"] is False  # „nicht klausurrelevant“ auf Folie 5
    assert deck["slides"][7]["kind"] == "task"  # „Welche Vektoren …?“


def test_cards_override_maps_block_highlights(tmp_path):
    out = build(tmp_path)
    cards = tmp_path / "cards.json"
    cards.write_text(json.dumps([{"n": 6, "glance": "Kern = alles, was auf 0 landet.", "highlight_blocks": [{"block": 3, "label": "Definition"}]}]))
    deck = make_deck.build(out, "demo", "2026-11-10", "heuristic", cards, ROOT / "profile.md", 1)
    s6 = deck["slides"][5]
    assert s6["glance"] == "Kern = alles, was auf 0 landet."
    assert s6["highlights"][0]["bbox"] == s6["blocks"][3]["bbox"]
