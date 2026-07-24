#!/usr/bin/env python3
"""Premium RSYa banners for Плати по миру — prompt v2 travel pack."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

OUT = Path("/opt/cursor/artifacts/banners/rsya-v2")
OUT_WS = Path("/workspace/creatives/rsya/banners-v2")
ASSETS = Path("/opt/cursor/artifacts/assets")

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

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

BRAND = "Плати по миру"
HEAD = "Путешествуйте без лишних сложностей"
HEAD_SHORT = "Путешествуйте без сложностей"
HEAD_TINY = "Карта для поездок"
SUB = "Виртуальная карта для оплаты за границей"
SUB_SHORT = "Оплата за границей"
BENEFITS = [
    "оформление онлайн за несколько минут",
    "пополнение рублями через СБП",
    "оплата в магазинах и на зарубежных сайтах",
    "поддержка бесконтактной оплаты",
]
BENEFITS_SHORT = [
    "онлайн за минуты",
    "пополнение по СБП",
    "оплата за границей",
    "бесконтактная оплата",
]
PROMO = "LG2026"
PROMO_LINE = "500 ₽ на открытие карты"
CTA = "Оформить карту"
CTA_SHORT = "Оформить"
FOOTER = "Подробные условия — на сайте platipomiru.com"
FOOTER_SHORT = "platipomiru.com"

NAVY = (8, 22, 48)
TEAL = (32, 196, 180)
GOLD = (212, 175, 90)
WHITE = (255, 255, 255)
MUTED = (190, 210, 225)

HERO_WIDE = ASSETS / "ppm-v2-hero-16x9.png"
HERO_TALL = ASSETS / "ppm-v2-hero-9x16.png"
HERO_SQ = ASSETS / "ppm-v2-hero-1x1.png"
HERO_PORT = ASSETS / "ppm-v2-hero-3x4.png"


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
    elif focus == "bottom":
        left, top = (nw - tw) // 2, nh - th
    else:
        left, top = (nw - tw) // 2, (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def pick_hero(w, h) -> tuple[Path, str]:
    r = w / h
    if r >= 2.2:
        return HERO_WIDE, "left"
    if r <= 0.75:
        return HERO_TALL if h / w > 1.6 else HERO_PORT, "top"
    if abs(r - 1) < 0.15:
        return HERO_SQ, "center"
    if r > 1:
        return HERO_WIDE, "left"
    return HERO_PORT, "top"


def scrim(base: Image.Image, mode: str) -> Image.Image:
    """Darken area reserved for text."""
    w, h = base.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if mode == "right":
        for x in range(int(w * 0.38), w):
            t = (x - w * 0.38) / (w * 0.62)
            a = int(40 + 200 * t)
            od.line([(x, 0), (x, h)], fill=(6, 14, 32, a))
    elif mode == "left":
        for x in range(0, int(w * 0.62)):
            t = 1 - x / (w * 0.62)
            a = int(30 + 200 * t)
            od.line([(x, 0), (x, h)], fill=(6, 14, 32, a))
    elif mode == "bottom":
        for y in range(int(h * 0.35), h):
            t = (y - h * 0.35) / (h * 0.65)
            a = int(30 + 210 * t)
            od.line([(0, y), (w, y)], fill=(6, 14, 32, a))
    elif mode == "full":
        od.rectangle((0, 0, w, h), fill=(6, 14, 32, 150))
    elif mode == "bar":
        od.rectangle((0, 0, w, h), fill=(6, 14, 32, 170))
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def round_btn(draw, box, fill, text, text_fill=(8, 18, 30), outline=None):
    x1, y1, x2, y2 = box
    h = y2 - y1
    r = max(4, min(h // 2, 22))
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=2 if outline else 0)
    font = fit(draw, text, (x2 - x1) - 12, max(10, int(h * 0.42)))
    tw = draw.textlength(text, font=font)
    draw.text(((x1 + x2 - tw) / 2, (y1 + y2 - font.size) / 2 - 1), text, font=font, fill=text_fill)


def promo_block(draw, x, y, max_w, scale=1.0):
    """Return height used."""
    code_f = fit(draw, PROMO, max_w, int(28 * scale))
    line_f = fit(draw, PROMO_LINE, max_w, int(16 * scale), bold=False)
    # gold chip behind code
    tw = draw.textlength(PROMO, font=code_f)
    pad_x, pad_y = int(12 * scale), int(6 * scale)
    box = (x, y, x + tw + pad_x * 2, y + code_f.size + pad_y * 2)
    draw.rounded_rectangle(box, radius=max(4, int(8 * scale)), outline=GOLD, width=max(1, int(2 * scale)))
    draw.text((x + pad_x, y + pad_y), PROMO, font=code_f, fill=GOLD)
    y2 = box[3] + int(4 * scale)
    draw.text((x, y2), PROMO_LINE, font=line_f, fill=TEAL)
    return (y2 + line_f.size) - y


def make_banner(w: int, h: int) -> Image.Image:
    hero_path, focus = pick_hero(w, h)
    hero = Image.open(hero_path).convert("RGB")
    # slight contrast boost
    hero = ImageEnhance.Contrast(hero).enhance(1.08)
    hero = ImageEnhance.Color(hero).enhance(1.05)

    ratio = w / h
    # Tiny leaderboards — solid premium panel (photo too noisy)
    if h <= 55 or (h <= 100 and ratio >= 3):
        return layout_micro(w, h)
    if ratio >= 3.2 or h <= 130:
        return layout_leaderboard(w, h, hero, focus)
    if ratio <= 0.7:
        return layout_skyscraper(w, h, hero)
    if w == 940 and h == 1524:
        return layout_poster(w, h, hero)
    if ratio >= 1.6:
        return layout_landscape(w, h, hero)
    return layout_rect(w, h, hero)


def layout_micro(w, h):
    img = Image.new("RGB", (w, h), NAVY)
    # teal left accent
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, max(3, w // 70), h), fill=TEAL)
    pad = max(4, h // 6)
    bf = fit(d, BRAND, int(w * 0.22), max(9, int(h * 0.28)))
    title = HEAD_TINY if h <= 55 else HEAD_SHORT
    tf = fit(d, title, int(w * 0.40), max(10, int(h * 0.4)))
    if h <= 55:
        d.text((pad + 6, (h - bf.size) // 2), BRAND, font=bf, fill=TEAL)
        bx = pad + 6 + d.textlength(BRAND, font=bf) + 10
        d.text((bx, (h - tf.size) // 2), title, font=tf, fill=WHITE)
    else:
        d.text((pad + 6, 2), BRAND, font=bf, fill=TEAL)
        d.text((pad + 6, pad + bf.size), title, font=tf, fill=WHITE)
    cta_h = max(18, int(h * 0.55))
    cta_w = max(64, int(w * 0.16))
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), TEAL, CTA_SHORT if w < 500 else CTA)
    # promo
    if w >= 360:
        pf = fit(d, PROMO, int(w * 0.14), max(9, int(h * 0.32)))
        pw = d.textlength(PROMO, font=pf) + 14
        px = w - pad - cta_w - 8 - pw
        py = (h - (pf.size + 8)) // 2
        d.rounded_rectangle((px, py, px + pw, py + pf.size + 8), radius=6, outline=GOLD, width=1)
        d.text((px + 7, py + 4), PROMO, font=pf, fill=GOLD)
    return img


def layout_leaderboard(w, h, hero, focus):
    base = cover(hero, w, h, focus="left")
    base = scrim(base, "right" if w > 900 else "full")
    d = ImageDraw.Draw(base)
    pad = max(10, h // 7)

    bf = fit(d, BRAND, int(w * 0.25), max(11, int(h * 0.2)))
    d.text((pad, max(4, pad // 3)), BRAND, font=bf, fill=TEAL)

    title = HEAD if w >= 1100 and h >= 160 else HEAD_SHORT
    if h < 140:
        title = HEAD_SHORT
    tf = fit(d, title, int(w * 0.48), max(14, int(h * 0.28)))
    d.text((pad, pad // 2 + bf.size + 2), title, font=tf, fill=WHITE)

    if h >= 160:
        sf = fit(d, SUB, int(w * 0.45), max(12, int(h * 0.14)), bold=False)
        d.text((pad, pad // 2 + bf.size + tf.size + 8), SUB, font=sf, fill=MUTED)

    cta_h = max(28, int(h * 0.38))
    cta_w = max(110, int(w * 0.14))
    cta_text = CTA if w >= 900 else CTA_SHORT
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), TEAL, cta_text)

    # promo left of CTA
    ph = promo_block(d, w - pad - cta_w - int(w * 0.2), (h - int(h * 0.45)) // 2, int(w * 0.18), scale=max(0.7, h / 200))
    return base


def layout_landscape(w, h, hero):
    """1080x450, 480x320, 970x250-ish handled partly by leaderboard."""
    base = cover(hero, w, h, focus="left")
    base = scrim(base, "right")
    d = ImageDraw.Draw(base)
    pad = max(16, h // 16)
    x0 = int(w * 0.42)
    max_w = w - x0 - pad

    bf = fit(d, BRAND, max_w, max(14, h // 18))
    d.text((x0, pad), BRAND, font=bf, fill=TEAL)

    y = pad + bf.size + 8
    title = HEAD if w >= 900 else HEAD_SHORT
    tf = fit(d, title, max_w, max(18, h // 10))
    for line in wrap(d, title, tf, max_w, 3):
        d.text((x0, y), line, font=tf, fill=WHITE)
        y += tf.size + 4

    sf = fit(d, SUB, max_w, max(13, h // 18), bold=False)
    d.text((x0, y + 4), SUB if d.textlength(SUB, font=sf) <= max_w else SUB_SHORT, font=sf, fill=MUTED)
    y += sf.size + 14

    if h >= 300:
        for b in BENEFITS_SHORT:
            bfnt = fit(d, "• " + b, max_w, max(12, h // 22), bold=False)
            d.text((x0, y), "• " + b, font=bfnt, fill=MUTED)
            y += bfnt.size + 4

    # promo + CTA bottom of text column
    cta_h = max(36, int(h * 0.12))
    cta_w = min(max_w, 240)
    promo_h = promo_block(d, x0, h - pad - cta_h - 50, min(280, max_w), scale=0.95)
    round_btn(d, (x0, h - pad - cta_h, x0 + cta_w, h - pad), TEAL, CTA)

    ff = fit(d, FOOTER_SHORT, max_w, 11, bold=False)
    d.text((x0 + cta_w + 12, h - pad - cta_h + (cta_h - ff.size) // 2), FOOTER_SHORT, font=ff, fill=(140, 160, 175))
    return base


def layout_rect(w, h, hero):
    base = cover(hero, w, h, focus="center")
    base = scrim(base, "bottom")
    d = ImageDraw.Draw(base)
    pad = max(10, min(w, h) // 18)

    bf = fit(d, BRAND, w - 2 * pad, max(11, h // 22))
    d.text(((w - d.textlength(BRAND, font=bf)) / 2, pad), BRAND, font=bf, fill=TEAL)

    # text block in lower half
    y = int(h * 0.48)
    max_w = w - 2 * pad
    title = HEAD_SHORT if w < 360 else HEAD
    tf = fit(d, title, max_w, max(14, w // 14))
    for line in wrap(d, title, tf, max_w, 3):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3

    sf = fit(d, SUB_SHORT if w < 340 else SUB, max_w, max(11, w // 22), bold=False)
    sub = SUB_SHORT if d.textlength(SUB, font=sf) > max_w else (SUB if w >= 340 else SUB_SHORT)
    tw = d.textlength(sub, font=sf)
    d.text(((w - tw) / 2, y + 2), sub, font=sf, fill=MUTED)
    y += sf.size + 10

    if h >= 400:
        for b in BENEFITS_SHORT[:3]:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(11, w // 20), bold=False)
            tw = d.textlength(line, font=bfnt)
            d.text(((w - tw) / 2, y), line, font=bfnt, fill=MUTED)
            y += bfnt.size + 3

    cta_h = max(28, int(h * 0.09))
    cta_w = min(w - 2 * pad, max(140, int(w * 0.7)))
    # promo centered
    code_f = fit(d, PROMO, max_w, max(14, w // 16))
    tw = d.textlength(PROMO, font=code_f)
    px = (w - tw - 20) // 2
    py = h - pad - cta_h - 48
    d.rounded_rectangle((px, py, px + tw + 20, py + code_f.size + 10), radius=8, outline=GOLD, width=2)
    d.text((px + 10, py + 5), PROMO, font=code_f, fill=GOLD)
    lf = fit(d, PROMO_LINE, max_w, max(10, w // 24), bold=False)
    tw2 = d.textlength(PROMO_LINE, font=lf)
    d.text(((w - tw2) / 2, py + code_f.size + 12), PROMO_LINE, font=lf, fill=TEAL)

    round_btn(
        d,
        ((w - cta_w) // 2, h - pad - cta_h, (w + cta_w) // 2, h - pad),
        TEAL,
        CTA_SHORT if w < 280 else CTA,
    )
    return base


def layout_skyscraper(w, h, hero):
    base = cover(hero, w, h, focus="top")
    base = scrim(base, "bottom")
    d = ImageDraw.Draw(base)
    pad = max(8, w // 12)

    bf = fit(d, BRAND, w - 2 * pad, max(10, w // 11))
    d.text(((w - d.textlength(BRAND, font=bf)) / 2, pad), BRAND, font=bf, fill=TEAL)

    y = int(h * 0.42)
    max_w = w - 2 * pad
    title = "Без лишних сложностей" if w <= 180 else HEAD_SHORT
    tf = fit(d, title, max_w, max(13, w // 10))
    for line in wrap(d, title, tf, max_w, 4):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3

    sf = fit(d, SUB_SHORT, max_w, max(10, w // 14), bold=False)
    tw = d.textlength(SUB_SHORT, font=sf)
    d.text(((w - tw) / 2, y + 4), SUB_SHORT, font=sf, fill=MUTED)
    y += sf.size + 12

    if h >= 500 and w >= 200:
        for b in BENEFITS_SHORT:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(10, w // 16), bold=False)
            d.text((pad, y), line, font=bfnt, fill=MUTED)
            y += bfnt.size + 4

    cta_h = max(28, int(h * 0.055))
    # promo
    code_f = fit(d, PROMO, max_w, max(12, w // 12))
    tw = d.textlength(PROMO, font=code_f)
    px = (w - tw - 16) // 2
    py = h - pad - cta_h - (52 if w >= 180 else 40)
    d.rounded_rectangle((px, py, px + tw + 16, py + code_f.size + 8), radius=6, outline=GOLD, width=2)
    d.text((px + 8, py + 4), PROMO, font=code_f, fill=GOLD)
    lf = fit(d, "500 ₽", max_w, max(10, w // 14), bold=False)
    tw2 = d.textlength("500 ₽", font=lf)
    d.text(((w - tw2) / 2, py + code_f.size + 10), "500 ₽", font=lf, fill=TEAL)

    round_btn(d, (pad, h - pad - cta_h, w - pad, h - pad), TEAL, CTA_SHORT if w < 220 else CTA)

    if h >= 550:
        ff = fit(d, FOOTER_SHORT, max_w, 9, bold=False)
        # above promo if space — skip to avoid clutter
    return base


def layout_poster(w, h, hero):
    base = cover(hero, w, h, focus="top")
    base = scrim(base, "bottom")
    d = ImageDraw.Draw(base)
    pad = 48

    bf = fit(d, BRAND, w - 2 * pad, 34)
    d.text((pad, 36), BRAND, font=bf, fill=TEAL)

    y = int(h * 0.52)
    max_w = w - 2 * pad
    tf = fit(d, HEAD, max_w, 52)
    for line in wrap(d, HEAD, tf, max_w, 3):
        d.text((pad, y), line, font=tf, fill=WHITE)
        y += tf.size + 8

    sf = fit(d, SUB, max_w, 26, bold=False)
    d.text((pad, y + 6), SUB, font=sf, fill=MUTED)
    y += sf.size + 28

    for b in BENEFITS:
        line = "•  " + b
        bfnt = fit(d, line, max_w, 22, bold=False)
        d.text((pad, y), line, font=bfnt, fill=MUTED)
        y += bfnt.size + 10

    y += 16
    promo_block(d, pad, y, 420, scale=1.3)
    cta_h = 64
    round_btn(d, (pad, h - pad - cta_h - 36, pad + 360, h - pad - 36), TEAL, CTA)
    ff = fit(d, FOOTER, max_w, 16, bold=False)
    d.text((pad, h - pad - 24), FOOTER, font=ff, fill=(150, 170, 185))
    return base


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    for w, h in SIZES:
        img = make_banner(w, h)
        assert img.size == (w, h), (img.size, (w, h))
        name = f"ppm-travel-premium-{w}x{h}.png"
        img.save(OUT / name, "PNG", optimize=True)
        img.save(OUT_WS / name, "PNG", optimize=True)
        print("OK", name)

    readme = """Плати по миру — премиум travel-баннеры (промпт v2)

Заголовок: Путешествуйте без лишних сложностей
Подзаголовок: Виртуальная карта для оплаты за границей
Промокод: LG2026 — 500 ₽ на открытие карты
CTA: Оформить карту
Все 19 размеров РСЯ, PNG.
"""
    (OUT / "README.txt").write_text(readme, encoding="utf-8")
    (OUT_WS / "README.txt").write_text(readme, encoding="utf-8")
    print("Done", OUT)


if __name__ == "__main__":
    main()
