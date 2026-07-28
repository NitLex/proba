# Pipeline run 2 — РСЯ product creatives (agent)

Формат: **товарный TextAd** (картинка без текста + Title/Text в Директе).

Движок: Cursor креатив-агент (`GenerateImage`), без YandexART/GPT Image API.

## Файлы

| Угол | PNG 1024×1024 | JPEG |
|------|---------------|------|
| generic (Основной угол) v0 | `generic-agent-0.png` | `generic-agent-0.jpg` |
| generic (Основной угол) v1 | `generic-agent-1.png` | `generic-agent-1.jpg` |

Тексты: `TEXTAD_PRODUCT.json` · метаданные: `manifest.json`

## Визуальные крючки

1. **generic-0** — белая blank-карта на teal still-life с тенями листвы (lifestyle desire)
2. **generic-1** — матовая charcoal blank-карта с EMV-чипом, cinematic dual-tone light (product hero)

Оба кадра: ZERO text / ZERO payment logos / blank card face (без номеров и имени).

## Правила копирайта

- В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»
- Title ≤ 56, Text ≤ 81
- Без гарантий одобрения, без чужих брендов
- Промокода в оффере нет

## Ingest

```bash
python3 upload_ingest.py --run-id 2 --token '<TOKEN>' --prefer-jpeg
```

Токен из шага пайплайна может устареть (HTTP 403) из‑за параллельных creative-спавнов.
Нужен актуальный `creative_ingest.token` для `run_id=2` (после деплоя фикса reuse/hashes).
JPEG по одному файлу — чтобы не ловить nginx 413 на больших PNG.

Статус попытки: `ingest_status.json`.
