"""Vorbereitung einer Vorlesung in einem Schritt (läuft auf dem Pi, z. B. per Werktags-Task).

    python prep/run.py --course mathe-info-2 --date 2026-11-10 --pdf lectures/mathe-info-2/2026-11-10/handout.pdf [--upload]

1. extract.py: Text, Blöcke, Bilder je Folie
2. make_deck.py: Karten (Claude per API, sonst Claude Code per `claude -p`, sonst heuristisch)
3. --upload: deck.json und Folienbilder zum Cloud-Proxy (PROXY_URL, PI_KEY), damit das Tablet sie
   auch ohne Heimnetz laden kann. Die Deck-ID bekommt einen Zufallsanteil.

Ausgabe: lectures/{kurs}/{datum}/ und eine Zeile mit der Deck-URL für die App-Einstellungen.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import extract  # noqa: E402
import make_deck  # noqa: E402


def put(url: str, data: bytes, ctype: str, key: str) -> None:
    req = urllib.request.Request(url, data=data, method="PUT", headers={"authorization": f"Bearer {key}", "content-type": ctype, "user-agent": "live-overlay-prep/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status >= 300:
            raise RuntimeError(f"Upload {url}: {r.status}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--pdf", type=Path, required=True)
    ap.add_argument("--mode", choices=make_deck.MODES, default=make_deck.default_mode())
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--alias", help="zusätzlich unter decks/<alias>/deck.json ablegen (feste Adresse für die App, Bilder zeigen aufs datierte Deck)")
    a = ap.parse_args()

    out = ROOT / "lectures" / a.course / a.date
    extract.extract(a.pdf, out)
    deck = make_deck.build(out, a.course, a.date, a.mode, None, ROOT / "profile.md", 6)
    if not a.upload:
        print(f"Fertig: {out / 'deck.json'}")
        return

    proxy = os.environ["PROXY_URL"].rstrip("/")
    key = os.environ["PI_KEY"]
    id_file = out / "deck-id.txt"
    deck_id = id_file.read_text().strip() if id_file.exists() else f"{a.course}_{a.date}_{secrets.token_hex(4)}"
    id_file.write_text(deck_id)
    for s in deck["slides"]:
        if s.get("image"):
            put(f"{proxy}/decks/{deck_id}/{s['image']}", (out / s["image"]).read_bytes(), "image/png", key)
    put(f"{proxy}/decks/{deck_id}/deck.json", json.dumps(deck, ensure_ascii=False).encode(), "application/json", key)
    profile = ROOT / "profile.md"
    if profile.exists():
        put(f"{proxy}/profile", profile.read_bytes(), "text/markdown", key)
    print(f"Hochgeladen. Deck-URL für die App: {proxy}/decks/{deck_id}/deck.json")
    if a.alias:
        alias = dict(deck, slides=[dict(s, image=f"{proxy}/decks/{deck_id}/{s['image']}") if s.get("image") else s for s in deck["slides"]])
        put(f"{proxy}/decks/{a.alias}/deck.json", json.dumps(alias, ensure_ascii=False).encode(), "application/json", key)
        print(f"Feste Adresse: {proxy}/decks/{a.alias}/deck.json")


if __name__ == "__main__":
    main()
