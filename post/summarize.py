"""Nachbereitung einer Vorlesung (läuft auf dem Pi, ca. 30 Minuten nach Ende).

Aufruf:
    python post/summarize.py --deck lectures/mathe-info-2/2026-11-10/deck.json \\
        --transcript lectures/mathe-info-2/2026-11-10/twinmind.txt [--log log.jsonl] [--weg2] [--mode claude|claude-code|none]

Sprachmodell: mit ANTHROPIC_API_KEY über die API, sonst über die lokal angemeldete Claude-Code-CLI
(`claude -p`), sonst ohne (dann nur Liste der ?-Stellen mit den vorbereiteten Erklärungen).

Ohne --log wird das Protokoll beim Cloud-Proxy abgeholt (PROXY_URL, PI_KEY).
Das TwinMind-Transkript ist Text im Format „HH:MM Absatz" (Export aus TwinMind oder twinmind-cli).

Ergebnis in lectures/{kurs}/{datum}/post/:
    nachbereitung.md  – „?"-Stellen mit Erklärung, Klausurhinweise, 5 Wiederholungsfragen
    heimfahrt.md      – Text für die Audio-Zusammenfassung (3–5 Minuten)
    quest.json        – „?"-Liste für die Wochen-Quest am Sonntag
und neue Beobachtungen am Ende von profile.md.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = "claude-sonnet-5-5"

RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "questions_explained": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"n": {"type": "integer"}, "explanation": {"type": "string"}},
                "required": ["n", "explanation"],
                "additionalProperties": False,
            },
        },
        "review_questions": {"type": "array", "items": {"type": "string"}},
        "audio_script": {"type": "string"},
    },
    "required": ["questions_explained", "review_questions", "audio_script"],
    "additionalProperties": False,
}


def parse_transcript(text: str) -> list[tuple[int, str]]:
    """[(Minuten seit Mitternacht, Absatz)]"""
    out = []
    for block in re.split(r"\n\s*\n", text):
        m = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s+(.*)$", block.strip(), re.S)
        if m:
            out.append((int(m.group(1)) * 60 + int(m.group(2)), re.sub(r"\s+", " ", m.group(3)).strip()))
    return out


def around(transcript: list[tuple[int, str]], minute: int, before: int = 2, after: int = 1) -> str:
    return " ".join(t for m, t in transcript if minute - before <= m <= minute + after)


def load_log(args) -> list[dict]:
    if args.log:
        lines = Path(args.log).read_text(encoding="utf-8").splitlines()
    else:
        proxy = os.environ["PROXY_URL"].rstrip("/")
        req = urllib.request.Request(f"{proxy}/log/{args.session}", headers={"authorization": f"Bearer {os.environ['PI_KEY']}", "user-agent": "live-overlay-post/1"})
        with urllib.request.urlopen(req, timeout=30) as r:
            lines = r.read().decode().splitlines()
    return [json.loads(l) for l in lines if l.strip()]


def local_minute(iso: str) -> int:
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
    return t.hour * 60 + t.minute


def hhmm(iso: str) -> str:
    m = local_minute(iso)
    return f"{m // 60:02d}:{m % 60:02d}"


def collect(events: list[dict], deck: dict) -> dict:
    slides = {s["n"]: s for s in deck["slides"]}
    marks = [e for e in events if e.get("ev") == "mark"]
    questions = [e for e in marks if e.get("kind") in ("question", "circle")]
    lost = [e for e in marks if e.get("kind") == "lost"]
    exams = [e for e in events if e.get("ev") == "exam"] + [e for e in events if e.get("ev") == "note" and e.get("type") == "exam" and e.get("shown")]
    notes = [e for e in events if e.get("ev") == "note" and e.get("shown")]
    costs = [e for e in events if e.get("ev") == "cost"]
    note_calls = [e for e in events if e.get("ev") == "note" and "confidence" in e]
    return {
        "slides": slides,
        "questions": questions,
        "lost": lost,
        "exams": exams,
        "notes": notes,
        "usd": sum(e.get("usd", 0) for e in costs),
        "note_calls": len(note_calls),
        "note_none": sum(1 for e in note_calls if e.get("type") == "none"),
    }


def build_prompt(deck: dict, data: dict, transcript: list[tuple[int, str]], profile: str) -> tuple[str, str]:
    """(System-Prompt, Nutzertext) – gleich für API und Claude Code."""
    qs = []
    for q in data["questions"]:
        s = data["slides"].get(q["n"], {})
        qs.append(f"- Folie {q['n']} ({s.get('title', '')}), Karte: {s.get('glance', '')}\n  Vortrag rund um die Stelle: {around(transcript, local_minute(q['t']))[:1500]}")
    exams = [f"- Folie {e.get('n')}: {e.get('text') or e.get('phrase')}" for e in data["exams"]]
    full = " ".join(t for _, t in transcript)[:60_000]
    system = f"Du bereitest eine Vorlesung für einen Informatik-Studenten nach. Sprachprofil:\n{profile}"
    user = (
        f"Vorlesung: {deck['title']} ({deck['date']}).\n\nStellen, an denen der Student „?“ gedrückt hat:\n{chr(10).join(qs) or '– keine –'}\n\n"
        f"Klausurhinweise:\n{chr(10).join(exams) or '– keine –'}\n\nTranskript (automatisch, mit Erkennungsfehlern):\n{full}\n\n"
        "Aufgaben: (1) Erkläre jede ?-Stelle neu, höchstens 80 Wörter, mit Zahlenbeispiel. "
        "(2) Genau 5 Wiederholungsfragen, die man ohne Folien beantworten kann. "
        "(3) Ein Sprechtext für 3–5 Minuten (etwa 450–650 Wörter) für die Heimfahrt: Was war heute dran, in der Reihenfolge der Vorlesung, ohne Formeln vorzulesen."
    )
    return system, user


def default_mode() -> str:
    import shutil

    if os.environ.get("ANTHROPIC_API_KEY"):
        return "claude"
    if shutil.which("claude"):
        return "claude-code"
    return "none"


def ask_claude(deck: dict, data: dict, transcript: list[tuple[int, str]], profile: str, mode: str | None = None) -> dict | None:
    mode = mode or default_mode()
    if mode == "none":
        return None
    system, user = build_prompt(deck, data, transcript, profile)
    if mode == "claude-code":
        return ask_claude_code(system, user)
    import anthropic

    client = anthropic.Anthropic()
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=[{"type": "text", "text": system}],
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": RESULT_SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if resp.stop_reason == "refusal":
        return None
    return json.loads(next(b.text for b in resp.content if b.type == "text"))


def ask_claude_code(system: str, user: str) -> dict | None:
    """Über die lokal angemeldete Claude-Code-CLI (`claude -p`, Sonnet), ohne Werkzeuge. Der Text geht per stdin rein."""
    import subprocess

    cmd = ["claude", "-p", "--model", "sonnet", "--system-prompt", system, "--output-format", "json",
           "--json-schema", json.dumps(RESULT_SCHEMA), "--tools", "", "--no-session-persistence"]
    for attempt in range(2):
        try:
            proc = subprocess.run(cmd, input=user, capture_output=True, text=True, timeout=600)
            out = json.loads(proc.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            print(f"Claude Code: Versuch {attempt + 1} fehlgeschlagen ({type(e).__name__})", file=sys.stderr)
            continue
        res = out.get("structured_output")
        if not out.get("is_error") and isinstance(res, dict):
            return res
        print(f"Claude Code: Versuch {attempt + 1} ohne Ergebnis ({out.get('subtype')})", file=sys.stderr)
    return None


def write_outputs(deck: dict, data: dict, ai: dict | None, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    explained = {q["n"]: q["explanation"] for q in (ai or {}).get("questions_explained", [])}
    lines = [f"# Nachbereitung: {deck['title']} ({deck['date']})", ""]
    lines += ["## Stellen mit „?“", ""]
    if not data["questions"]:
        lines.append("Keine.")
    for q in data["questions"]:
        s = data["slides"].get(q["n"], {})
        lines += [f"**Folie {q['n']} – {s.get('title', '')}** ({hhmm(q['t'])})", "", explained.get(q["n"], s.get("more", "")), ""]
    lines += ["## Klausurhinweise", ""]
    lines += [f"- Folie {e.get('n')}: {e.get('text') or e.get('phrase')} ({hhmm(e['t'])})" for e in data["exams"]] or ["Keine erkannt."]
    lines += ["", "## Wiederholungsfragen", ""]
    rq = (ai or {}).get("review_questions") or [f"Erkläre in einem Satz: {data['slides'][q['n']]['title']}" for q in data["questions"][:5]]
    lines += [f"{i}. {q}" for i, q in enumerate(rq[:5], 1)] or ["(ohne Sprachmodell keine Fragen erzeugt)"]
    lines += ["", "## Zahlen", "", f"- „Faden verloren“ gedrückt: {len(data['lost'])}×", f"- Live-Notizen gezeigt: {len(data['notes'])}",
              f"- Anteil Schicht-C-Aufrufe mit „none“: {data['note_none']}/{data['note_calls']}" if data["note_calls"] else "- Keine Schicht-C-Aufrufe",
              f"- Kosten laut Protokoll: {data['usd']:.2f} $ (Ziel unter 1,50 $; ohne Transkription)"]
    (out / "nachbereitung.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if ai and ai.get("audio_script"):
        (out / "heimfahrt.md").write_text(f"# Heimfahrt: {deck['title']}\n\n{ai['audio_script']}\n", encoding="utf-8")
    quest = [{"course": deck["course"], "date": deck["date"], "slide": q["n"], "title": data["slides"].get(q["n"], {}).get("title", ""),
              "explanation": explained.get(q["n"], data["slides"].get(q["n"], {}).get("more", ""))} for q in data["questions"]]
    (out / "quest.json").write_text(json.dumps(quest, ensure_ascii=False, indent=1), encoding="utf-8")


def update_profile(deck: dict, data: dict, profile_path: Path) -> None:
    if not data["questions"] and not data["lost"]:
        return
    titles = sorted({data["slides"].get(q["n"], {}).get("title", str(q["n"])) for q in data["questions"]})
    entry = f"\n- {deck['date']} {deck['course']}: „?“ bei {', '.join(titles) or '–'}; „Faden verloren“ {len(data['lost'])}×."
    with profile_path.open("a", encoding="utf-8") as f:
        f.write(entry)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--deck", type=Path, required=True)
    ap.add_argument("--transcript", type=Path)
    ap.add_argument("--log", type=Path)
    ap.add_argument("--session")
    ap.add_argument("--weg2", action="store_true", help="TwinMind lief nicht mit: an den Upload der Aufnahme erinnern")
    ap.add_argument("--mode", choices=["claude", "claude-code", "none"], default=default_mode(),
                    help="claude = API-Schlüssel, claude-code = lokale CLI (`claude -p`), none = ohne Sprachmodell")
    a = ap.parse_args()
    deck = json.loads(a.deck.read_text(encoding="utf-8"))
    a.session = a.session or f"{deck['course']}_{deck['date']}"
    if a.weg2 and (not a.transcript or not a.transcript.exists()):
        print("Erinnerung: Aufnahme bei TwinMind hochladen (Upload Audio Files), dann erneut starten.", file=sys.stderr)
        sys.exit(2)
    transcript = parse_transcript(a.transcript.read_text(encoding="utf-8")) if a.transcript and a.transcript.exists() else []
    data = collect(load_log(a), deck)
    profile_path = ROOT / "profile.md"
    ai = ask_claude(deck, data, transcript, profile_path.read_text(encoding="utf-8") if profile_path.exists() else "", a.mode)
    out = a.deck.parent / "post"
    write_outputs(deck, data, ai, out)
    update_profile(deck, data, profile_path)
    print(f"Nachbereitung → {out}")


if __name__ == "__main__":
    main()
