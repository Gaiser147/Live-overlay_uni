#!/usr/bin/env bash
# Vorbereitung am Vorlesungstag: auf das neue Handout in Moodle warten, Karten bauen, hochladen.
#
#   prep/lecture_day.sh <kurs> <moodle-kurs-id> <dateimuster> <warten-bis HH:MM> [alias]
#   prep/lecture_day.sh mathe-info-2 50680 'w\d+_handout\.pdf' 13:30 mathe-info-2_aktuell
#
# Erwartet in der Umgebung (z. B. per systemd EnvironmentFile): MOODLE_TOKEN, PROXY_URL, PI_KEY,
# optional ANTHROPIC_API_KEY (sonst baut die lokal angemeldete Claude-Code-CLI die Karten).
# Handouts, die älter als 72 h sind (z. B. das der Vorwoche), zählen nicht.
# Exit 0 = Deck hochgeladen, 3 = bis zur Frist kein neues Handout.
set -euo pipefail

course=$1 course_id=$2 pattern=$3 until=$4 alias=${5:-}
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
day=$(date +%F)
out="$root/lectures/$course/$day"
export MOODLE_URL=${MOODLE_URL:-https://moodle2.uni-potsdam.de}

cd "$here"
set +e
.venv/bin/python fetch_handout.py --course-id "$course_id" --pattern "$pattern" \
  --out "$out/handout.pdf" --watch-until "$until" --max-age-hours 72
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo "Kein neues Handout für $course bis $until (Exit $rc)." >&2
  exit "$rc"
fi

.venv/bin/python run.py --course "$course" --date "$day" --pdf "$out/handout.pdf" --upload ${alias:+--alias "$alias"}
