#!/usr/bin/env python3
"""Premium subscriptions/services RSYa banners — Apple-style glassmorphism v3."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

OUT = Path("/opt/cursor/artifacts/banners/rsya-v3")
OUT_WS = Path("/workspace/creatives/rsya/banners-v3")
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
HEAD = "Оплачивайте зарубежные сервисы"
HEAD_SHORT = "Зарубежные сервисы"
HEAD_TINY = "Карта для сервисов"
SUB = "Виртуальная карта для подписок и цифровых сервисов"
SUB_SHORT = "Карта для подписок"
BENEFITS = [
    "оформление онлайн за несколько минут",
    "пополнение рублями через СБП",
    "подходит для оплаты зарубежных сервисов",
    "современная виртуальная карта",
]
BENEFITS_SHORT = [
    "онлайн за минуты",
    "пополнение по СБП",
    "для зарубежных сервисов",
    "виртуальная карта",
]
PROMO = "LG2026"
PROMO_LINE = "500 ₽ на открытие карты"
CTA = "Оформить онлайн"
CTA_SHORT = "Оформить"

NAVY = (10, 16, 28)
BLUE = (72, 160, 255)
TEAL = (32, 210, 190)
ORANGE = (255, 140, 60)
WHITE = (255, 255, 255)
MUTED = (175, 195, 220)

HERO_WIDE = ASSETS / "ppm-v3-hero-16x9.png"
HERO_TALL = ASSETS / "ppm-v3-hero-9x16.png"
HERO_SQ = ASSETS / "ppm-v3-hero-1x1.png"


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
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def round_btn(draw, box, fill, text, text_fill=(8, 18, 30)):
    x1, y1, x2, y2 = box
    h = y2 - y1
    r = max(4, min(h // 2, 22))
    draw.rounded_rectangle(box, radius=r, fill=fill)
    font = fit(draw, text, (x2 - x1) - 12, max(10, int(h * 0.42)))
    tw = draw.textlength(text, font=font)
    draw.text(((x1 + x2 - tw) / 2, (y1 + y2 - font.size) / 2 - 1), text, font=font, fill=text_fill)


def promo_big(draw, x, y, max_w, scale=1.0) -> int:
    code_f = fit(draw, PROMO, max_w, int(36 * scale))
    line_f = fit(draw, PROMO_LINE, max_w, int(15 * scale), bold=False)
    tw = draw.textlength(PROMO, font=code_f)
    pad_x, pad_y = int(14 * scale), int(8 * scale)
    box = (x, y, x + tw + pad_x * 2, y + code_f.size + pad_y * 2)
    draw.rounded_rectangle(box, radius=max(6, int(10 * scale)), fill=(35, 24, 16), outline=ORANGE, width=max(2, int(3 * scale)))
    draw.text((x + pad_x, y + pad_y), PROMO, font=code_f, fill=ORANGE)
    y2 = box[3] + int(6 * scale)
    draw.text((x, y2), PROMO_LINE, font=line_f, fill=TEAL)
    return (y2 + line_f.size) - y


def hero_img(w, h):
    r = w / h
    if r >= 2.2:
        path, focus = HERO_WIDE, "right"
    elif r <= 0.75:
        path, focus = HERO_TALL, "top"
    elif abs(r - 1) < 0.2:
        path, focus = HERO_SQ, "center"
    elif r > 1:
        path, focus = HERO_WIDE, "right"
    else:
        path, focus = HERO_TALL, "top"
    img = ImageEnhance.Contrast(Image.open(path).convert("RGB")).enhance(1.06)
    return cover(img, w, h, focus)


def make_banner(w, h):
    if h <= 55 or (h <= 100 and w / h >= 3):
        return layout_micro(w, h)
    r = w / h
    if r >= 3.0 or h <= 130:
        return layout_leaderboard(w, h)
    if r <= 0.7:
        return layout_skyscraper(w, h)
    if w == 940 and h == 1524:
        return layout_poster(w, h)
    if r >= 1.5:
        return layout_landscape(w, h)
    return layout_rect(w, h)


def layout_micro(w, h):
    img = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, max(3, w // 70), h), fill=TEAL)
    pad = max(4, h // 6)
    bf = fit(d, BRAND, int(w * 0.2), max(9, int(h * 0.28)))
    title = HEAD_TINY if h <= 55 else HEAD_SHORT
    tf = fit(d, title, int(w * 0.38), max(10, int(h * 0.4)))
    if h <= 55:
        d.text((pad + 6, (h - bf.size) // 2), BRAND, font=bf, fill=BLUE)
        d.text((pad + 6 + d.textlength(BRAND, font=bf) + 8, (h - tf.size) // 2), title, font=tf, fill=WHITE)
    else:
        d.text((pad + 6, 2), BRAND, font=bf, fill=BLUE)
        d.text((pad + 6, bf.size + 4), title, font=tf, fill=WHITE)
    cta_h = max(18, int(h * 0.55))
    cta_w = max(72, int(w * 0.17))
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), TEAL, CTA_SHORT if w < 520 else CTA)
    if w >= 380:
        pf = fit(d, PROMO, int(w * 0.12), max(10, int(h * 0.34)))
        pw = d.textlength(PROMO, font=pf) + 12
        px = w - pad - cta_w - 8 - pw
        d.rounded_rectangle((px, (h - pf.size - 10) // 2, px + pw, (h + pf.size + 10) // 2), radius=6, outline=ORANGE, width=2)
        d.text((px + 6, (h - pf.size) // 2), PROMO, font=pf, fill=ORANGE)
    return img


def layout_leaderboard(w, h):
    base = scrim(hero_img(w, h), "left")
    d = ImageDraw.Draw(base)
    pad = max(10, h // 7)
    x0 = pad
    max_w = int(w * 0.48)

    bf = fit(d, BRAND, max_w, max(11, int(h * 0.2)))
    d.text((x0, max(4, pad // 3)), BRAND, font=bf, fill=BLUE)

    title = HEAD if w >= 1000 and h >= 150 else HEAD_SHORT
    tf = fit(d, title, max_w, max(14, int(h * 0.26)))
    y = pad // 2 + bf.size + 4
    for line in wrap(d, title, tf, max_w, 2):
        d.text((x0, y), line, font=tf, fill=WHITE)
        y += tf.size + 2

    if h >= 120:
        y += 4
        promo_big(d, x0, y, min(220, max_w), scale=max(0.6, h / 240))

    cta_h = max(28, int(h * 0.4))
    cta_w = max(120, int(w * 0.15))
    round_btn(d, (w - pad - cta_w, (h - cta_h) // 2, w - pad, (h + cta_h) // 2), TEAL, CTA if w >= 850 else CTA_SHORT)
    return base


def layout_landscape(w, h):
    base = scrim(hero_img(w, h), "left")
    d = ImageDraw.Draw(base)
    pad = max(16, h // 16)
    x0 = pad
    max_w = int(w * 0.50)

    bf = fit(d, BRAND, max_w, max(14, h // 18))
    d.text((x0, pad), BRAND, font=bf, fill=BLUE)

    y = pad + bf.size + 10
    tf = fit(d, HEAD, max_w, max(20, h // 9))
    for line in wrap(d, HEAD, tf, max_w, 3):
        d.text((x0, y), line, font=tf, fill=WHITE)
        y += tf.size + 4

    sf = fit(d, SUB, max_w, max(12, h // 20), bold=False)
    sub = SUB if draw_fits(d, SUB, sf, max_w) else SUB_SHORT
    d.text((x0, y + 4), sub, font=sf, fill=MUTED)
    y += sf.size + 12

    y += promo_big(d, x0, y, min(320, max_w), scale=0.9)

    if h >= 300:
        for b in BENEFITS_SHORT:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(11, h // 24), bold=False)
            d.text((x0, y), line, font=bfnt, fill=MUTED)
            y += bfnt.size + 3

    cta_h = max(36, int(h * 0.12))
    cta_w = min(max_w, 250)
    round_btn(d, (x0, h - pad - cta_h, x0 + cta_w, h - pad), TEAL, CTA)
    return base


def layout_rect(w, h):
    base = scrim(hero_img(w, h), "bottom")
    d = ImageDraw.Draw(base)
    pad = max(10, min(w, h) // 18)
    max_w = w - 2 * pad

    bf = fit(d, BRAND, max_w, max(11, h // 22))
    d.text(((w - d.textlength(BRAND, font=bf)) / 2, pad), BRAND, font=bf, fill=BLUE)

    y = int(h * 0.40)
    title = HEAD_SHORT if w < 360 else HEAD
    tf = fit(d, title, max_w, max(14, w // 14))
    for line in wrap(d, title, tf, max_w, 3):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3

    sf = fit(d, SUB_SHORT if w < 340 else SUB, max_w, max(10, w // 24), bold=False)
    sub = SUB_SHORT if w < 340 else SUB
    if not draw_fits(d, sub, sf, max_w):
        sub = SUB_SHORT
    tw = d.textlength(sub, font=sf)
    d.text(((w - tw) / 2, y + 2), sub, font=sf, fill=MUTED)
    y += sf.size + 10

    y += promo_big(d, (w - min(260, max_w)) // 2, y, min(260, max_w), scale=0.85)

    cta_h = max(28, int(h * 0.09))
    cta_w = min(w - 2 * pad, max(150, int(w * 0.72)))
    round_btn(d, ((w - cta_w) // 2, h - pad - cta_h, (w + cta_w) // 2, h - pad), TEAL, CTA_SHORT if w < 280 else CTA)
    return base


def layout_skyscraper(w, h):
    base = scrim(hero_img(w, h), "bottom")
    d = ImageDraw.Draw(base)
    pad = max(8, w // 12)
    max_w = w - 2 * pad

    bf = fit(d, BRAND, max_w, max(10, w // 11))
    d.text(((w - d.textlength(BRAND, font=bf)) / 2, pad), BRAND, font=bf, fill=BLUE)

    y = int(h * 0.38)
    title = HEAD_SHORT if w <= 200 else HEAD
    tf = fit(d, title, max_w, max(13, w // 10))
    for line in wrap(d, title, tf, max_w, 4):
        tw = d.textlength(line, font=tf)
        d.text(((w - tw) / 2, y), line, font=tf, fill=WHITE)
        y += tf.size + 3

    sf = fit(d, SUB_SHORT, max_w, max(10, w // 14), bold=False)
    tw = d.textlength(SUB_SHORT, font=sf)
    d.text(((w - tw) / 2, y + 4), SUB_SHORT, font=sf, fill=MUTED)
    y += sf.size + 12

    if h >= 500 and w >= 180:
        for b in BENEFITS_SHORT:
            line = "• " + b
            bfnt = fit(d, line, max_w, max(10, w // 16), bold=False)
            d.text((pad, y), line, font=bfnt, fill=MUTED)
            y += bfnt.size + 4

    cta_h = max(28, int(h * 0.055))
    promo_y = h - pad - cta_h - (58 if w >= 180 else 44)
    promo_big(d, pad, promo_y, max_w, scale=max(0.75, w / 220))
    round_btn(d, (pad, h - pad - cta_h, w - pad, h - pad), TEAL, CTA_SHORT if w < 220 else CTA)
    return base


def layout_poster(w, h):
    base = scrim(hero_img(w, h), "bottom")
    d = ImageDraw.Draw(base)
    pad = 48
    max_w = w - 2 * pad
    cta_h = 64
    bottom_reserved = pad + cta_h + 16 + 100

    bf = fit(d, BRAND, max_w, 34)
    d.text((pad, 36), BRAND, font=bf, fill=BLUE)

    y = int(h * 0.46)
    tf = fit(d, HEAD, max_w, 46)
    for line in wrap(d, HEAD, tf, max_w, 3):
        d.text((pad, y), line, font=tf, fill=WHITE)
        y += tf.size + 8

    y += promo_big(d, pad, y + 8, 400, scale=1.2)

    sf = fit(d, SUB, max_w, 24, bold=False)
    d.text((pad, y + 10), SUB, font=sf, fill=MUTED)
    y += sf.size + 24

    for b in BENEFITS:
        line = "•  " + b
        bfnt = fit(d, line, max_w, 20, bold=False)
        if y + bfnt.size > h - bottom_reserved:
            break
        d.text((pad, y), line, font=bfnt, fill=MUTED)
        y += bfnt.size + 10

    round_btn(d, (pad, h - pad - cta_h, pad + 380, h - pad), TEAL, CTA)
    return base


def draw_fits(d, text, font, max_w):
    return d.textlength(text, font=font) <= max_w


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    OUT_WS.mkdir(parents=True, exist_ok=True)
    for w, h in SIZES:
        img = make_banner(w, h)
        assert img.size == (w, h)
        name = f"ppm-services-premium-{w}x{h}.png"
        img.save(OUT / name, "PNG", optimize=True)
        img.save(OUT_WS / name, "PNG", optimize=True)
        print("OK", name)

    readme = """Плати по миру — премиум баннеры «зарубежные сервисы» (v3)

Стиль: Apple minimalism, glassmorphism, без логотипов брендов.
Заголовок: Оплачивайте зарубежные сервисы
Промокод: LG2026 — 500 ₽ на открытие карты
CTA: Оформить онлайн
19 размеров РСЯ, PNG.
"""
    (OUT / "README.txt").write_text(readme, encoding="utf-8")
    (OUT_WS / "README.txt").write_text(readme, encoding="utf-8")
    print("Done", OUT)


if __name__ == "__main__":
    main()
