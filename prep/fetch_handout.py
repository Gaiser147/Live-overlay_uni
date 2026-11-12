"""Neuestes Handout eines Kurses aus Moodle holen (Moodle-Webservice-Token).

Aufruf:
    python prep/fetch_handout.py --course-id 50680 --pattern 'w\\d+_handout\\.pdf' --out lectures/mathe-info-2/2026-11-10/handout.pdf
    python prep/fetch_handout.py ... --watch-until 13:30     # am Vorlesungstag stündlich prüfen, bis 30 min vor Beginn
    python prep/fetch_handout.py ... --max-age-hours 72      # ältere Handouts (z. B. letzte Woche) nicht nehmen

Umgebung:
    MOODLE_URL    z. B. https://moodle2.uni-potsdam.de
    MOODLE_TOKEN  Webservice-Token (derselbe wie im uni_mcp / up_moodle.py)

Auslöser für eine neue Vorbereitung ist ein neuer Datei-Hash. Gibt 0 zurück, wenn eine neue Datei
geladen wurde, 3 wenn sich nichts geändert hat.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


def call(base: str, token: str, fn: str, **params) -> object:
    q = {"wstoken": token, "wsfunction": fn, "moodlewsrestformat": "json", **params}
    with urllib.request.urlopen(f"{base}/webservice/rest/server.php?{urllib.parse.urlencode(q)}", timeout=30) as r:
        data = json.load(r)
    if isinstance(data, dict) and data.get("exception"):
        raise RuntimeError(f"Moodle: {data.get('message')}")
    return data


def newest_file(base: str, token: str, course_id: int, pattern: str, max_age_h: float | None = None) -> dict | None:
    rx = re.compile(pattern, re.I)
    oldest = time.time() - max_age_h * 3600 if max_age_h else 0
    best = None
    for section in call(base, token, "core_course_get_contents", courseid=course_id):  # type: ignore[union-attr]
        for mod in section.get("modules", []):
            for c in mod.get("contents", []) or []:
                if c.get("type") == "file" and rx.search(c.get("filename", "")) and c.get("timemodified", 0) >= oldest:
                    if not best or c.get("timemodified", 0) > best.get("timemodified", 0):
                        best = c
    return best


def download(url: str, token: str) -> bytes:
    sep = "&" if "?" in url else "?"
    with urllib.request.urlopen(f"{url}{sep}token={urllib.parse.quote(token)}", timeout=60) as r:
        return r.read()


def fetch_once(course_id: int, pattern: str, out: Path, max_age_h: float | None = None) -> bool:
    base = os.environ["MOODLE_URL"].rstrip("/")
    token = os.environ["MOODLE_TOKEN"]
    f = newest_file(base, token, course_id, pattern, max_age_h)
    if not f:
        print("Kein passendes Handout gefunden.", file=sys.stderr)
        return False
    data = download(f["fileurl"], token)
    digest = hashlib.sha256(data).hexdigest()
    stamp = out.with_suffix(".sha256")
    if out.exists() and stamp.exists() and stamp.read_text().strip() == digest:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    stamp.write_text(digest)
    print(f"Neu: {f['filename']} ({len(data) // 1024} KB) → {out}")
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course-id", type=int, required=True)
    ap.add_argument("--pattern", default=r"handout\.pdf$")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--watch-until", help="HH:MM – bis dahin stündlich prüfen")
    ap.add_argument("--max-age-hours", type=float, help="nur Dateien, die höchstens so alt sind (Moodle-timemodified)")
    a = ap.parse_args()
    if not a.watch_until:
        sys.exit(0 if fetch_once(a.course_id, a.pattern, a.out, a.max_age_hours) else 3)
    h, m = map(int, a.watch_until.split(":"))
    deadline = datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
    while datetime.now() < deadline:
        if fetch_once(a.course_id, a.pattern, a.out, a.max_age_hours):
            sys.exit(0)
        time.sleep(min(3600, max(60, (deadline - datetime.now()).total_seconds())))
    sys.exit(3)


if __name__ == "__main__":
    main()
