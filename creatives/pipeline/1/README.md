# Pipeline run 1 — РСЯ product creatives (agent)

Формат: **товарный TextAd** (картинка без текста + Title/Text в Директе).

Движок: Cursor креатив-агент (`GenerateImage`), без YandexART/GPT Image API.

## Файлы

| Угол | PNG 1024×1024 | JPEG |
|------|---------------|------|
| travel (Поездки) | `travel-agent-0.png` | `travel-agent-0.jpg` |
| services (Подписки) | `services-agent-0.png` | `services-agent-0.jpg` |

Тексты: `TEXTAD_PRODUCT.json` · метаданные: `manifest.json`

## Визуальные крючки

1. **travel** — матовая navy blank-карта на burgundy-паспорте + boarding pass на hard-shell чемодане, airport lounge sunrise
2. **services** — чёрная blank-карта у смартфона с abstract app-icon blur (без читаемого UI)

Оба кадра: ZERO text / ZERO payment logos / blank card face.

## Правила копирайта

- В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»
- Title ≤ 56, Text ≤ 81
- Без гарантий одобрения, без чужих брендов
- Промокода в оффере нет

## Ingest

```bash
python3 upload_ingest.py --run-id 1 --token '<TOKEN>' --prefer-jpeg
```

Токен из шага пайплайна может устареть (HTTP 403). Нужен актуальный `creative_ingest` token для `run_id=1`.
JPEG по одному углу — чтобы не ловить nginx 413 на больших PNG.

Статус попытки: `ingest_status.json`.
