#!/usr/bin/env python3
"""Upload product creatives for ArbTrack pipeline run 2 to ingest-creatives."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://orkestr.online/api/pipeline/ingest-creatives"
VARIANTS = ("generic-agent-0", "generic-agent-1")


def load_image(path: Path) -> tuple[str, bytes]:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png", data
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg", data
    raise SystemExit(f"Unsupported image type: {path}")


def collect_images(images_dir: Path, prefer_jpeg: bool) -> list[dict]:
    images = []
    for stem in VARIANTS:
        jpg = images_dir / f"{stem}.jpg"
        png = images_dir / f"{stem}.png"
        path = jpg if prefer_jpeg and jpg.exists() else png
        if not path.exists():
            raise SystemExit(f"Missing creative: {path}")
        mime, raw = load_image(path)
        images.append(
            {
                "angle_id": "generic",
                "mime": mime,
                "data_base64": base64.b64encode(raw).decode("ascii"),
                "format": "product",
                "_file": path.name,
                "_size": len(raw),
            }
        )
        print(
            f"pack generic/{stem}: {path.name} ({mime}, {len(raw)} bytes)",
            file=sys.stderr,
        )
    return images


def post_one(url: str, run_id: int, token: str, image: dict) -> tuple[int, str]:
    payload = {
        "angle_id": image["angle_id"],
        "mime": image["mime"],
        "data_base64": image["data_base64"],
        "format": image["format"],
    }
    body = json.dumps(
        {"run_id": run_id, "token": token, "images": [payload]},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--run-id", type=int, default=2)
    parser.add_argument("--token", required=True)
    parser.add_argument(
        "--dir",
        default=str(Path(__file__).resolve().parent),
        help="Directory with generic-agent-*.png/.jpg",
    )
    parser.add_argument(
        "--prefer-jpeg",
        action="store_true",
        default=True,
        help="Prefer JPEG when available (default: on)",
    )
    parser.add_argument("--png", action="store_true", help="Force PNG upload")
    parser.add_argument(
        "--status-out",
        default=str(Path(__file__).resolve().parent / "ingest_status.json"),
    )
    args = parser.parse_args()
    prefer_jpeg = False if args.png else args.prefer_jpeg

    images = collect_images(Path(args.dir), prefer_jpeg=prefer_jpeg)
    results = []
    ok = True
    for image in images:
        status, body = post_one(args.url, args.run_id, args.token, image)
        print(f"{image['_file']}: HTTP {status}", file=sys.stderr)
        print(body[:2000], file=sys.stderr)
        results.append(
            {
                "file": image["_file"],
                "bytes": image["_size"],
                "mime": image["mime"],
                "http_status": status,
                "body": body[:4000],
            }
        )
        if status < 200 or status >= 300:
            ok = False

    status_doc = {
        "ok": ok,
        "run_id": args.run_id,
        "url": args.url,
        "prefer_jpeg": prefer_jpeg,
        "results": results,
    }
    Path(args.status_out).write_text(
        json.dumps(status_doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {args.status_out}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
