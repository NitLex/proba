# Pipeline run 2 — РСЯ product creatives (agent)

Формат: **товарный TextAd** (картинка без текста + Title/Text в Директе).

Движок: Cursor креатив-агент (`GenerateImage`) — без YandexART/GPT.

## Файлы

| Угол | Вариант | PNG 1024×1024 | JPEG |
|------|---------|---------------|------|
| generic (Основной угол) | 0 | `generic-agent-0.png` | `generic-agent-0.jpg` |
| generic (Основной угол) | 1 | `generic-agent-1.png` | `generic-agent-1.jpg` |

Тексты: `TEXTAD_PRODUCT.json` · метаданные: `manifest.json`

## Хуки

1. **agent-0** — матовая charcoal blank-карта, teal-gradient, rim light
2. **agent-1** — frosted ice-blue blank metal card на slate, spotlight

## Правила копирайта

- В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»
- Title ≤ 56, Text ≤ 81
- Без гарантий одобрения, без чужих брендов
- Промокода в оффере нет
- На картинке ZERO text / logos / numbers

## Ingest

```bash
python3 upload_ingest.py --run-id 2 --token '<TOKEN>' --prefer-jpeg
```

JPEG по одному файлу — чтобы не ловить nginx 413 на больших PNG.
