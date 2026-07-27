# Pipeline run 1 — РСЯ product creatives (agent)

Формат: **товарный TextAd** (картинка без текста + Title/Text в Директе).

Движок: Cursor GenerateImage (без YandexART / GPT Image).

## Файлы

| Угол | PNG 1024×1024 | JPEG |
|------|---------------|------|
| travel (Поездки) | `travel-agent-0.png` | `travel-agent-0.jpg` |
| services (Подписки) | `services-agent-0.png` | `services-agent-0.jpg` |

Тексты: `TEXTAD_PRODUCT.json` · метаданные: `manifest.json`

## Визуальные крючки

- **travel** — матовая navy-карта на бургунди-паспорте и чемодане, sunrise lounge
- **services** — чёрная blank-карта + смартфон с абстрактным blur иконок подписок

## Правила копирайта

- В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»
- Title ≤ 56, Text ≤ 81
- Без гарантий одобрения, без чужих брендов
- Промокода в оффере нет

## Ingest

```bash
python3 upload_ingest.py --run-id 1 --token '<TOKEN>' --prefer-jpeg
```

JPEG по одному углу — чтобы не ловить nginx 413 на больших PNG.
