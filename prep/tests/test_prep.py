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


FAKE_CLAUDE = r'''#!/usr/bin/env python3
import json, sys
from pathlib import Path
args = sys.argv[1:]
prompt = args[args.index("-p") + 1]
log = Path(__file__).with_name("calls.log")
with log.open("a") as f:
    f.write(json.dumps({"retry": "Bitte korrigieren" in prompt, "tools": args[args.index("--tools") + 1]}) + "\n")
long = "eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn"
card = {"kind": "definition", "glance": long if "Bitte korrigieren" not in prompt else "Kern = alles, was auf 0 landet.",
        "example_text": "Beispiel (ausgedacht): f(x,y) = x.", "example_invented": True, "rule": "Kern prüfen: f(v) = 0.",
        "more": "Mehr.", "next_hint": "", "exam_relevant": False, "exam_note": "", "highlight_blocks": [],
        "keywords": ["Kern"], "links": []}
print(json.dumps({"type": "result", "is_error": False, "total_cost_usd": 0.01, "structured_output": card}))
'''


def test_claude_code_mode_retries_until_card_fits(tmp_path, monkeypatch):
    out = build(tmp_path)
    bindir = tmp_path / "bin"
    bindir.mkdir()
    fake = bindir / "claude"
    fake.write_text(FAKE_CLAUDE)
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bindir}:" + __import__("os").environ["PATH"])
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert make_deck.default_mode() == "claude-code"
    deck = make_deck.build(out, "demo", "2026-11-10", "claude-code", None, ROOT / "profile.md", 3)
    assert len(deck["slides"]) == 12
    assert all(s["glance"] == "Kern = alles, was auf 0 landet." for s in deck["slides"])
    assert deck["generated"]["by"] == "claude-code"
    calls = [json.loads(line) for line in (bindir / "calls.log").read_text().splitlines()]
    assert len(calls) == 24 and sum(c["retry"] for c in calls) == 12  # je Folie: zu lang, dann korrigiert
    assert all(c["tools"] == "Read" for c in calls)
