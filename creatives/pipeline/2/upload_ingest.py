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
DEFAULT_TOKEN = "t-DTilhyDMkuJg3hgXiGk6f9"
VARIANTS = (0, 1, 2)


def load_image(path: Path) -> tuple[str, bytes]:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png", data
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg", data
    raise SystemExit(f"Unsupported image type: {path}")


def collect_images(images_dir: Path, prefer_jpeg: bool) -> list[dict]:
    images: list[dict] = []
    for variant in VARIANTS:
        jpg = images_dir / f"generic-agent-{variant}.jpg"
        png = images_dir / f"generic-agent-{variant}.png"
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
                "_path": str(path),
                "_bytes": len(raw),
            }
        )
        print(
            f"pack generic/{variant}: {path.name} ({mime}, {len(raw)} bytes)",
            file=sys.stderr,
        )
    return images


def post_one(url: str, run_id: int, token: str, image: dict) -> tuple[int, str]:
    payload_image = {
        "angle_id": image["angle_id"],
        "mime": image["mime"],
        "data_base64": image["data_base64"],
        "format": image["format"],
    }
    body = json.dumps(
        {"run_id": run_id, "token": token, "images": [payload_image]},
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
    except urllib.error.URLError as exc:
        return 0, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--run-id", type=int, default=2)
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    parser.add_argument("--prefer-jpeg", action="store_true", default=True)
    parser.add_argument("--prefer-png", action="store_true")
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path(__file__).resolve().parent,
    )
    parser.add_argument(
        "--status-out",
        type=Path,
        default=None,
        help="Write ingest_status.json (default: next to images)",
    )
    args = parser.parse_args()
    prefer_jpeg = not args.prefer_png
    images = collect_images(args.dir, prefer_jpeg=prefer_jpeg)

    uploads = []
    ok = True
    for image in images:
        status, body = post_one(args.url, args.run_id, args.token, image)
        print(f"POST {Path(image['_path']).name} -> HTTP {status}", file=sys.stderr)
        print(body[:500], file=sys.stderr)
        uploads.append(
            {
                "angle_id": image["angle_id"],
                "file": Path(image["_path"]).name,
                "mime": image["mime"],
                "size": image["_bytes"],
                "status": status,
                "body": body[:2000],
            }
        )
        if status not in (200, 201):
            ok = False

    status_doc = {
        "ok": ok,
        "run_id": args.run_id,
        "url": args.url,
        "token_prefix": args.token[:8] if args.token else "",
        "uploads": uploads,
        "local_assets": [
            {
                "angle_id": "generic",
                "file": f"generic-agent-{v}.png",
                "jpg": f"generic-agent-{v}.jpg",
                "format": "product",
                "size": "1024x1024",
            }
            for v in VARIANTS
        ],
    }
    out = args.status_out or (args.dir / "ingest_status.json")
    out.write_text(json.dumps(status_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
