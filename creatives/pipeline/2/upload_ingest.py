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
# Two product variants for the single generic angle (rotation)
FILES = (
    ("generic", "generic-agent-0"),
    ("generic", "generic-agent-1"),
)


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
    for angle, stem in FILES:
        jpg = images_dir / f"{stem}.jpg"
        png = images_dir / f"{stem}.png"
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
                "_file": path.name,
                "_size": len(raw),
            }
        )
        print(f"pack {angle}/{stem}: {path.name} ({mime}, {len(raw)} bytes)", file=sys.stderr)
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
    parser.add_argument("--dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument(
        "--prefer-jpeg",
        action="store_true",
        help="Prefer smaller JPEG variants to avoid nginx 413",
    )
    args = parser.parse_args()

    images = collect_images(args.dir, args.prefer_jpeg)
    ok = True
    results = []
    for image in images:
        status, text = post_one(args.url, args.run_id, args.token, image)
        label = image.get("_file", image["angle_id"])
        print(f"{label}: HTTP {status}")
        print(text[:2000])
        results.append(
            {
                "angle_id": image["angle_id"],
                "file": image.get("_file"),
                "mime": image["mime"],
                "size": image.get("_size"),
                "status": status,
                "body": text[:2000],
            }
        )
        if status >= 400:
            ok = False

    out = args.dir / "ingest_status.json"
    out.write_text(
        json.dumps(
            {
                "ok": ok,
                "run_id": args.run_id,
                "url": args.url,
                "uploads": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
