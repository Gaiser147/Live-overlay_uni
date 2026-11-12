"""Aus pages.json (extract.py) eine deck.json mit einer Karte pro Folie erzeugen.

Aufruf:
    python prep/make_deck.py out_dir --course mathe-info-2 --date 2026-11-10 [--mode claude|claude-code|heuristic]
                             [--cards cards.json] [--profile profile.md] [--workers 6]

--mode claude      Ein Aufruf je Folie (Bild + Text + Sprachprofil + Nachbartitel), normale API (kein Batch),
                   damit ein am Vorlesungstag hochgeladenes Handout in wenigen Minuten fertig ist.
--mode claude-code Wie claude, aber über die lokal angemeldete Claude-Code-CLI (`claude -p`, Sonnet) statt
                   über einen API-Schlüssel. Höchstens 3 Folien parallel. Standard, wenn kein ANTHROPIC_API_KEY
                   gesetzt ist und `claude` im PATH liegt.
--mode heuristic   Ohne Sprachmodell: Titel, erster Satz, Schlüsselwörter aus dem Text. Für den Tracker reicht das,
                   die Karten sind dann nur Notlösung.
--cards            Handgeschriebene Karten (Liste von Objekten mit "n"), überschreiben die erzeugten Felder.

Ausgabe: out_dir/deck.json und out_dir/keyterms.json.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MODEL = "claude-sonnet-5-5"
KINDS = ["title", "section", "motivation", "definition", "theorem", "example", "task", "remark", "summary"]

CARD_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": KINDS},
        "glance": {"type": "string"},
        "example_text": {"type": "string"},
        "example_invented": {"type": "boolean"},
        "rule": {"type": "string"},
        "more": {"type": "string"},
        "next_hint": {"type": "string"},
        "exam_relevant": {"type": "boolean"},
        "exam_note": {"type": "string"},
        "highlight_blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"block": {"type": "integer"}, "label": {"type": "string"}},
                "required": ["block", "label"],
                "additionalProperties": False,
            },
        },
        "keywords": {"type": "array", "items": {"type": "string"}},
        "links": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "kind", "glance", "example_text", "example_invented", "rule", "more", "next_hint",
        "exam_relevant", "exam_note", "highlight_blocks", "keywords", "links",
    ],
    "additionalProperties": False,
}

STOP = set(
    "der die das den dem des ein eine einen einem einer und oder aber auch als am an auf aus bei bis da dann dass "
    "durch für ist im in mit nach nicht noch nur ob sie sich sind so über um von vor wie wir wird zu zum zur es "
    "gilt sei seien dann heißt haben hat kann können wenn diese dieser dieses jede jeder jedes alle ihr wird".split()
)


def words(s: str) -> int:
    return len(s.split())


def clip_words(s: str, n: int) -> str:
    w = s.split()
    return s if len(w) <= n else " ".join(w[:n]).rstrip(",;:") + " …"


# ---------------------------------------------------------------- Heuristik


def guess_kind(page: dict, n_pages: int) -> str:
    t = f"{page['title']}\n{page['text']}".lower()
    if page["n"] == 1:
        return "title"
    if len(page["text"].split()) <= 4:
        return "section"
    if "zusammenfassung" in page["title"].lower():
        return "summary"
    asks = re.search(r"\b(bestimmen sie|berechnen sie|zeigen sie|begründen sie|was ist|welche[rsn]?)\b[^.]*\?", t)
    if ("aufgabe" in page["title"].lower() or asks) and "lösung" not in t:
        return "task"
    if "definition" in t:
        return "definition"
    if re.search(r"\b(satz|korollar|lemma)\b", t):
        return "theorem"
    if "beispiel" in t:
        return "example"
    return "remark"


def tfidf_keywords(pages: list[dict]) -> list[list[str]]:
    tok = lambda s: [w for w in re.findall(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]{3,}", s) if w.lower() not in STOP]
    docs = [tok(f"{p['title']} {p['title']} {p['text']}") for p in pages]
    df = Counter(w.lower() for d in docs for w in set(x.lower() for x in d))
    out = []
    for d in docs:
        tf = Counter(d)
        ranked = sorted(tf, key=lambda w: -tf[w] * math.log(1 + len(pages) / df[w.lower()]))
        seen, kws = set(), []
        for w in ranked:
            if w.lower() not in seen:
                seen.add(w.lower())
                kws.append(w)
            if len(kws) >= 8:
                break
        out.append(kws)
    return out


def heuristic_card(page: dict, kind: str, keywords: list[str], next_title: str | None) -> dict:
    text = re.sub(r"\s+", " ", page["text"]).strip()
    first = re.split(r"(?<=[.:!?])\s", text, maxsplit=1)[0] if text else page["title"]
    exam_off = bool(re.search(r"nicht.{0,40}klausur|klausur.{0,40}nicht", text, re.I))
    hl = []
    for i, b in enumerate(page["blocks"]):
        if re.match(r"(definition|satz|korollar)", b["text"], re.I):
            hl.append({"block": i, "label": b["text"].split("\n")[0][:40]})
            break
    return {
        "kind": kind,
        "glance": clip_words(page["title"] if kind in ("title", "section") else first, 12),
        "example_text": "",
        "example_invented": False,
        "rule": "",
        "more": clip_words(text, 80) if text else page["title"],
        "next_hint": f"Gleich: {clip_words(next_title, 5)}" if next_title else "",
        "exam_relevant": not exam_off,
        "exam_note": "Laut Folie nicht klausurrelevant" if exam_off else "",
        "highlight_blocks": hl,
        "keywords": keywords,
        "links": [],
    }


# ---------------------------------------------------------------- Claude


def system_prompt(profile: str) -> str:
    return (HERE / "prompts" / "card.md").read_text(encoding="utf-8").replace("{{PROFILE}}", profile.strip())


def claude_card(client, system: str, page: dict, prev_title: str | None, next_title: str | None, img_dir: Path) -> tuple[dict, dict]:
    import anthropic

    blocks = "\n".join(f"[{i}] {b['text']}" for i, b in enumerate(page["blocks"]))
    user_text = (
        f"Folie {page['n']} – Titel: {page['title']}\nAbschnitt: {page['section']}\n"
        f"Vorherige Folie: {prev_title or '–'}\nNächste Folie: {next_title or '–'}\n\n"
        f"Textblöcke:\n{blocks or '(kein Text)'}"
    )
    content: list[dict] = []
    img = img_dir / page["image"]
    if img.exists():
        content.append(
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.standard_b64encode(img.read_bytes()).decode()}}
        )
    content.append({"type": "text", "text": user_text})
    messages = [{"role": "user", "content": content}]
    usage = {"input": 0, "cache_read": 0, "output": 0}

    for attempt in range(3):
        try:
            resp = client.beta.messages.create(
                model=MODEL,
                max_tokens=4000,
                # System-Prompt + Sprachprofil sind für alle Folien gleich → Cache.
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=messages,
                output_config={"effort": "medium", "format": {"type": "json_schema", "schema": CARD_SCHEMA}},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError:
            time.sleep(5 * (attempt + 1))
            continue
        except anthropic.APIConnectionError:
            time.sleep(2 * (attempt + 1))
            continue
        usage["input"] += resp.usage.input_tokens
        usage["cache_read"] += resp.usage.cache_read_input_tokens or 0
        usage["output"] += resp.usage.output_tokens
        if resp.stop_reason == "refusal":
            raise RuntimeError(f"Folie {page['n']}: Anfrage abgelehnt")
        text = next(b.text for b in resp.content if b.type == "text")
        card = json.loads(text)
        problems = card_problems(card)
        if not problems:
            return card, usage
        messages = [
            {"role": "user", "content": content},
            {"role": "assistant", "content": text},
            {"role": "user", "content": "Bitte korrigieren: " + "; ".join(problems) + ". Gib die ganze Karte neu aus."},
        ]
    raise RuntimeError(f"Folie {page['n']}: keine gültige Karte nach 3 Versuchen")


def card_problems(card: dict) -> list[str]:
    """Wortgrenzen der Karte; leere Liste = in Ordnung."""
    problems = []
    if words(card["glance"]) > 12:
        problems.append(f"glance hat {words(card['glance'])} Wörter, erlaubt sind 12")
    if words(card["example_text"]) > 25:
        problems.append(f"example_text hat {words(card['example_text'])} Wörter, erlaubt sind 25")
    if words(card["more"]) > 80:
        problems.append(f"more hat {words(card['more'])} Wörter, erlaubt sind 80")
    return problems


# ---------------------------------------------------------------- Claude Code (ohne API-Schlüssel)

CLAUDE_CODE_MODEL = "sonnet"
CLAUDE_CODE_TIMEOUT_S = 240
MODES = ["claude", "claude-code", "heuristic"]


def default_mode() -> str:
    """API-Schlüssel → claude; sonst angemeldete Claude-Code-CLI → claude-code; sonst heuristic."""
    import shutil

    if os.environ.get("ANTHROPIC_API_KEY"):
        return "claude"
    if shutil.which("claude"):
        return "claude-code"
    return "heuristic"


def claude_code_card(system: str, page: dict, prev_title: str | None, next_title: str | None, img_dir: Path) -> tuple[dict, float]:
    """Eine Karte über die lokal angemeldete Claude-Code-CLI (`claude -p`) erzeugen.

    Claude Code bekommt nur das Werkzeug Read und nur Zugriff auf img_dir, damit es das Folienbild ansehen kann.
    Rückgabe: Karte und die von Claude Code gemeldeten Kosten (rechnerisch, beim Abo nur zur Info).
    """
    import subprocess

    blocks = "\n".join(f"[{i}] {b['text']}" for i, b in enumerate(page["blocks"]))
    img = (img_dir / page["image"]).resolve()
    prompt = (
        f"Folie {page['n']} – Titel: {page['title']}\nAbschnitt: {page['section']}\n"
        f"Vorherige Folie: {prev_title or '–'}\nNächste Folie: {next_title or '–'}\n\n"
        f"Textblöcke:\n{blocks or '(kein Text)'}"
    )
    if img.exists():
        prompt += f"\n\nFolienbild (mit dem Read-Werkzeug ansehen, sonst nichts lesen): {img}"
    prompt += "\n\nGib nur die Karte als strukturierte Ausgabe zurück."
    cost = 0.0
    hint = ""
    for attempt in range(3):
        cmd = [
            "claude", "-p", prompt + hint,
            "--model", CLAUDE_CODE_MODEL,
            "--system-prompt", system,
            "--output-format", "json",
            "--json-schema", json.dumps(CARD_SCHEMA),
            "--tools", "Read",
            "--allowedTools", "Read",
            "--add-dir", str(img_dir.resolve()),
            "--no-session-persistence",
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CLAUDE_CODE_TIMEOUT_S, cwd=img_dir, stdin=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            continue
        try:
            out = json.loads(proc.stdout)
        except json.JSONDecodeError:
            time.sleep(3 * (attempt + 1))
            continue
        cost += float(out.get("total_cost_usd") or 0)
        card = out.get("structured_output")
        if out.get("is_error") or not isinstance(card, dict):
            time.sleep(3 * (attempt + 1))
            continue
        problems = card_problems(card)
        if not problems:
            return card, cost
        hint = (
            "\n\nDein letzter Entwurf war:\n" + json.dumps(card, ensure_ascii=False)
            + "\nBitte korrigieren: " + "; ".join(problems) + ". Gib die ganze Karte neu aus."
        )
    raise RuntimeError(f"Folie {page['n']}: keine gültige Karte von Claude Code nach 3 Versuchen")


# ---------------------------------------------------------------- Zusammenbau


def to_slide(page: dict, card: dict) -> dict:
    hls = []
    for h in card.get("highlight_blocks", [])[:2]:
        i = h.get("block")
        if isinstance(i, int) and 0 <= i < len(page["blocks"]):
            hls.append({"bbox": page["blocks"][i]["bbox"], "label": h.get("label", "")[:40]})
    ex = card.get("example_text", "").strip()
    return {
        "n": page["n"],
        "section": page["section"],
        "title": page["title"],
        "kind": card["kind"],
        "glance": card["glance"].strip(),
        "example": {"text": ex, "invented": bool(card.get("example_invented"))} if ex else None,
        "rule": card.get("rule", "").strip() or None,
        "more": card.get("more", "").strip(),
        "next_hint": card.get("next_hint", "").strip() or None,
        "exam_relevant": bool(card.get("exam_relevant", True)),
        "exam_note": card.get("exam_note", "").strip() or None,
        "highlights": hls,
        "keywords": card.get("keywords", [])[:10],
        "links": card.get("links", []),
        "image": page["image"],
        "text": page["text"],
        "blocks": page["blocks"],
    }


def build(out_dir: Path, course: str, date: str, mode: str, cards_path: Path | None, profile_path: Path, workers: int) -> dict:
    pages_doc = json.loads((out_dir / "pages.json").read_text(encoding="utf-8"))
    pages = pages_doc["pages"]
    sections = pages_doc.get("sections") or sorted({p["section"] for p in pages if p["section"]}, key=lambda s: [p["section"] for p in pages].index(s))
    if not sections:
        sections = ["Vorlesung"]
    for p in pages:
        if p["section"] not in sections:
            p["section"] = sections[0]
    kws = tfidf_keywords(pages)
    titles = [p["title"] for p in pages]
    t0 = time.time()
    usage_total = {"input": 0, "cache_read": 0, "output": 0}

    if mode == "claude":
        import anthropic

        client = anthropic.Anthropic()
        system = system_prompt(profile_path.read_text(encoding="utf-8") if profile_path.exists() else "")

        def one(i: int) -> dict:
            p = pages[i]
            card, u = claude_card(client, system, p, titles[i - 1] if i else None, titles[i + 1] if i + 1 < len(pages) else None, out_dir)
            for k in usage_total:
                usage_total[k] += u[k]
            return card

        # Erste Folie allein, damit der System-Prompt im Cache liegt, dann parallel.
        cards = [one(0)]
        with ThreadPoolExecutor(max_workers=workers) as ex:
            cards += list(ex.map(one, range(1, len(pages))))
    elif mode == "claude-code":
        system = system_prompt(profile_path.read_text(encoding="utf-8") if profile_path.exists() else "")
        cost_total = [0.0]

        def one_cc(i: int) -> dict:
            card, c = claude_code_card(system, pages[i], titles[i - 1] if i else None, titles[i + 1] if i + 1 < len(pages) else None, out_dir)
            cost_total[0] += c
            print(f"  Folie {pages[i]['n']} fertig", file=sys.stderr)
            return card

        # Jeder claude-Prozess braucht einige hundert MB; mehr als 3 parallel sprengen kleine Rechner.
        with ThreadPoolExecutor(max_workers=max(1, min(workers, 3))) as ex:
            cards = list(ex.map(one_cc, range(len(pages))))
        print(f"Claude Code: rechnerisch {cost_total[0]:.2f} $ (beim Abo nicht berechnet)", file=sys.stderr)
    else:
        cards = [
            heuristic_card(p, guess_kind(p, len(pages)), kws[i], titles[i + 1] if i + 1 < len(pages) else None)
            for i, p in enumerate(pages)
        ]

    slides = [to_slide(p, c) for p, c in zip(pages, cards)]
    if cards_path:
        overrides = {c["n"]: c for c in json.loads(cards_path.read_text(encoding="utf-8"))}
        for s in slides:
            o = overrides.get(s["n"])
            if o:
                hl_blocks = o.pop("highlight_blocks", None)
                s.update({k: v for k, v in o.items() if k != "n"})
                if hl_blocks is not None:
                    page = next(p for p in pages if p["n"] == s["n"])
                    s["highlights"] = [
                        {"bbox": page["blocks"][h["block"]]["bbox"], "label": h["label"]} for h in hl_blocks if 0 <= h["block"] < len(page["blocks"])
                    ]

    keyterms: list[str] = []
    for s in slides:
        for k in s["keywords"]:
            if k not in keyterms and len(k) > 2:
                keyterms.append(k)
    deck = {
        "version": 1,
        "course": course,
        "date": date,
        "title": titles[0] if titles else course,
        "sections": sections,
        "slides": slides,
        "keyterms": keyterms[:100],
        "aspect": pages_doc.get("aspect", 4 / 3),
        "crop": pages_doc.get("crop"),
        "generated": {"by": mode, "model": {"claude": MODEL, "claude-code": f"claude-code:{CLAUDE_CODE_MODEL}"}.get(mode),
                      "at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
    }
    (out_dir / "deck.json").write_text(json.dumps(deck, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "keyterms.json").write_text(json.dumps(keyterms[:100], ensure_ascii=False, indent=1), encoding="utf-8")
    if mode == "claude":
        # Sonnet 5.5: 2 $ / 10 $ je Mio. Token, Cache-Lesen 0,10 $ (Stand Plan; vor dem Bau prüfen).
        usd = usage_total["input"] * 2e-6 + usage_total["cache_read"] * 0.1e-6 + usage_total["output"] * 10e-6
        print(f"Tokens: {usage_total}, ca. {usd:.2f} $", file=sys.stderr)
    print(f"{len(slides)} Karten in {time.time() - t0:.0f} s → {out_dir / 'deck.json'}", file=sys.stderr)
    return deck


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--course", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--mode", choices=MODES, default=default_mode())
    ap.add_argument("--cards", type=Path)
    ap.add_argument("--profile", type=Path, default=ROOT / "profile.md")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    build(a.out_dir, a.course, a.date, a.mode, a.cards, a.profile, a.workers)


if __name__ == "__main__":
    main()
