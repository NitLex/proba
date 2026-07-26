#!/usr/bin/env bash
# Re-upload product creatives to ArbTrack orchestrator.
# Usage: RUN_ID=1 TOKEN=... ./ingest.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_ID="${RUN_ID:-1}"
TOKEN="${TOKEN:-ukHi9i5XmSWNc3y5TGUgmb14}"
URL="${INGEST_URL:-https://orkestr.online/api/pipeline/ingest-creatives}"

python3 - "$DIR" "$RUN_ID" "$TOKEN" "$URL" <<'PY'
import base64, json, sys, urllib.request, urllib.error, os

base, run_id, token, url = sys.argv[1:5]
images = []
for angle in ("travel", "services"):
    path = os.path.join(base, f"{angle}-agent-0.png")
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    images.append({
        "angle_id": angle,
        "mime": "image/png",
        "data_base64": data,
        "format": "product",
    })

payload = {"run_id": int(run_id), "token": token, "images": images}
body = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        print(resp.status, resp.read().decode("utf-8", errors="replace"))
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode("utf-8", errors="replace"), file=sys.stderr)
    sys.exit(1)
PY
