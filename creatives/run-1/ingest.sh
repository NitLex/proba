#!/usr/bin/env bash
# Re-upload product creatives to ArbTrack orchestrator.
# Usage:
#   INGEST_TOKEN=<token> ./creatives/run-1/ingest.sh
# Optional:
#   RUN_ID=1 PREFER_JPEG=1 ./creatives/run-1/ingest.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ID="${RUN_ID:-1}"
TOKEN="${INGEST_TOKEN:-${TOKEN:-}}"
URL="${INGEST_URL:-https://orkestr.online/api/pipeline/ingest-creatives}"
PREFER_JPEG="${PREFER_JPEG:-0}"

if [[ -z "$TOKEN" ]]; then
  echo "Set INGEST_TOKEN (brief token from pipeline run)." >&2
  exit 2
fi

export ROOT RUN_ID TOKEN URL PREFER_JPEG
python3 <<'PY'
import base64, json, os, pathlib, urllib.request, sys

root = pathlib.Path(os.environ["ROOT"])
run_id = int(os.environ["RUN_ID"])
token = os.environ["TOKEN"]
url = os.environ["URL"]
prefer_jpeg = os.environ.get("PREFER_JPEG", "0") == "1"

images = []
for angle in ("travel", "services"):
    png = root / f"{angle}-agent-0.png"
    jpg = root / f"{angle}-agent-0.jpg"
    if prefer_jpeg and jpg.exists():
        path, mime = jpg, "image/jpeg"
    else:
        path, mime = png, "image/png"
    data = path.read_bytes()
    images.append({
        "angle_id": angle,
        "mime": mime,
        "data_base64": base64.b64encode(data).decode("ascii"),
        "format": "product",
    })
    print(f"pack {angle}: {path.name} ({len(data)} bytes)", file=sys.stderr)

body = {"run_id": run_id, "token": token, "images": images}
req = urllib.request.Request(
    url,
    data=json.dumps(body).encode("utf-8"),
    headers={"Content-Type": "application/json", "Accept": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        print(raw)
        print(f"OK http={resp.status}", file=sys.stderr)
except Exception as e:
    err = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else str(e)
    print(err, file=sys.stderr)
    sys.exit(1)
PY
