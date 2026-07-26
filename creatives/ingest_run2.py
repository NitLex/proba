#!/usr/bin/env python3
"""Upload pipeline run-2 creatives to orkestr.online ingest API."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://orkestr.online/api/pipeline/ingest-creatives"
DEFAULT_TOKEN = "ymUMyW2gls5ByNgBB9fHfNId"
DEFAULT_RUN_ID = 2
ROOT = Path(__file__).resolve().parent / "pipeline" / "2"
FILES = [
    "generic-agent-0.png",
    "generic-agent-1.png",
    "generic-agent-2.png",
]


def build_payload(run_id: int, token: str, files: list[Path]) -> dict:
    images = []
    for path in files:
        images.append(
            {
                "angle_id": "generic",
                "mime": "image/png",
                "data_base64": base64.b64encode(path.read_bytes()).decode("ascii"),
                "format": "product",
            }
        )
    return {"run_id": run_id, "token": token, "images": images}


def ingest(url: str, payload: dict, timeout: int = 180) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--run-id", type=int, default=DEFAULT_RUN_ID)
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    parser.add_argument("--dir", type=Path, default=ROOT)
    args = parser.parse_args()

    files = [args.dir / name for name in FILES]
    missing = [str(p) for p in files if not p.exists()]
    if missing:
        print("Missing files:", *missing, sep="\n  ", file=sys.stderr)
        return 2

    payload = build_payload(args.run_id, args.token, files)
    print(f"Uploading {len(files)} images for run_id={args.run_id} …")
    status, text = ingest(args.url, payload)
    print(status, text[:2000])
    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
