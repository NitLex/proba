#!/usr/bin/env bash
# Upload product creatives for pipeline run 1 to orchestrator.
# Usage: INGEST_TOKEN=... ./creatives/run-1/ingest.sh
set -euo pipefail

RUN_ID="${RUN_ID:-1}"
TOKEN="${INGEST_TOKEN:-r4bqVBWSdnK2Mo6v0uDtAGQi}"
URL="${INGEST_URL:-https://orkestr.online/api/pipeline/ingest-creatives}"
DIR="$(cd "$(dirname "$0")" && pwd)"

python3 - "$URL" "$RUN_ID" "$TOKEN" "$DIR" <<'PY'
import base64, json, sys, urllib.request, urllib.error
from pathlib import Path

url, run_id, token, directory = sys.argv[1], int(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
images = []
for angle_id in ("travel", "services"):
    path = directory / f"{angle_id}-agent-0.png"
    if not path.exists():
        # fallback to gitignored pipeline path
        path = Path("creatives/pipeline/1") / f"{angle_id}-agent-0.png"
    data = path.read_bytes()
    images.append({
        "angle_id": angle_id,
        "mime": "image/png",
        "data_base64": base64.b64encode(data).decode("ascii"),
        "format": "product",
    })
    print(f"packed {angle_id}: {path} ({len(data)} bytes)")

payload = {"run_id": run_id, "token": token, "images": images}
body = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        print(resp.status, resp.read().decode())
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode(), file=sys.stderr)
    sys.exit(1)
PY
