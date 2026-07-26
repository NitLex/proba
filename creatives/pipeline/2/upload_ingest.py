#!/usr/bin/env python3
"""Upload run-2 product creatives to ArbTrack ingest API (one JPEG per request)."""
from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_URL = 'https://trekerarbitrag.ru/api/pipeline/ingest-creatives'
ANGLES = ('travel', 'services', 'sbp')


def encode(path: Path) -> tuple[str, str]:
    data = path.read_bytes()
    mime = 'image/jpeg' if path.suffix.lower() in {'.jpg', '.jpeg'} else 'image/png'
    return mime, base64.b64encode(data).decode('ascii')


def post(url: str, payload: dict) -> tuple[int, str]:
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', required=True, help='Fresh ingest token from pipeline run')
    ap.add_argument('--run-id', type=int, default=2)
    ap.add_argument('--url', default=DEFAULT_URL)
    ap.add_argument('--png', action='store_true', help='Force PNG instead of JPEG')
    args = ap.parse_args()

    prefer_jpeg = not args.png
    results = []
    for angle in ANGLES:
        path = HERE / (f'{angle}-agent-0.jpg' if prefer_jpeg else f'{angle}-agent-0.png')
        if not path.exists():
            path = HERE / f'{angle}-agent-0.png'
        if not path.exists():
            print(f'missing {angle}', file=sys.stderr)
            return 2
        mime, b64 = encode(path)
        payload = {
            'run_id': args.run_id,
            'token': args.token,
            'images': [
                {
                    'angle_id': angle,
                    'mime': mime,
                    'data_base64': b64,
                    'format': 'product',
                }
            ],
        }
        status, raw = post(args.url, payload)
        print(f'{angle}: HTTP {status} ({path.name}, {path.stat().st_size} bytes)')
        print(raw[:500])
        results.append({'angle_id': angle, 'status': status, 'body': raw, 'file': path.name})

    out = HERE / 'ingest_status.json'
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if all(r['status'] == 200 for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
