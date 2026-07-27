# Pipeline run 2 — РСЯ product creatives (agent)

Формат: **товарный TextAd** (картинка без текста + Title/Text в Директе).

Движок: Cursor GenerateImage (без YandexART / GPT Image).

Оффер: Pipeline Live Offer · угол: **generic** (Основной угол).

## Файлы

| Угол | Вариант | PNG 1024×1024 | JPEG |
|------|---------|---------------|------|
| generic | agent-0 | `generic-agent-0.png` | `generic-agent-0.jpg` |
| generic | agent-1 | `generic-agent-1.png` | `generic-agent-1.jpg` |

Тексты: `TEXTAD_PRODUCT.json` · метаданные: `manifest.json`

## Визуальные крючки

- **agent-0** — матовая blank charcoal-карта, cool rim-light, slate/teal атмосфера
- **agent-1** — blank pearl-карта на бархате, тёплый cinematic side-light

На картинках нет текста, номеров, логотипов платёжных систем.

## Правила копирайта

- В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»
- Title ≤ 56, Text ≤ 81
- Без гарантий одобрения, без чужих брендов
- Промокода в оффере нет

## Ingest

```bash
python3 upload_ingest.py --run-id 2 --token '<TOKEN>' --prefer-jpeg
```

JPEG по одному файлу — чтобы не ловить nginx 413 на больших PNG.
