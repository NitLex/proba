#!/usr/bin/env python3
"""Generate RSYa graphic ad banners for Плати по миру — exact pixel sizes."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path("/opt/cursor/artifacts/banners/rsya")
OUT_WS = Path("/workspace/creatives/rsya/banners")
ASSETS = Path("/opt/cursor/artifacts/assets")

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

SIZES = [
    (1000, 120),
    (1080, 450),
    (1280, 256),
    (160, 600),
    (1706, 184),
    (240, 400),
    (240, 600),
    (300, 250),
    (300, 300),
    (300, 500),
    (300, 600),
    (320, 100),
    (320, 480),
    (320, 50),
    (336, 280),
    (480, 320),
    (728, 90),
    (940, 1524),
    (970, 250),
]

OFFERS = {
    "travel": {
        "title": "Карта для путешествий",
        "title_short": "Карта для путешествий",
        "title_tiny": "Карта Travel",
        "sub": "Booking, Uber, магазины за границей",
        "sub_short": "Оплата за границей",
        "cta": "Открыть карту",
        "cta_short": "Открыть",
        "promo": "LG2026",
        "promo_text": "−500 ₽",
        "promo_full": "LG2026 · −500 ₽",
        "bg": (11, 31, 51),
        "bg2": (14, 90, 110),
        "accent": (45, 200, 180),
        "accent2": (232, 238, 243),
        "card": ASSETS / "ppm-travel-4x5.png",
        "hero": ASSETS / "ppm-rsya-travel-16x9.png",
    },
    "subscriptions": {
        "title": "Карта для зарубежных сервисов",
        "title_short": "Карта для сервисов",
        "title_tiny": "Карта USD",
        "sub": "Spotify, ChatGPT, Steam, Canva",
        "sub_short": "Подписки и сервисы",
        "cta": "Оформить онлайн",
        "cta_short": "Оформить",
        "promo": "LG2026",
        "promo_text": "−500 ₽",
        "promo_full": "LG2026 · −500 ₽",
        "bg": (18, 16, 24),
        "bg2": (90, 55, 30),
        "accent": (242, 166, 90),
        "accent2": (255, 240, 220),
        "card": ASSETS / "ppm-subscriptions-4x5.png",
        "hero": ASSETS / "ppm-rsya-subs-16x9.png",
    },
    "premium": {
        "title": "Премиальная карта",
        "title_short": "Премиальная карта",
        "title_tiny": "Premium",
        "sub": "Выгодный курс · оплата за границей",
        "sub_short": "Выгодный курс",
        "cta": "Открыть премиум",
        "cta_short": "Открыть",
        "promo": "LG2026",
        "promo_text": "−500 ₽",
        "promo_full": "LG2026 · −500 ₽",
        "bg": (8, 20, 18),
        "bg2": (20, 70, 55),
        "accent": (212, 175, 90),
        "accent2": (240, 230, 200),
        "card": ASSETS / "ppm-premium-4x5.png",
        "hero": ASSETS / "ppm-rsya-premium-16x9.png",
    },
}

BRAND = "Плати по миру"


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REG
    return ImageFont.truetype(path, max(8, size))


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_w: int, start: int, bold=True, min_size=9):
    size = start
    while size > min_size:
        f = font(size, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 1
    return font(min_size, bold)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(w, h, c1, c2, vertical=True):
    import numpy as np

    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    t = ys * 0.85 + xs * 0.15 if vertical else xs * 0.85 + ys * 0.15
    t = np.clip(t, 0, 1)
    c1a = np.array(c1, dtype=np.float32)
    c2a = np.array(c2, dtype=np.float32)
    arr = (c1a + (c2a - c1a) * t[..., None]).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def cover_crop(src: Image.Image, tw: int, th: int) -> Image.Image:
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def soft_vignette(base: Image.Image, strength=0.35):
    w, h = base.size
    overlay = Image.new("RGB", (w, h), (0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    m = mask.load()
    cx, cy = w / 2, h / 2
    max_r = math.hypot(cx, cy)
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - cx, y - cy) / max_r
            m[x, y] = int(min(255, max(0, (d - 0.35) / 0.65 * 255 * strength)))
    return Image.composite(overlay, base, mask)


def draw_cta(draw, x, y, w, h, text, accent, text_color=(10, 16, 20)):
    r = max(4, min(h // 2, 18))
    rounded_rect(draw, (x, y, x + w, y + h), r, fill=accent)
    f = fit_font(draw, text, w - 10, max(10, int(h * 0.45)))
    tw = draw.textlength(text, font=f)
    th = f.size
    draw.text((x + (w - tw) / 2, y + (h - th) / 2 - 1), text, font=f, fill=text_color)


def draw_promo_chip(draw, x, y, w, h, text, accent):
    r = max(3, min(h // 2, 12))
    rounded_rect(draw, (x, y, x + w, y + h), r, fill=None, outline=accent, width=max(1, h // 12))
    f = fit_font(draw, text, w - 8, max(9, int(h * 0.42)))
    tw = draw.textlength(text, font=f)
    draw.text((x + (w - tw) / 2, y + (h - f.size) / 2 - 1), text, font=f, fill=accent)


def paste_card_crop(canvas: Image.Image, offer: dict, box, darken=0.25):
    """Paste a cropped region from card creative into box (l,t,r,b)."""
    path = offer["card"]
    if not path.exists():
        return
    img = Image.open(path).convert("RGB")
    # focus on central card area of 4:5 creative
    w, h = img.size
    focus = img.crop((int(w * 0.08), int(h * 0.18), int(w * 0.92), int(h * 0.72)))
    tw, th = box[2] - box[0], box[3] - box[1]
    cropped = cover_crop(focus, tw, th)
    if darken:
        overlay = Image.new("RGB", cropped.size, (0, 0, 0))
        cropped = Image.blend(cropped, overlay, darken)
    canvas.paste(cropped, (box[0], box[1]))


def layout_leaderboard(w, h, offer):
    """Wide short banners: 728x90, 1000x120, 1706x184, 1280x256, 970x250, 320x50/100."""
    img = gradient(w, h, offer["bg"], offer["bg2"], vertical=False)
    draw = ImageDraw.Draw(img)
    accent = offer["accent"]
    pad = max(6, h // 8)

    # left accent bar
    draw.rectangle((0, 0, max(3, w // 80), h), fill=accent)

    # brand
    brand_f = fit_font(draw, BRAND, int(w * 0.22), max(10, int(h * 0.28)))
    draw.text((pad + 8, pad // 2), BRAND, font=brand_f, fill=(180, 200, 210))

    # title
    title = offer["title_short"] if w < 900 else offer["title"]
    if h <= 55 or w <= 400:
        title = {
            "travel": "Карта Travel",
            "subscriptions": "Карта USD",
            "premium": "Premium",
        }.get(
            next((k for k, v in OFFERS.items() if v is offer), ""),
            offer["title_tiny"],
        )
        # better RU shorts for tiny
        title = {
            id(OFFERS["travel"]): "Для поездок",
            id(OFFERS["subscriptions"]): "Для сервисов",
            id(OFFERS["premium"]): "Премиум",
        }.get(id(offer), title)
    title_f = fit_font(draw, title, int(w * 0.42), max(11, int(h * 0.38)))
    title_y = pad // 2 + (brand_f.size if h > 70 else 0) + (2 if h > 70 else 0)
    if h <= 70:
        title_y = (h - title_f.size) // 2
    draw.text((pad + 8, title_y), title, font=title_f, fill=(255, 255, 255))

    # subtitle if tall enough
    if h >= 100 and w >= 700:
        sub_f = fit_font(draw, offer["sub_short"], int(w * 0.38), max(10, int(h * 0.18)), bold=False)
        draw.text((pad + 8, title_y + title_f.size + 4), offer["sub_short"], font=sub_f, fill=(190, 210, 220))

    # CTA right
    cta_h = max(22, int(h * 0.48))
    cta_w = max(70, int(w * 0.16))
    cta_text = offer["cta_short"] if w < 800 or h < 80 else offer["cta"]
    cta_x = w - pad - cta_w
    cta_y = (h - cta_h) // 2
    draw_cta(draw, cta_x, cta_y, cta_w, cta_h, cta_text, accent)

    # promo left of CTA
    if w >= 400 and h >= 45:
        promo = offer["promo_full"] if w >= 900 else f"{offer['promo']} {offer['promo_text']}"
        if h <= 60:
            promo = offer["promo_text"]
        ph = max(18, int(h * 0.38))
        pw = max(70, int(w * 0.18))
        px = cta_x - pw - max(8, pad // 2)
        py = (h - ph) // 2
        draw_promo_chip(draw, px, py, pw, ph, promo, accent)

    return img


def layout_skyscraper(w, h, offer):
    """Tall banners: 160x600, 240x400/600, 300x500/600, 320x480."""
    img = gradient(w, h, offer["bg"], offer["bg2"], vertical=True)
    draw = ImageDraw.Draw(img)
    accent = offer["accent"]
    pad = max(8, w // 12)

    # top brand bar
    draw.rectangle((0, 0, w, max(28, h // 14)), fill=(0, 0, 0))
    bf = fit_font(draw, BRAND, w - 16, max(10, w // 12))
    draw.text(((w - draw.textlength(BRAND, font=bf)) / 2, 6), BRAND, font=bf, fill=accent)

    # card visual middle-top
    card_top = max(36, h // 12)
    card_h = int(h * 0.38) if h >= 480 else int(h * 0.32)
    card_box = (pad, card_top, w - pad, card_top + card_h)
    paste_card_crop(img, offer, card_box, darken=0.15)
    draw = ImageDraw.Draw(img)  # refresh after paste

    # title
    title = offer["title_short"] if w < 280 else offer["title"]
    if w <= 170:
        title = {
            id(OFFERS["travel"]): "Для путешествий",
            id(OFFERS["subscriptions"]): "Для сервисов",
            id(OFFERS["premium"]): "Премиум карта",
        }.get(id(offer), offer["title_tiny"])
    y = card_box[3] + pad
    # wrap title manually
    max_title_w = w - 2 * pad
    words = title.split()
    lines = []
    cur = ""
    tf_probe = font(max(12, w // 11))
    for word in words:
        test = (cur + " " + word).strip()
        if draw.textlength(test, font=tf_probe) <= max_title_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    if len(lines) > 3:
        lines = lines[:3]

    for line in lines:
        tf = fit_font(draw, line, max_title_w, max(11, w // 10))
        tw = draw.textlength(line, font=tf)
        draw.text(((w - tw) / 2, y), line, font=tf, fill=(255, 255, 255))
        y += tf.size + 4

    # sub
    if h - y > 120:
        sf = fit_font(draw, offer["sub_short"], max_title_w, max(10, w // 14), bold=False)
        # wrap sub
        for part in [offer["sub_short"]]:
            tw = draw.textlength(part, font=sf)
            if tw > max_title_w:
                sf = fit_font(draw, part, max_title_w, sf.size)
                tw = draw.textlength(part, font=sf)
            draw.text(((w - tw) / 2, y), part, font=sf, fill=(190, 205, 215))
            y += sf.size + 8

    # promo + CTA bottom
    cta_h = max(28, int(h * 0.07))
    cta_w = w - 2 * pad
    cta_y = h - pad - cta_h
    promo = offer["promo_full"] if w >= 220 else f"{offer['promo']}"
    ph = max(20, int(h * 0.05))
    if w < 200:
        # two chips: code + discount
        half = (cta_w - 6) // 2
        draw_promo_chip(draw, pad, cta_y - ph - 8, half, ph, offer["promo"][:10], accent)
        draw_promo_chip(draw, pad + half + 6, cta_y - ph - 8, half, ph, offer["promo_text"], accent)
    else:
        draw_promo_chip(draw, pad, cta_y - ph - 8, cta_w, ph, promo, accent)
    draw_cta(draw, pad, cta_y, cta_w, cta_h, offer["cta_short"] if w < 220 else offer["cta"], accent)
    return img


def layout_rect(w, h, offer):
    """Medium rectangles / squares / landscape: 300x250, 300x300, 336x280, 480x320, 1080x450."""
    img = gradient(w, h, offer["bg"], offer["bg2"], vertical=True)
    draw = ImageDraw.Draw(img)
    accent = offer["accent"]
    pad = max(10, min(w, h) // 18)

    # left/top visual
    if w >= h * 1.3:
        # landscape split
        vis_w = int(w * 0.42)
        paste_card_crop(img, offer, (0, 0, vis_w, h), darken=0.2)
        # dark scrim on right already from gradient - paint panel
        panel = Image.new("RGBA", (w - vis_w, h), (*offer["bg"], 235))
        img.paste(Image.alpha_composite(img.crop((vis_w, 0, w, h)).convert("RGBA"), panel).convert("RGB"), (vis_w, 0))
        draw = ImageDraw.Draw(img)
        x0 = vis_w + pad
        max_w = w - x0 - pad
        bf = fit_font(draw, BRAND, max_w, max(12, h // 16))
        draw.text((x0, pad), BRAND, font=bf, fill=accent)
        title = offer["title"] if w >= 700 else offer["title_short"]
        y = pad + bf.size + 8
        # wrap title
        words = title.split()
        lines, cur = [], ""
        probe = font(max(14, h // 10))
        for word in words:
            test = (cur + " " + word).strip()
            if draw.textlength(test, font=probe) <= max_w:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        for line in lines[:3]:
            tf = fit_font(draw, line, max_w, max(14, h // 9))
            draw.text((x0, y), line, font=tf, fill=(255, 255, 255))
            y += tf.size + 4
        if h > 160:
            sf = fit_font(draw, offer["sub"], max_w, max(11, h // 16), bold=False)
            draw.text((x0, y + 4), offer["sub"] if draw.textlength(offer["sub"], font=sf) <= max_w else offer["sub_short"], font=sf, fill=(200, 215, 225))
        cta_h = max(32, int(h * 0.16))
        cta_w = min(max_w, max(120, int(max_w * 0.7)))
        draw_promo_chip(draw, x0, h - pad - cta_h - 28, min(max_w, 220), 22, offer["promo_full"], accent)
        draw_cta(draw, x0, h - pad - cta_h, cta_w, cta_h, offer["cta"], accent)
    else:
        # portrait-ish / square
        bf = fit_font(draw, BRAND, w - 2 * pad, max(11, h // 18))
        draw.text(((w - draw.textlength(BRAND, font=bf)) / 2, pad), BRAND, font=bf, fill=accent)

        vis_h = int(h * 0.42)
        paste_card_crop(img, offer, (pad, pad + bf.size + 6, w - pad, pad + bf.size + 6 + vis_h), darken=0.12)
        draw = ImageDraw.Draw(img)

        y = pad + bf.size + 6 + vis_h + 8
        title = offer["title_short"]
        max_w = w - 2 * pad
        words = title.split()
        lines, cur = [], ""
        probe = font(max(13, w // 14))
        for word in words:
            test = (cur + " " + word).strip()
            if draw.textlength(test, font=probe) <= max_w:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        for line in lines[:3]:
            tf = fit_font(draw, line, max_w, max(12, w // 13))
            tw = draw.textlength(line, font=tf)
            draw.text(((w - tw) / 2, y), line, font=tf, fill=(255, 255, 255))
            y += tf.size + 3

        if y + 70 < h:
            sf = fit_font(draw, offer["sub_short"], max_w, max(10, w // 18), bold=False)
            tw = draw.textlength(offer["sub_short"], font=sf)
            draw.text(((w - tw) / 2, y), offer["sub_short"], font=sf, fill=(190, 205, 215))

        cta_h = max(28, int(h * 0.1))
        draw_promo_chip(draw, pad, h - pad - cta_h - 26, w - 2 * pad, 20, offer["promo_full"], accent)
        draw_cta(draw, pad, h - pad - cta_h, w - 2 * pad, cta_h, offer["cta_short"] if w < 280 else offer["cta"], accent)

    return img


def layout_large_portrait(w, h, offer):
    """940x1524 — almost stories/poster."""
    # use full card creative as background cover + overlays
    if offer["card"].exists():
        bg = cover_crop(Image.open(offer["card"]).convert("RGB"), w, h)
        # darken bottom for text
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        for i in range(h // 2, h):
            a = int(220 * ((i - h / 2) / (h / 2)))
            od.line([(0, i), (w, i)], fill=(8, 12, 16, a))
        img = Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGB")
    else:
        img = gradient(w, h, offer["bg"], offer["bg2"])

    draw = ImageDraw.Draw(img)
    accent = offer["accent"]
    pad = 48

    bf = fit_font(draw, BRAND, w - 2 * pad, 36)
    draw.text((pad, 40), BRAND, font=bf, fill=accent)

    # title block near bottom
    title = offer["title"]
    y = int(h * 0.62)
    max_w = w - 2 * pad
    words = title.split()
    lines, cur = [], ""
    probe = font(54)
    for word in words:
        test = (cur + " " + word).strip()
        if draw.textlength(test, font=probe) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    for line in lines:
        tf = fit_font(draw, line, max_w, 54)
        draw.text((pad, y), line, font=tf, fill=(255, 255, 255))
        y += tf.size + 8

    sf = fit_font(draw, offer["sub"], max_w, 28, bold=False)
    draw.text((pad, y + 6), offer["sub"], font=sf, fill=(210, 220, 230))

    cta_h = 64
    draw_promo_chip(draw, pad, h - pad - cta_h - 50, min(420, max_w), 36, offer["promo_full"], accent)
    draw_cta(draw, pad, h - pad - cta_h, min(420, max_w), cta_h, offer["cta"], accent)
    return img


def choose_layout(w, h, offer):
    ratio = w / h
    if w == 940 and h == 1524:
        return layout_large_portrait(w, h, offer)
    if h <= 120 or (ratio >= 4 and h <= 200):
        return layout_leaderboard(w, h, offer)
    if ratio >= 3.5:  # 1280x256, 1706x184, 970x250-ish
        return layout_leaderboard(w, h, offer)
    if ratio <= 0.7:  # skyscraper / tall
        return layout_skyscraper(w, h, offer)
    if h == 450 and w == 1080:
        return layout_rect(w, h, offer)
    return layout_rect(w, h, offer)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    manifest = []
    for key, offer in OFFERS.items():
        odir = OUT / key
        odir_ws = OUT_WS / key
        odir.mkdir(parents=True, exist_ok=True)
        odir_ws.mkdir(parents=True, exist_ok=True)
        for w, h in SIZES:
            img = choose_layout(w, h, offer)
            # ensure exact size
            if img.size != (w, h):
                img = img.resize((w, h), Image.Resampling.LANCZOS)
            name = f"ppm-{key}-{w}x{h}.png"
            path = odir / name
            img.save(path, "PNG", optimize=True)
            img.save(odir_ws / name, "PNG", optimize=True)
            manifest.append(f"{key}\t{w}x{h}\t{path}")
            print(f"OK {name}")

    (OUT / "manifest.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    (OUT_WS / "manifest.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    readme = f"""РСЯ графические объявления — Плати по миру
Размеры: {len(SIZES)} шт × 3 оффера = {len(SIZES) * 3} баннеров

Папки:
- travel/          промо LG2026 (−500 ₽)
- subscriptions/  промо LG2026 (−500 ₽)
- premium/        промо LGPREMIUM2026 (−1000 ₽)

Формат: PNG, точные пиксели под ТЗ Яндекса.
"""
    (OUT / "README.txt").write_text(readme, encoding="utf-8")
    (OUT_WS / "README.txt").write_text(readme, encoding="utf-8")
    print(f"Done: {len(manifest)} banners → {OUT}")


if __name__ == "__main__":
    main()
