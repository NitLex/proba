#!/usr/bin/env bash
# Re-upload product creatives for pipeline run 1.
# Usage:
#   INGEST_TOKEN='<token from orchestrator>' ./creatives/run-1/ingest.sh
# Optional:
#   RUN_ID=1 INGEST_URL=https://orkestr.online/api/pipeline/ingest-creatives ./creatives/run-1/ingest.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ID="${RUN_ID:-1}"
INGEST_URL="${INGEST_URL:-https://orkestr.online/api/pipeline/ingest-creatives}"
TOKEN="${INGEST_TOKEN:-${1:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "Missing ingest token. Pass INGEST_TOKEN or as first arg." >&2
  exit 1
fi

python3 - "$ROOT" "$RUN_ID" "$TOKEN" "$INGEST_URL" <<'PY'
import base64, json, pathlib, sys, urllib.request, urllib.error

root = pathlib.Path(sys.argv[1])
run_id = int(sys.argv[2])
token = sys.argv[3]
url = sys.argv[4]

for angle in ("travel", "services"):
    jpg = root / f"{angle}-agent-0.jpg"
    png = root / f"{angle}-agent-0.png"
    path = jpg if jpg.exists() else png
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    payload = {
        "run_id": run_id,
        "token": token,
        "images": [
            {
                "angle_id": angle,
                "mime": mime,
                "data_base64": base64.b64encode(path.read_bytes()).decode("ascii"),
                "format": "product",
            }
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read().decode()
            print(f"OK {angle} HTTP {resp.status}")
            print(body[:1200])
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERR {angle} HTTP {e.code}")
        print(body[:1200])
        raise SystemExit(1)
PY
