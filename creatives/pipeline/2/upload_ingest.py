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

DEFAULT_URL = "https://orkestr.online/api/pipeline/ingest-creatives"
# Two variants for the single generic angle (rotation)
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
        print(f"pack {angle}/{path.name}: {mime}, {len(raw)} bytes", file=sys.stderr)
    return images


def load_briefs(images_dir: Path) -> list[dict]:
    textad = images_dir / "TEXTAD_PRODUCT.json"
    if not textad.exists():
        return []
    data = json.loads(textad.read_text(encoding="utf-8"))
    out = []
    for angle in data.get("angles") or []:
        out.append(
            {
                "angle_id": angle["angle_id"],
                "titles": angle.get("titles") or [],
                "texts": angle.get("texts") or [],
                "callouts": angle.get("callouts") or [],
                "sitelinks": angle.get("sitelinks") or [],
            }
        )
    return out


def post_batch(url: str, run_id: int, token: str, images: list[dict], briefs: list[dict]) -> tuple[int, str]:
    payload_images = [
        {k: v for k, v in img.items() if not k.startswith("_")} for img in images
    ]
    body_obj: dict = {"run_id": run_id, "token": token, "images": payload_images}
    if briefs:
        body_obj["briefs"] = briefs
    body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
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


def post_one(url: str, run_id: int, token: str, image: dict, briefs: list[dict] | None) -> tuple[int, str]:
    payload = {k: v for k, v in image.items() if not k.startswith("_")}
    body_obj: dict = {"run_id": run_id, "token": token, "images": [payload]}
    if briefs:
        body_obj["briefs"] = briefs
    body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
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
    parser.add_argument(
        "--one-by-one",
        action="store_true",
        help="Upload each image in a separate request",
    )
    args = parser.parse_args()

    images = collect_images(args.dir, args.prefer_jpeg)
    briefs = load_briefs(args.dir)
    ok = True
    results = []

    if args.one_by_one:
        for i, image in enumerate(images):
            status, text = post_one(
                args.url, args.run_id, args.token, image, briefs if i == 0 else None
            )
            print(f"{image['angle_id']}/{image['_file']}: HTTP {status}")
            print(text[:2000])
            results.append(
                {
                    "angle_id": image["angle_id"],
                    "file": image["_file"],
                    "status": status,
                    "size": image["_size"],
                    "body": text[:2000],
                }
            )
            if status >= 400:
                ok = False
    else:
        status, text = post_batch(args.url, args.run_id, args.token, images, briefs)
        print(f"batch: HTTP {status}")
        print(text[:2000])
        results.append({"batch": True, "status": status, "body": text[:2000]})
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
