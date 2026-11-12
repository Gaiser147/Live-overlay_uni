"""Tests für post/summarize.py im Claude-Code-Modus (mit Fake-CLI, ohne Netz)."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "post"))

import summarize  # noqa: E402

FAKE = r'''#!/usr/bin/env python3
import json, sys
from pathlib import Path
args = sys.argv[1:]
stdin = sys.stdin.read()
Path(__file__).with_name("call.json").write_text(json.dumps({"args": args, "stdin_len": len(stdin), "has_q": "Folie 6" in stdin}))
res = {"questions_explained": [{"n": 6, "explanation": "Kern neu erklärt."}],
       "review_questions": ["F1?", "F2?", "F3?", "F4?", "F5?"], "audio_script": "Heute ging es um den Kern."}
print(json.dumps({"is_error": False, "subtype": "success", "structured_output": res}))
'''


def test_summarize_claude_code(tmp_path, monkeypatch):
    bindir = tmp_path / "bin"
    bindir.mkdir()
    (bindir / "claude").write_text(FAKE)
    (bindir / "claude").chmod(0o755)
    monkeypatch.setenv("PATH", f"{bindir}:" + __import__("os").environ["PATH"])
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert summarize.default_mode() == "claude-code"

    deck = json.loads((ROOT / "test/fixtures/demo/deck.json").read_text())
    events = [{"ev": "mark", "kind": "question", "n": 6, "t": "2026-11-10T13:40:00Z"}]
    data = summarize.collect(events, deck)
    transcript = summarize.parse_transcript("14:39 Der Kern ist alles, was auf null abgebildet wird.\n\n14:41 Weiter mit Matrizen.")
    ai = summarize.ask_claude(deck, data, transcript, "Profil", "claude-code")
    call = json.loads((bindir / "call.json").read_text())
    assert ai and ai["questions_explained"][0]["n"] == 6
    assert call["has_q"] and call["stdin_len"] > 100
    assert call["args"][call["args"].index("--tools") + 1] == ""

    out = tmp_path / "post"
    summarize.write_outputs(deck, data, ai, out)
    assert "Kern neu erklärt." in (out / "nachbereitung.md").read_text()
    assert (out / "heimfahrt.md").exists()
