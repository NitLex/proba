#!/usr/bin/env python3
"""Product TextAd assets for Плати по миру — clean images, ZERO text on banners.

Yandex Direct product format:
  image_has_text = false → TextAd (titles/texts only in ad fields).
  Prefer 1080×1080 JPEG (≥450×450).

Angles: travel / services / sbp
Promo: LG2026 (−500 ₽ if applicable)
"""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT_WS = ROOT / "product-textad"
OUT_ART = Path("/opt/cursor/artifacts/creatives/product-textad")
TEXTAD = ROOT / "direct-textad"
ZIP_NAME = "ppm-rsya-product-textad.zip"

BRIEF_SIZES = [
    (300, 250),
    (300, 300),
    (336, 280),
    (728, 90),
    (300, 600),
    (320, 100),
    (1080, 450),
    (1080, 1080),
]

ANGLES = {
    "travel": {
        "title": "Поездки / travel-оплаты",
        "hero_sq": ASSETS / "ppm-hero-travel-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-travel-16x9.png",
        "textad_name": "ppm-travel-1080.jpg",
        "file_prefix": "ppm-travel-product",
        # Soft cool grade — keep travel mood, no overlays
        "grade": {"color": 1.05, "contrast": 1.08, "brightness": 1.0},
    },
    "services": {
        "title": "Подписки и онлайн-сервисы",
        "hero_sq": ASSETS / "ppm-hero-services-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-services-16x9.png",
        "textad_name": "ppm-services-1080.jpg",
        "file_prefix": "ppm-services-product",
        "grade": {"color": 1.08, "contrast": 1.06, "brightness": 1.02},
    },
    "sbp": {
        "title": "Быстрый выпуск + СБП",
        "hero_sq": ASSETS / "ppm-hero-sbp-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-sbp-16x9.png",
        "textad_name": "ppm-sbp-1080.jpg",
        "file_prefix": "ppm-sbp-product",
        "grade": {"color": 1.04, "contrast": 1.1, "brightness": 1.0},
    },
}


def cover_crop(im: Image.Image, w: int, h: int) -> Image.Image:
    """Center-crop to target aspect, then resize (no letterbox, no text)."""
    src_w, src_h = im.size
    target_ratio = w / h
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        new_w = int(src_h * target_ratio)
        left = (src_w - new_w) // 2
        im = im.crop((left, 0, left + new_w, src_h))
    elif src_ratio < target_ratio:
        new_h = int(src_w / target_ratio)
        top = (src_h - new_h) // 2
        im = im.crop((0, top, src_w, top + new_h))
    return im.resize((w, h), Image.Resampling.LANCZOS)


def grade(im: Image.Image, cfg: dict) -> Image.Image:
    im = ImageEnhance.Color(im).enhance(cfg.get("color", 1.0))
    im = ImageEnhance.Contrast(im).enhance(cfg.get("contrast", 1.0))
    im = ImageEnhance.Brightness(im).enhance(cfg.get("brightness", 1.0))
    # Tiny unsharp for RSYa sharpness without looking processed
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=3))


def pick_hero(cfg: dict, w: int, h: int) -> Image.Image:
    ratio = w / h
    path = cfg["hero_wide"] if ratio >= 1.4 else cfg["hero_sq"]
    if not path.exists():
        path = cfg["hero_sq"]
    return Image.open(path).convert("RGB")


def make_product(w: int, h: int, cfg: dict) -> Image.Image:
    base = pick_hero(cfg, w, h)
    img = cover_crop(base, w, h)
    return grade(img, cfg["grade"])


def export_angle(angle: str, cfg: dict) -> Path:
    adir = OUT_WS / angle
    aart = OUT_ART / angle
    adir.mkdir(parents=True, exist_ok=True)
    aart.mkdir(parents=True, exist_ok=True)

    for w, h in BRIEF_SIZES:
        img = make_product(w, h, cfg)
        assert img.size == (w, h), (img.size, w, h)
        name = f"{cfg['file_prefix']}-{w}x{h}.png"
        img.save(adir / name, "PNG", optimize=True)
        img.save(aart / name, "PNG", optimize=True)
        print("OK", angle, name)

    # Primary Direct TextAd upload: 1080×1080 JPEG
    sq = make_product(1080, 1080, cfg).convert("RGB")
    TEXTAD.mkdir(parents=True, exist_ok=True)
    jpg = TEXTAD / cfg["textad_name"]
    sq.save(jpg, "JPEG", quality=92, optimize=True)
    shutil.copy2(jpg, aart / cfg["textad_name"])
    print("TEXTAD", jpg)
    return adir


def build_zip(angle_dirs: dict[str, Path]) -> Path:
    staging = ROOT / "_product_zip_staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    for angle, src in angle_dirs.items():
        dst = staging / angle
        dst.mkdir(parents=True)
        for p in sorted(src.glob("*.png")):
            shutil.copy2(p, dst / p.name)
        # also drop the 1080 jpg next to packs
        jpg = TEXTAD / ANGLES[angle]["textad_name"]
        if jpg.exists():
            shutil.copy2(jpg, dst / jpg.name)

    readme = """РСЯ товарные объявления (TextAd) — Плати по миру
=================================================

Формат: product · картинка БЕЗ текста · заголовки/тексты только в полях TextAd
Промокод: LG2026 (−500 ₽ если актуально)
Углы: travel / services / sbp

Папки:
- travel/    — поездки / travel-оплаты
- services/  — подписки и онлайн-сервисы
- sbp/       — быстрый выпуск + СБП

Размеры (PNG): 300x250, 300x300, 336x280, 728x90, 300x600, 320x100, 1080x450, 1080x1080
Для загрузки в Директ TextAd предпочтительно: *-1080.jpg (1080×1080)

Запрещено на картинке: любой текст, буквы, цифры, логотипы брендов/банков.
Запрещено в текстах: обход санкций/ограничений, гарантии одобрения, P2P/вывод,
gambling/adult/crypto, бренды Apple Pay / Google Pay / Booking.
"""
    (staging / "README.txt").write_text(readme, encoding="utf-8")

    lines = []
    for angle in ("travel", "services", "sbp"):
        for p in sorted((staging / angle).glob("*")):
            if p.is_file():
                lines.append(f"{angle}/{p.name}")
    (staging / "manifest.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    zip_path = ROOT / ZIP_NAME
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in staging.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(staging).as_posix())
    shutil.rmtree(staging)
    shutil.copy2(zip_path, OUT_ART / ZIP_NAME)
    print("ZIP", zip_path)
    return zip_path


def write_index() -> None:
    text = """# RSYa product TextAd — LG2026

Format: **product** (clean image → TextAd fields)
Promo: LG2026 (−500 ₽ if applicable)
Brand / offer: Плати по миру — Выпуск карты
Angles: travel · services · sbp

## Direct TextAd images (1080×1080 JPG)
- `creatives/rsya/direct-textad/ppm-travel-1080.jpg`
- `creatives/rsya/direct-textad/ppm-services-1080.jpg`
- `creatives/rsya/direct-textad/ppm-sbp-1080.jpg`

## Pack
- `creatives/rsya/ppm-rsya-product-textad.zip` — brief sizes PNG × 3 angles + JPG

## Copy
- `creatives/rsya/CREATIVE_BRIEFS_PRODUCT_LG2026.json`
- `creatives/rsya/TEXTAD_COPY.md`

## Generator
```bash
python3 creatives/rsya/generate_product_textad.py
```

Rule: ZERO text on image. Titles/texts/sitelinks/callouts only in Direct fields.
"""
    (ROOT / "CREATIVE_INDEX.md").write_text(text, encoding="utf-8")
    (OUT_ART / "CREATIVE_INDEX.md").write_text(text, encoding="utf-8")


def main() -> None:
    OUT_ART.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    angle_dirs: dict[str, Path] = {}
    for angle, cfg in ANGLES.items():
        for key in ("hero_sq", "hero_wide"):
            if not cfg[key].exists():
                raise FileNotFoundError(cfg[key])
        angle_dirs[angle] = export_angle(angle, cfg)

    build_zip(angle_dirs)
    write_index()

    meta = {
        "ad_format": "product",
        "image_has_text": False,
        "direct_ad_type": "TextAd",
        "promo": {"code": "LG2026", "note": "−500 ₽ (если актуально)"},
        "angles": list(ANGLES.keys()),
        "textad": [f"creatives/rsya/direct-textad/{c['textad_name']}" for c in ANGLES.values()],
        "zip": f"creatives/rsya/{ZIP_NAME}",
    }
    (OUT_ART / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done", meta)


if __name__ == "__main__":
    main()
