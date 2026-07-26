#!/usr/bin/env python3
"""Upload product creatives for ArbTrack pipeline run to ingest-creatives."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://trekerarbitrag.ru/api/pipeline/ingest-creatives"
ANGLES = ("travel", "services", "sbp")


def load_image(path: Path) -> tuple[str, bytes]:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png", data
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg", data
    raise SystemExit(f"Unsupported image type: {path}")


def build_payload(run_id: int, token: str, images_dir: Path, prefer_jpeg: bool) -> dict:
    images = []
    for angle in ANGLES:
        jpg = images_dir / f"{angle}-agent-0.jpg"
        png = images_dir / f"{angle}-agent-0.png"
        path = jpg if prefer_jpeg and jpg.exists() else png
        if not path.exists():
            raise SystemExit(f"Missing creative: {path}")
        mime, raw = load_image(path)
        images.append(
            {
                "angle_id": angle,
                "mime": mime,
                "data_base64": base64.b64encode(raw).decode("ascii"),
                "format": "product",
            }
        )
        print(f"pack {angle}: {path.name} ({mime}, {len(raw)} bytes)", file=sys.stderr)
    return {"run_id": run_id, "token": token, "images": images}


def post_one(url: str, run_id: int, token: str, image: dict) -> tuple[int, str]:
    body = json.dumps(
        {"run_id": run_id, "token": token, "images": [image]},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--run-id", type=int, default=1)
    parser.add_argument("--token", required=True)
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path(__file__).resolve().parent,
    )
    parser.add_argument(
        "--prefer-jpeg",
        action="store_true",
        help="Prefer smaller JPEG variants to avoid nginx 413",
    )
    args = parser.parse_args()

    payload = build_payload(args.run_id, args.token, args.dir, args.prefer_jpeg)
    results = []
    ok = True
    for image in payload["images"]:
        status, text = post_one(args.url, args.run_id, args.token, image)
        print(f"{image['angle_id']}: HTTP {status}")
        print(text[:2000])
        results.append({"angle_id": image["angle_id"], "status": status, "body": text})
        if status >= 400:
            ok = False

    status_path = args.dir / "ingest_status.json"
    status_path.write_text(
        json.dumps(
            {
                "url": args.url,
                "run_id": args.run_id,
                "ok": ok,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
