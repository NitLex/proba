#!/usr/bin/env python3
"""RSYa banners + short videos for Плати по миру — angles premium/travel/services, promo LG2026."""

from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_ART = Path("/opt/cursor/artifacts/banners/rsya-lg2026")
OUT_WS = ROOT / "banners-lg2026"
ASSETS_REPO = ROOT / "assets"
ASSETS_OPT = Path("/opt/cursor/artifacts/assets")
ASSETS = ASSETS_REPO if (ASSETS_REPO / "ppm-hero-travel-16x9.png").exists() else ASSETS_OPT
VIDEO_DIR = Path("/opt/cursor/artifacts/videos/rsya-lg2026")

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Full RSYa set + Direct text-ad square
SIZES = [
    (1000, 120),
    (1080, 450),
    (1080, 1080),
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

# Brief-critical sizes highlighted in pipeline
BRIEF_SIZES = {
    (300, 250),
    (300, 300),
    (336, 280),
    (728, 90),
    (300, 600),
    (320, 100),
    (1080, 450),
    (1080, 1080),
}

ANGLES = {
    "travel": {
        "brand": "Плати по миру",
        "head": "Виртуальная карта для путешествий",
        "head_short": "Карта для путешествий",
        "head_tiny": "Карта для поездок",
        "sub": "Оплата за границей. Пополнение по СБП.",
        "sub_short": "Оплата за границей",
        "benefits": [
            "оформление онлайн за пару минут",
            "пополнение рублями через СБП",
            "Apple Pay и Google Pay",
            "карта в валюте",
        ],
        "benefits_short": ["онлайн за минуты", "пополнение по СБП", "оплата за границей", "карта в валюте"],
        "promo": "LG2026",
        "promo_line": "−500 ₽ на открытие карты",
        "cta": "Оформить карту",
        "cta_short": "Оформить",
        "navy": (8, 22, 48),
        "accent": (32, 196, 180),
        "accent2": (72, 160, 255),
        "promo_color": (212, 175, 90),
        "muted": (190, 210, 225),
        "hero_wide": ASSETS / "ppm-hero-travel-16x9.png",
        "hero_sq": ASSETS / "ppm-hero-travel-1x1.png",
        "zip_name": "ppm-rsya-travel-premium-v2.zip",
        "file_prefix": "ppm-travel-premium",
        "video_prefix": "ppm-rsya-travel",
    },
    "services": {
        "brand": "Плати по миру",
        "head": "Оплата зарубежных сервисов",
        "head_short": "Карта для подписок",
        "head_tiny": "Карта для сервисов",
        "sub": "Виртуальная карта для подписок и цифровых сервисов",
        "sub_short": "Для подписок и сервисов",
        "benefits": [
            "оформление онлайн за несколько минут",
            "пополнение рублями через СБП",
            "подходит для зарубежных сервисов",
            "современная виртуальная карта",
        ],
        "benefits_short": ["онлайн за минуты", "пополнение по СБП", "зарубежные сервисы", "виртуальная карта"],
        "promo": "LG2026",
        "promo_line": "−500 ₽ на открытие карты",
        "cta": "Оформить онлайн",
        "cta_short": "Оформить",
        "navy": (10, 16, 28),
        "accent": (32, 210, 190),
        "accent2": (72, 160, 255),
        "promo_color": (255, 140, 60),
        "muted": (175, 195, 220),
        "hero_wide": ASSETS / "ppm-hero-services-16x9.png",
        "hero_sq": ASSETS / "ppm-hero-services-1x1.png",
        "zip_name": "ppm-rsya-services-premium-v3.zip",
        "file_prefix": "ppm-services-premium",
        "video_prefix": "ppm-rsya-subscriptions",
    },
    "premium": {
        "brand": "Плати по миру",
        "head": "Премиальная карта с выгодным курсом",
        "head_short": "Премиальная карта",
        "head_tiny": "Выгодный курс",
        "sub": "Больше выгоды на оплатах. Карта в валюте.",
        "sub_short": "Больше выгоды на оплатах",
        "benefits": [
            "оформление онлайн",
            "пополнение рублями через СБП",
            "выгодный курс на оплатах",
            "больше лимитов",
        ],
        "benefits_short": ["онлайн за минуты", "пополнение по СБП", "выгодный курс", "больше лимитов"],
        "promo": "LG2026",
        "promo_line": "−500 ₽ на премиум-выпуск",
        "cta": "Оформить карту",
        "cta_short": "Оформить",
        "navy": (8, 20, 18),
        "accent": (212, 175, 90),
        "accent2": (45, 180, 140),
        "promo_color": (212, 175, 90),
        "muted": (200, 215, 200),
        "hero_wide": ASSETS / "ppm-hero-premium-16x9.png",
        "hero_sq": ASSETS / "ppm-hero-premium-1x1.png",
        "zip_name": "ppm-rsya-premium-lg2026.zip",
        "file_prefix": "ppm-premium-lg2026",
        "video_prefix": "ppm-rsya-premium",
    },
}

WHITE = (255, 255, 255)


def fnt(size: int, bold: bool = True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, max(8, int(size)))


def fit(draw, text, max_w, start, bold=True, min_size=8):
    s = start
    while s > min_size:
        font = fnt(s, bold)
        if draw.textlength(text, font=font) <= max_w:
            return font
        s -= 1
    return fnt(min_size, bold)


def wrap(draw, text, font, max_w, max_lines=4):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
            if len(lines) >= max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines


def draw_fits(d, text, font, max_w):
    return d.textlength(text, font=font) <= max_w


def cover(src: Image.Image, tw: int, th: int, focus="center") -> Image.Image:
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = src.resize((nw, nh), Image.Resampling.LANCZOS)
    if focus == "left":
        left, top = 0, (nh - th) // 2
    elif focus == "right":
        left, top = nw - tw, (nh - th) // 2
    elif focus == "top":
        left, top = (nw - tw) // 2, 0
    else:
        left, top = (nw - tw) // 2, (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def scrim(base: Image.Image, mode: str) -> Image.Image:
    w, h = base.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if mode == "left":
        for x in range(0, int(w * 0.58)):
            t = 1 - x / (w * 0.58)
            od.line([(x, 0), (x, h)], fill=(8, 12, 22, int(40 + 210 * t)))
    elif mode == "bottom":
        for y in range(int(h * 0.30), h):
            t = (y - h * 0.30) / (h * 0.70)
            od.line([(0, y), (w, y)], fill=(8, 12, 22, int(35 + 215 * t)))
    elif mode == "bar":
        od.rectangle((0, 0, w, h), fill=(8, 12, 22, 175))
    elif mode == "center":
        for y in range(h):
            t = abs(y - h / 2) / (h / 2)
            a = int(40 + 160 * (1 - t * 0.35))
            od.line([(0, y), (w, y)], fill=(8, 12, 22, a))
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def round_btn(draw, box, fill, text, text_fill=(8, 18, 30)):
    x1, y1, x2, y2 = box
    h = y2 - y1
    r = max(4, min(h // 2, 22))
    draw.rounded_rectangle(box, radius=r, fill=fill)
    font = fit(draw, text, (x2 - x1) - 12, max(10, int(h * 0.42)))
    tw = draw.textlength(text, font=font)
    draw.text(((x1 + x2 - tw) / 2, (y1 + y2 - font.size) / 2 - 1), text, font=font, fill=text_fill)


def promo_big(draw, x, y, max_w, cfg, scale=1.0) -> int:
    code_f = fit(draw, cfg["promo"], max_w, int(36 * scale))
    line_f = fit(draw, cfg["promo_line"], max_w, int(15 * scale), bold=False)
    tw = draw.textlength(cfg["promo"], font=code_f)
    pad_x, pad_y = int(14 * scale), int(8 * scale)
    box = (x, y, x + tw + pad_x * 2, y + code_f.size + pad_y * 2)
    draw.rounded_rectangle(
        box,
        radius=max(6, int(10 * scale)),
        fill=(35, 24, 16),
        outline=cfg["promo_color"],
        width=max(2, int(3 * scale)),
    )
    draw.text((x + pad_x, y + pad_y), cfg["promo"], font=code_f, fill=cfg["promo_color"])
    y2 = box[3] + int(6 * scale)
    draw.text((x, y2), cfg["promo_line"], font=line_f, fill=cfg["accent"])
    return (y2 + line_f.size) - y


def hero_img(w, h, cfg):
    r = w / h
    if abs(r - 1) < 0.15 and cfg["hero_sq"].exists():
        path, focus = cfg["hero_sq"], "center"
    elif r <= 0.75:
        # tall: crop from square preferring top
        path, focus = (cfg["hero_sq"] if cfg["hero_sq"].exists() else cfg["hero_wide"]), "top"
    elif r >= 1.5:
        path, focus = cfg["hero_wide"], "right"
    else:
        path, focus = (cfg["hero_sq"] if cfg["hero_sq"].exists() else cfg["hero_wide"]), "center"
    img = ImageEnhance.Contrast(Image.open(path).convert("RGB")).enhance(1.05)
    return cover(img, w, h, focus)


def make_banner(w, h, cfg):
    if h <= 55 or (h <= 100 and w / h >= 3):
        return layout_micro(w, h, cfg)
    r = w / h
    if r >= 3.0 or h <= 130:
        return layout_leaderboard(w, h, cfg)
    if r <= 0.7:
        return layout_skyscraper(w, h, cfg)
    if w == 940 and h == 1524:
        return layout_poster(w, h, cfg)
    if w == h == 1080:
        return layout_square(w, h, cfg)
    if r >= 1.5:
        return layout_landscape(w, h, cfg)
    return layout_rect(w, h, cfg)


def layout_micro(w, h, cfg):
    img = Image.new("RGB", (w, h), cfg["navy"])
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, max(3, w // 70), h), fill=cfg["accent"])
    pad = max(4, h // 6)
    bf = fit(d, cfg["brand"], int(w * 0.2), max(9, int(h * 0.28)))
    title = cfg["head_tiny"] if h <= 55 else cfg["head_short"]
    tf = fit(d, title, int(w * 0.38), max(10, int(h * 0.4)))
    if h <= 55:
        d.text((pad + 6, (h - bf.size) // 2), cfg["brand"], font=bf, fill=cfg["accent2"])
        d.text((pad + 6 + d.textlength(cfg["brand"], font=bf) + 8, (h - tf.size) // 2), title, font=tf, fill=WHITE)
    else:
        d.text((pad + 6, 2), cfg["brand"], font=bf, fill=cfg["accent2"])
        d.text((pad + 6, bf.size + 4), title, font=tf, fill=WHITE)
    cta_h = max(18, int(h * 0.55))
    cta_w = max(72, int(w * 0.17))
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), cfg["accent"], cfg["cta_short"] if w < 520 else cfg["cta"])
    if w >= 380:
        pf = fit(d, cfg["promo"], int(w * 0.12), max(10, int(h * 0.34)))
        pw = d.textlength(cfg["promo"], font=pf) + 12
        px = w - pad - cta_w - 8 - pw
        d.rounded_rectangle((px, (h - pf.size - 10) // 2, px + pw, (h + pf.size + 10) // 2), radius=6, outline=cfg["promo_color"], width=2)
        d.text((px + 6, (h - pf.size) // 2), cfg["promo"], font=pf, fill=cfg["promo_color"])
    return img


def layout_leaderboard(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "left")
    d = ImageDraw.Draw(base)
    pad = max(10, h // 7)
    x0 = pad
    max_w = int(w * 0.48)
    bf = fit(d, cfg["brand"], max_w, max(11, int(h * 0.2)))
    d.text((x0, max(4, pad // 3)), cfg["brand"], font=bf, fill=cfg["accent2"])
    title = cfg["head"] if w >= 1000 and h >= 150 else cfg["head_short"]
    tf = fit(d, title, max_w, max(14, int(h * 0.26)))
    y = pad // 2 + bf.size + 4
    for line in wrap(d, title, tf, max_w, 2):
        d.text((x0, y), line, font=tf, fill=WHITE)
        y += tf.size + 2
    if h >= 120:
        y += 4
        promo_big(d, x0, y, min(220, max_w), cfg, scale=max(0.6, h / 240))
    cta_h = max(28, int(h * 0.4))
    cta_w = max(120, int(w * 0.15))
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), cfg["accent"], cfg["cta"] if w >= 850 else cfg["cta_short"])
    return base


def layout_landscape(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "left")
    d = ImageDraw.Draw(base)
    pad = max(16, h // 16)
    x0 = pad
    max_w = int(w * 0.50)
    bf = fit(d, cfg["brand"], max_w, max(14, h // 18))
    d.text((x0, pad), cfg["brand"], font=bf, fill=cfg["accent2"])
    y = pad + bf.size + 10
    tf = fit(d, cfg["head"], max_w, max(20, h // 9))
    for line in wrap(d, cfg["head"], tf, max_w, 3):
        d.text((x0, y), line, font=tf, fill=WHITE)
        y += tf.size + 4
    sf = fit(d, cfg["sub"], max_w, max(12, h // 20), bold=False)
    sub = cfg["sub"] if draw_fits(d, cfg["sub"], sf, max_w) else cfg["sub_short"]
    d.text((x0, y + 4), sub, font=sf, fill=cfg["muted"])
    y += sf.size + 12
    y += promo_big(d, x0, y, min(320, max_w), cfg, scale=0.9)
    if h >= 300:
        for b in cfg["benefits_short"]:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(11, h // 24), bold=False)
            d.text((x0, y), line, font=bfnt, fill=cfg["muted"])
            y += bfnt.size + 3
    cta_h = max(36, int(h * 0.12))
    cta_w = min(max_w, 250)
    round_btn(d, (x0, h - pad - cta_h, x0 + cta_w, h - pad), cfg["accent"], cfg["cta"])
    return base


def layout_rect(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "bottom")
    d = ImageDraw.Draw(base)
    pad = max(10, min(w, h) // 18)
    max_w = w - 2 * pad
    bf = fit(d, cfg["brand"], max_w, max(11, h // 22))
    d.text(((w - d.textlength(cfg["brand"], font=bf)) / 2, pad), cfg["brand"], font=bf, fill=cfg["accent2"])
    y = int(h * 0.40)
    title = cfg["head_short"] if w < 360 else cfg["head"]
    tf = fit(d, title, max_w, max(14, w // 14))
    for line in wrap(d, title, tf, max_w, 3):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3
    sf = fit(d, cfg["sub_short"] if w < 340 else cfg["sub"], max_w, max(10, w // 24), bold=False)
    sub = cfg["sub_short"] if w < 340 else cfg["sub"]
    if not draw_fits(d, sub, sf, max_w):
        sub = cfg["sub_short"]
    tw = d.textlength(sub, font=sf)
    d.text(((w - tw) / 2, y + 2), sub, font=sf, fill=cfg["muted"])
    y += sf.size + 10
    y += promo_big(d, (w - min(260, max_w)) // 2, y, min(260, max_w), cfg, scale=0.85)
    cta_h = max(28, int(h * 0.09))
    cta_w = min(w - 2 * pad, max(150, int(w * 0.72)))
    round_btn(d, ((w - cta_w) // 2, h - pad - cta_h, (w + cta_w) // 2, h - pad), cfg["accent"], cfg["cta_short"] if w < 280 else cfg["cta"])
    return base


def layout_square(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "bottom")
    d = ImageDraw.Draw(base)
    pad = 48
    max_w = w - 2 * pad
    bf = fit(d, cfg["brand"], max_w, 34)
    d.text(((w - d.textlength(cfg["brand"], font=bf)) / 2, pad), cfg["brand"], font=bf, fill=cfg["accent2"])
    y = int(h * 0.42)
    tf = fit(d, cfg["head"], max_w, 44)
    for line in wrap(d, cfg["head"], tf, max_w, 3):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 8
    sf = fit(d, cfg["sub"], max_w, 22, bold=False)
    tw = d.textlength(cfg["sub"], font=sf)
    d.text(((w - tw) / 2, y + 4), cfg["sub"], font=sf, fill=cfg["muted"])
    y += sf.size + 20
    pw = min(360, max_w)
    promo_big(d, (w - pw) // 2, y, pw, cfg, scale=1.15)
    cta_h = 64
    cta_w = min(420, max_w)
    round_btn(d, ((w - cta_w) // 2, h - pad - cta_h, (w + cta_w) // 2, h - pad), cfg["accent"], cfg["cta"])
    return base


def layout_skyscraper(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "bottom")
    d = ImageDraw.Draw(base)
    pad = max(8, w // 12)
    max_w = w - 2 * pad
    bf = fit(d, cfg["brand"], max_w, max(10, w // 11))
    d.text(((w - d.textlength(cfg["brand"], font=bf)) / 2, pad), cfg["brand"], font=bf, fill=cfg["accent2"])
    y = int(h * 0.38)
    title = cfg["head_short"] if w <= 200 else cfg["head"]
    tf = fit(d, title, max_w, max(13, w // 10))
    for line in wrap(d, title, tf, max_w, 4):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3
    sf = fit(d, cfg["sub_short"], max_w, max(10, w // 14), bold=False)
    tw = d.textlength(cfg["sub_short"], font=sf)
    d.text(((w - tw) / 2, y + 4), cfg["sub_short"], font=sf, fill=cfg["muted"])
    y += sf.size + 12
    if h >= 500 and w >= 180:
        for b in cfg["benefits_short"]:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(10, w // 16), bold=False)
            d.text((pad, y), line, font=bfnt, fill=cfg["muted"])
            y += bfnt.size + 4
    cta_h = max(28, int(h * 0.055))
    promo_y = h - pad - cta_h - (58 if w >= 180 else 44)
    promo_big(d, pad, promo_y, max_w, cfg, scale=max(0.75, w / 220))
    round_btn(d, (pad, h - pad - cta_h, w - pad, h - pad), cfg["accent"], cfg["cta_short"] if w < 220 else cfg["cta"])
    return base


def layout_poster(w, h, cfg):
    base = scrim(hero_img(w, h, cfg), "bottom")
    d = ImageDraw.Draw(base)
    pad = 48
    max_w = w - 2 * pad
    cta_h = 64
    bottom_reserved = pad + cta_h + 16 + 100
    bf = fit(d, cfg["brand"], max_w, 34)
    d.text((pad, 36), cfg["brand"], font=bf, fill=cfg["accent2"])
    y = int(h * 0.46)
    tf = fit(d, cfg["head"], max_w, 46)
    for line in wrap(d, cfg["head"], tf, max_w, 3):
        d.text((pad, y), line, font=tf, fill=WHITE)
        y += tf.size + 8
    y += promo_big(d, pad, y + 8, 400, cfg, scale=1.2)
    sf = fit(d, cfg["sub"], max_w, 24, bold=False)
    d.text((pad, y + 10), cfg["sub"], font=sf, fill=cfg["muted"])
    y += sf.size + 24
    for b in cfg["benefits"]:
        line = "•  " + b
        bfnt = fit(d, line, max_w, 20, bold=False)
        if y + bfnt.size > h - bottom_reserved:
            break
        d.text((pad, y), line, font=bfnt, fill=cfg["muted"])
        y += bfnt.size + 10
    round_btn(d, (pad, h - pad - cta_h, pad + 380, h - pad), cfg["accent"], cfg["cta"])
    return base


def video_frame(w, h, cfg, phase: str) -> Image.Image:
    """phase: brand | offer | cta"""
    base = scrim(hero_img(w, h, cfg), "bottom" if w == h else "left")
    d = ImageDraw.Draw(base)
    pad = max(28, min(w, h) // 18)
    max_w = int(w * (0.55 if w > h else 0.88))
    x0 = pad if w > h else (w - max_w) // 2

    bf = fit(d, cfg["brand"], max_w, max(22, h // 22))
    bx = x0 if w > h else (w - d.textlength(cfg["brand"], font=bf)) / 2
    d.text((bx, pad), cfg["brand"], font=bf, fill=cfg["accent2"])

    y = pad + bf.size + int(h * 0.04)
    if phase == "brand":
        title = cfg["head_short"]
    elif phase == "offer":
        title = cfg["head"]
    else:
        title = cfg["head_short"]

    tf = fit(d, title, max_w, max(28, h // 12))
    for line in wrap(d, title, tf, max_w, 3):
        tw = d.textlength(line, font=tf)
        tx = x0 if w > h else (w - tw) / 2
        d.text((tx, y), line, font=tf, fill=WHITE)
        y += tf.size + 6

    if phase in ("offer", "cta"):
        y += 10
        pw = min(380, max_w)
        px = x0 if w > h else (w - pw) // 2
        y += promo_big(d, px, y, pw, cfg, scale=1.1 if w == h else 0.95)
        sf = fit(d, cfg["sub_short"], max_w, max(16, h // 28), bold=False)
        tw = d.textlength(cfg["sub_short"], font=sf)
        tx = x0 if w > h else (w - tw) / 2
        d.text((tx, y + 8), cfg["sub_short"], font=sf, fill=cfg["muted"])

    if phase == "cta":
        cta_h = max(48, int(h * 0.08))
        cta_w = min(max_w, 360)
        cx = x0 if w > h else (w - cta_w) // 2
        round_btn(d, (cx, h - pad - cta_h, cx + cta_w, h - pad), cfg["accent"], cfg["cta"])
    return base


def encode_video(frames: list[Path], out_mp4: Path, duration: float, w: int, h: int, fps: int = 30):
    if not frames:
        raise RuntimeError("no frames")
    n = len(frames)
    per = duration / n
    tmp = frames[0].parent / "clips"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    clips = []
    for i, f in enumerate(frames):
        clip = tmp / f"c{i:02d}.mp4"
        frames_n = max(2, int(per * fps))
        vf = (
            f"scale={w * 2}:{h * 2},"
            f"zoompan=z='min(1.08,1+0.08*on/{frames_n})':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames_n}:s={w}x{h}:fps={fps},format=yuv420p"
        )
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-i",
                str(f),
                "-vf",
                vf,
                "-frames:v",
                str(frames_n),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "20",
                str(clip),
            ],
            check=True,
            capture_output=True,
        )
        clips.append(clip)
    lst = tmp / "list.txt"
    lst.write_text("\n".join(f"file '{c.resolve()}'" for c in clips), encoding="utf-8")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lst),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(out_mp4),
        ],
        check=True,
        capture_output=True,
    )
    return out_mp4


def make_videos(angle: str, cfg: dict):
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    specs = [
        ("1x1", 1080, 1080, 7.0),
        ("16x9", 1920, 1080, 8.0),
    ]
    outs = []
    for label, w, h, dur in specs:
        fdir = VIDEO_DIR / f"{angle}-{label}-frames"
        if fdir.exists():
            shutil.rmtree(fdir)
        fdir.mkdir(parents=True)
        frames = []
        for i, phase in enumerate(("brand", "offer", "cta", "cta")):
            img = video_frame(w, h, cfg, phase)
            path = fdir / f"frame_{i:02d}.png"
            img.save(path, "PNG")
            frames.append(path)
        out_name = f"{cfg['video_prefix']}-{int(dur)}s-{label}.mp4"
        out_art = VIDEO_DIR / out_name
        out_ws = ROOT / out_name
        encode_video(frames, out_art, dur, w, h)
        shutil.copy2(out_art, out_ws)
        outs.append(out_ws)
        print("VIDEO", out_ws)
    return outs


def zip_angle(angle: str, cfg: dict, angle_dir: Path):
    zip_path = ROOT / cfg["zip_name"]
    readme = (
        f"Плати по миру — {angle} RSYa pack (LG2026)\n\n"
        f"Заголовок: {cfg['head']}\n"
        f"Подзаголовок: {cfg['sub']}\n"
        f"Промокод: {cfg['promo']} — {cfg['promo_line']}\n"
        f"CTA: {cfg['cta']}\n"
        "Запрещено: обход санкций/ограничений, гарантии одобрения, P2P/вывод, gambling/adult/crypto.\n"
        "Формат: PNG, точные пиксели.\n"
    )
    (angle_dir / "README.txt").write_text(readme, encoding="utf-8")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(angle_dir.iterdir()):
            zf.write(p, p.name)
    print("ZIP", zip_path)
    return zip_path


def rebuild_all_zip(angle_dirs: dict[str, Path]):
    """Rebuild ppm-rsya-banners-all.zip with travel/subscriptions/premium folders."""
    staging = OUT_WS / "_all"
    if staging.exists():
        shutil.rmtree(staging)
    mapping = {
        "travel": "travel",
        "services": "subscriptions",
        "premium": "premium",
    }
    for angle, folder in mapping.items():
        src = angle_dirs[angle]
        dst = staging / folder
        dst.mkdir(parents=True)
        for p in src.glob("*.png"):
            # normalize names inside all-zip
            name = p.name
            if angle == "travel":
                name = name.replace("ppm-travel-premium-", "ppm-travel-")
            elif angle == "services":
                name = name.replace("ppm-services-premium-", "ppm-subscriptions-")
            elif angle == "premium":
                name = name.replace("ppm-premium-lg2026-", "ppm-premium-")
            # skip 1080x1080 inside classic 19-size all zip? keep brief sizes too
            shutil.copy2(p, dst / name)
    readme = """РСЯ графические объявления — Плати по миру
Размеры: полный набор × 3 угла

Папки:
- travel/          промо LG2026 (−500 ₽)
- subscriptions/  промо LG2026 (−500 ₽)
- premium/        промо LG2026 (−500 ₽)

Формат: PNG, точные пиксели под ТЗ Яндекса.
Запрещено: обход санкций/ограничений, гарантии, P2P/вывод, adult, gambling, крипта.
"""
    (staging / "README.txt").write_text(readme, encoding="utf-8")
    lines = []
    for folder in ("travel", "subscriptions", "premium"):
        for p in sorted((staging / folder).glob("*.png")):
            lines.append(f"{folder}/{p.name}")
    (staging / "manifest.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    zip_path = ROOT / "ppm-rsya-banners-all.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in staging.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(staging).as_posix())
    print("ZIP", zip_path)


def export_direct_textad(angle_dirs: dict[str, Path]):
    textad = ROOT / "direct-textad"
    textad.mkdir(parents=True, exist_ok=True)
    mapping = {
        "travel": "ppm-travel-1080.jpg",
        "services": "ppm-services-1080.jpg",
        "premium": "ppm-premium-1080.jpg",
    }
    for angle, name in mapping.items():
        src = angle_dirs[angle] / f"{ANGLES[angle]['file_prefix']}-1080x1080.png"
        im = Image.open(src).convert("RGB")
        assert im.size == (1080, 1080)
        im.save(textad / name, "JPEG", quality=92, optimize=True)
        print("TEXTAD", textad / name)


def main():
    OUT_ART.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    angle_dirs = {}
    for angle, cfg in ANGLES.items():
        for key in ("hero_wide", "hero_sq"):
            if not cfg[key].exists():
                raise FileNotFoundError(cfg[key])
        adir = OUT_WS / angle
        aart = OUT_ART / angle
        adir.mkdir(parents=True, exist_ok=True)
        aart.mkdir(parents=True, exist_ok=True)
        angle_dirs[angle] = adir
        for w, h in SIZES:
            img = make_banner(w, h, cfg)
            assert img.size == (w, h), (img.size, w, h)
            name = f"{cfg['file_prefix']}-{w}x{h}.png"
            img.save(adir / name, "PNG", optimize=True)
            img.save(aart / name, "PNG", optimize=True)
            mark = "*" if (w, h) in BRIEF_SIZES else " "
            print(f"OK{mark}", angle, name)
        zip_angle(angle, cfg, adir)
        make_videos(angle, cfg)

    rebuild_all_zip(angle_dirs)
    export_direct_textad(angle_dirs)

    # Artifact index for pipeline
    index = OUT_ART / "CREATIVE_INDEX.md"
    index.write_text(
        """# RSYa creatives LG2026

Angles: premium / travel / services
Promo: LG2026 (−500 ₽)
Brand: Плати по миру

## Packs
- creatives/rsya/ppm-rsya-banners-all.zip
- creatives/rsya/ppm-rsya-travel-premium-v2.zip
- creatives/rsya/ppm-rsya-services-premium-v3.zip
- creatives/rsya/ppm-rsya-premium-lg2026.zip

## Videos (7s 1x1 / 8s 16x9)
- ppm-rsya-travel-7s-1x1.mp4 / ppm-rsya-travel-8s-16x9.mp4
- ppm-rsya-subscriptions-7s-1x1.mp4 / ppm-rsya-subscriptions-8s-16x9.mp4
- ppm-rsya-premium-7s-1x1.mp4 / ppm-rsya-premium-8s-16x9.mp4

## Direct text-ad (1080×1080 JPG)
- creatives/rsya/direct-textad/ppm-travel-1080.jpg
- creatives/rsya/direct-textad/ppm-services-1080.jpg
- creatives/rsya/direct-textad/ppm-premium-1080.jpg

Forbidden: обход санкций/ограничений, гарантии одобрения, P2P/вывод, gambling/adult/crypto.
""",
        encoding="utf-8",
    )
    print("Done")


if __name__ == "__main__":
    main()
