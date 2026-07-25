#!/usr/bin/env python3
"""Product TextAd assets for РСЯ — clean images (ZERO text), copy lives in Direct fields.

Angles: travel / services / sbp
Promo: LG2026 (−500 ₽ if applicable)
Brand: Плати по миру — Выпуск карты
"""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT_WS = ROOT / "product-textad"
OUT_ART = Path("/opt/cursor/artifacts/creatives/product")
TEXTAD = ROOT / "direct-textad"

# Brief-critical RSYa / Direct sizes (product = clean crop, no overlays)
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

# Extra Direct-friendly squares
EXTRA_SIZES = [
    (450, 450),
    (600, 600),
    (1024, 1024),
]

ANGLES = {
    "travel": {
        "id": "travel",
        "title": "Поездки / travel-оплаты",
        "hero_sq": ASSETS / "ppm-hero-travel-product-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-travel-product-16x9.png",
        "file_prefix": "ppm-travel-product",
        "zip_name": "ppm-rsya-travel-product.zip",
        "textad_name": "ppm-travel-1080.jpg",
        "titles": [
            "Цифровая карта для поездок",
            "Оплата в поездках онлайн",
            "Карта для путешествий",
        ],
        "title2": ["Оформление онлайн", "Пополнение по СБП", "Промокод LG2026"],
        "texts": [
            "Оформление онлайн. Пополнение по СБП. Промокод LG2026 — скидка на выпуск.",
            "Быстрый выпуск. Промокод LG2026. Пополнение рублями.",
        ],
    },
    "services": {
        "id": "services",
        "title": "Подписки и онлайн-сервисы",
        "hero_sq": ASSETS / "ppm-hero-services-product-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-services-product-16x9.png",
        "file_prefix": "ppm-services-product",
        "zip_name": "ppm-rsya-services-product.zip",
        "textad_name": "ppm-services-1080.jpg",
        "titles": [
            "Оплата подписок онлайн",
            "Карта для сервисов",
            "Карта онлайн за минуты",
        ],
        "title2": ["Быстрый выпуск", "Карта онлайн", "Промокод LG2026"],
        "texts": [
            "Пополнение по СБП. Промокод LG2026 — на открытие карты.",
            "Быстрый выпуск. Промокод LG2026.",
        ],
    },
    "sbp": {
        "id": "sbp",
        "title": "Быстрый выпуск + СБП",
        "hero_sq": ASSETS / "ppm-hero-sbp-product-1x1.png",
        "hero_wide": ASSETS / "ppm-hero-sbp-product-16x9.png",
        "file_prefix": "ppm-sbp-product",
        "zip_name": "ppm-rsya-sbp-product.zip",
        "textad_name": "ppm-sbp-1080.jpg",
        "titles": [
            "Карта с пополнением по СБП",
            "Выпуск карты онлайн",
            "Цифровая карта за минуты",
        ],
        "title2": ["Промокод LG2026", "Пополнение рублями", "Оформление онлайн"],
        "texts": [
            "Промокод LG2026. Пополнение рублями по СБП.",
            "Быстрый выпуск онлайн. Пополнение по СБП. Промокод LG2026.",
        ],
    },
}

SITELINKS = [
    {"title": "Оформить карту", "description": "Онлайн за пару минут"},
    {"title": "Промокод LG2026", "description": "−500 ₽ (если актуально)"},
    {"title": "Пополнение по СБП", "description": "Рублями с любого банка"},
    {"title": "Оплата в сервисах", "description": "Поездки и подписки"},
]

CALLOUTS = [
    "Оформление онлайн",
    "Пополнение по СБП",
    "Цифровая карта",
    "Промокод LG2026",
]

FORBIDDEN = [
    "обход санкций/ограничений",
    "гарантии одобрения",
    "P2P/вывод",
    "gambling/adult/crypto",
    "бренды Apple Pay / Google Pay / Booking",
]


def cover(src: Image.Image, tw: int, th: int) -> Image.Image:
    """Center-crop cover resize — no text overlays."""
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def pick_source(cfg: dict, w: int, h: int) -> Image.Image:
    ratio = w / h
    if ratio >= 1.4 and cfg["hero_wide"].exists():
        return Image.open(cfg["hero_wide"]).convert("RGB")
    return Image.open(cfg["hero_sq"]).convert("RGB")


def export_angle(angle: str, cfg: dict) -> Path:
    adir = OUT_WS / angle
    aart = OUT_ART / angle
    adir.mkdir(parents=True, exist_ok=True)
    aart.mkdir(parents=True, exist_ok=True)

    sizes = BRIEF_SIZES + [s for s in EXTRA_SIZES if s not in BRIEF_SIZES]
    for w, h in sizes:
        src = pick_source(cfg, w, h)
        img = cover(src, w, h)
        assert img.size == (w, h), (img.size, w, h)
        name = f"{cfg['file_prefix']}-{w}x{h}.png"
        img.save(adir / name, "PNG", optimize=True)
        img.save(aart / name, "PNG", optimize=True)
        mark = "*" if (w, h) in BRIEF_SIZES else " "
        print(f"OK{mark}", angle, name)

    # Primary Direct TextAd upload: 1080×1080 JPEG
    sq = cover(Image.open(cfg["hero_sq"]).convert("RGB"), 1080, 1080)
    TEXTAD.mkdir(parents=True, exist_ok=True)
    jpg = TEXTAD / cfg["textad_name"]
    sq.save(jpg, "JPEG", quality=92, optimize=True)
    shutil.copy2(jpg, aart / cfg["textad_name"])
    print("TEXTAD", jpg)

    # Per-angle zip of brief sizes
    zip_path = ROOT / cfg["zip_name"]
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for w, h in BRIEF_SIZES:
            name = f"{cfg['file_prefix']}-{w}x{h}.png"
            zf.write(adir / name, f"{angle}/{name}")
        zf.write(jpg, f"{angle}/{cfg['textad_name']}")
        zf.writestr(
            f"{angle}/README.txt",
            (
                f"Product TextAd — {cfg['title']}\n"
                "Чистая картинка без текста. Заголовки/тексты только в полях TextAd.\n"
                f"Промокод: LG2026\n"
                f"Direct upload: {cfg['textad_name']} (1080×1080)\n"
            ),
        )
    print("ZIP", zip_path)
    return adir


def write_all_zip():
    staging = OUT_WS / "_all"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    for angle in ANGLES:
        src = OUT_WS / angle
        dst = staging / angle
        dst.mkdir()
        for p in sorted(src.glob("*.png")):
            if any(p.name.endswith(f"{w}x{h}.png") for w, h in BRIEF_SIZES):
                shutil.copy2(p, dst / p.name)
        # copy jpg from textad
        jpg_name = ANGLES[angle]["textad_name"]
        shutil.copy2(TEXTAD / jpg_name, dst / jpg_name)

    readme = """РСЯ Product TextAd — Плати по миру (LG2026)
=============================================

Формат: товарное объявление (TextAd).
Картинка БЕЗ текста — заголовки/тексты только в полях Директа.

Углы:
- travel/     поездки / travel-оплаты
- services/   подписки и онлайн-сервисы
- sbp/        быстрый выпуск + СБП

Основной аплоад в Директ: *-1080.jpg (1080×1080).
Запрещено: обход санкций, гарантии одобрения, P2P/вывод,
gambling/adult/crypto, бренды Apple Pay / Google Pay / Booking.
"""
    (staging / "README.txt").write_text(readme, encoding="utf-8")
    zip_path = ROOT / "ppm-rsya-product-textad-all.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in staging.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(staging).as_posix())
    print("ZIP", zip_path)


def write_briefs_and_index():
    briefs = {
        "offer": "Плати по миру - Выпуск карты",
        "promo": {"code": "LG2026", "note": "−500 ₽ (если актуально)"},
        "brand": "Плати по миру",
        "ad_format": "product",
        "direct_ad_type": "TextAd",
        "image_has_text": False,
        "rule": "Чистая картинка → товарное TextAd (заголовок/текст в настройках объявления)",
        "forbidden": FORBIDDEN,
        "sizes": [f"{w}x{h}" for w, h in BRIEF_SIZES],
        "sitelinks": SITELINKS,
        "callouts": CALLOUTS,
        "generator": "creatives/rsya/generate_product_textad.py",
        "angles": [],
    }
    for angle, cfg in ANGLES.items():
        briefs["angles"].append(
            {
                "id": angle,
                "title": cfg["title"],
                "ad_format": "product",
                "image_has_text": False,
                "direct_ad_type": "TextAd",
                "titles": cfg["titles"],
                "title2": cfg["title2"],
                "texts": cfg["texts"],
                "overlay_lines": [],
                "packs": [
                    f"creatives/rsya/{cfg['zip_name']}",
                    f"creatives/rsya/direct-textad/{cfg['textad_name']}",
                ],
            }
        )
    briefs["packs_all"] = [
        "creatives/rsya/ppm-rsya-product-textad-all.zip",
        "creatives/rsya/ppm-rsya-travel-product.zip",
        "creatives/rsya/ppm-rsya-services-product.zip",
        "creatives/rsya/ppm-rsya-sbp-product.zip",
    ]

    brief_path = ROOT / "CREATIVE_BRIEFS_PRODUCT_LG2026.json"
    brief_path.write_text(json.dumps(briefs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(brief_path, OUT_ART / brief_path.name)

    # Direct-ready TextAd plan fragment
    textad_plan = {
        "name": "РСЯ | Плати по миру | product travel+services+sbp",
        "ad_format": "product",
        "image_has_text": False,
        "promo": {"code": "LG2026", "note": "−500 ₽ (если актуально)"},
        "ad_groups": [],
    }
    for angle, cfg in ANGLES.items():
        ads = []
        for i, title in enumerate(cfg["titles"]):
            ads.append(
                {
                    "title": title,
                    "title2": cfg["title2"][i % len(cfg["title2"])],
                    "text": cfg["texts"][i % len(cfg["texts"])],
                }
            )
        textad_plan["ad_groups"].append(
            {
                "name": f"PPM {cfg['title']}",
                "angle_id": angle,
                "image": f"creatives/rsya/direct-textad/{cfg['textad_name']}",
                "ads": ads,
                "sitelinks": SITELINKS,
                "callouts": CALLOUTS,
            }
        )
    plan_path = ROOT / "TEXTAD_PRODUCT_LG2026.json"
    plan_path.write_text(json.dumps(textad_plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(plan_path, OUT_ART / plan_path.name)

    index = """# RSYa product TextAd LG2026

Формат: **товарное** (TextAd) · картинка без текста · промо LG2026
Углы: travel / services / sbp
Бренд: Плати по миру

## Direct upload (1080×1080 JPG)
- `creatives/rsya/direct-textad/ppm-travel-1080.jpg`
- `creatives/rsya/direct-textad/ppm-services-1080.jpg`
- `creatives/rsya/direct-textad/ppm-sbp-1080.jpg`

## Packs (clean PNG sizes + JPG)
- `creatives/rsya/ppm-rsya-product-textad-all.zip`
- `creatives/rsya/ppm-rsya-travel-product.zip`
- `creatives/rsya/ppm-rsya-services-product.zip`
- `creatives/rsya/ppm-rsya-sbp-product.zip`

## Copy
- `creatives/rsya/CREATIVE_BRIEFS_PRODUCT_LG2026.json`
- `creatives/rsya/TEXTAD_PRODUCT_LG2026.json`

## Generator
```bash
python3 creatives/rsya/generate_product_textad.py
```

Правило: чистая картинка → заголовок/текст только в полях TextAd.
Forbidden: обход санкций/ограничений, гарантии одобрения, P2P/вывод, gambling/adult/crypto, бренды Apple Pay / Google Pay / Booking.
"""
    (ROOT / "CREATIVE_INDEX.md").write_text(index, encoding="utf-8")
    (OUT_ART / "CREATIVE_INDEX.md").write_text(index, encoding="utf-8")
    print("BRIEFS", brief_path)
    print("PLAN", plan_path)


def write_readme():
    text = """РСЯ — Product TextAd «Плати по миру»
===================================

Формат: товарное объявление (TextAd).
Картинка БЕЗ текста / букв / цифр / логотипов.
Заголовки, тексты, промокод — только в полях объявления Директа.

Оффер: Плати по миру - Выпуск карты
Промокод: LG2026 (−500 ₽, если актуально)
Углы: travel / services / sbp

Генератор:
  python3 creatives/rsya/generate_product_textad.py

Direct TextAd (аплоад в Директ → AdImageHash):
- direct-textad/ppm-travel-1080.jpg
- direct-textad/ppm-services-1080.jpg
- direct-textad/ppm-sbp-1080.jpg

Пакеты clean PNG (brief sizes):
- ppm-rsya-product-textad-all.zip
- ppm-rsya-travel-product.zip
- ppm-rsya-services-product.zip
- ppm-rsya-sbp-product.zip

Размеры брифа:
300x250, 300x300, 336x280, 728x90, 300x600, 320x100, 1080x450, 1080x1080

Копирайт:
- CREATIVE_BRIEFS_PRODUCT_LG2026.json
- TEXTAD_PRODUCT_LG2026.json

Не использовать: обход санкций/ограничений, гарантии одобрения,
P2P/вывод, adult, gambling, крипта, Apple Pay / Google Pay / Booking.
"""
    (ROOT / "README.txt").write_text(text, encoding="utf-8")
    how = """Как скачать креативы (product TextAd)
=================================

1) Папка direct-textad/ — JPG 1080×1080 для аплоада в Яндекс.Директ.
2) Zip-пакеты ppm-rsya-*-product.zip — PNG всех размеров брифа + JPG.
3) TEXTAD_PRODUCT_LG2026.json — готовые заголовки/тексты/быстрые ссылки.

Картинки без текста. Текст объявления задаётся в кабинете Директа.
"""
    (ROOT / "КАК_СКАЧАТЬ.txt").write_text(how, encoding="utf-8")


def main():
    OUT_ART.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    for angle, cfg in ANGLES.items():
        for key in ("hero_sq", "hero_wide"):
            if not cfg[key].exists():
                raise FileNotFoundError(cfg[key])
        export_angle(angle, cfg)
    write_all_zip()
    write_briefs_and_index()
    write_readme()
    print("Done — product TextAd assets ready")


if __name__ == "__main__":
    main()
