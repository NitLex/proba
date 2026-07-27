# Pipeline run 2 — РСЯ product creatives (agent)

- **Формат:** product / TextAd + AdImageHash (картинка без текста)
- **Угол:** `generic` (Основной угол) — 2 варианта
- **Движок:** Cursor GenerateImage (не YandexART / не GPT Image)
- **Размер:** 1024×1024
- **Копирайт:** в Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»

## Файлы

| Файл | Назначение |
|------|------------|
| `generic-agent-0.png` / `.jpg` | Blank charcoal-карта, cinematic light |
| `generic-agent-1.png` / `.jpg` | Blank navy-карта на сланце, rim light |
| `TEXTAD_PRODUCT.json` | Title/Text/sitelinks/callouts |
| `manifest.json` | Манифест вариантов |
| `upload_ingest.py` | Повторная загрузка на оркестратор |

## Ingest

```bash
python3 upload_ingest.py --run-id 2 --token '<TOKEN>' --prefer-jpeg
```

JPEG по одному варианту — чтобы не ловить nginx 413 на больших PNG.

Статус попытки: `ingest_status.json`.

Токен из промпта шага (`5XhiP0RDg2b4Zh5y5EWP1tJU`) дал **HTTP 403** (`Неверный ingest token`) —
`creative_ingest.hash` на run_id=2 не совпадает (race при параллельном spawn креатив-агентов).
Нужен свежий token из `run.context.creative_ingest` / респавн шага, затем:

```bash
python3 upload_ingest.py --run-id 2 --token '<FRESH_TOKEN>' --prefer-jpeg
```
