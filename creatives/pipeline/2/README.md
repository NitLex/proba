# Pipeline run 2 — РСЯ product creatives (agent)

Товарный формат TextAd: чистая картинка **без текста**; Title/Text только в полях Директа.

## Assets

| File | Hook |
|------|------|
| `generic-agent-0.png` / `.jpg` | Matte black brushed-metal blank card, cinematic rim light |
| `generic-agent-1.png` / `.jpg` | Frosted ice-white blank card on walnut, warm window light |
| `generic-agent-2.png` / `.jpg` | Emerald brushed-metal blank card, theatrical spotlight |

Все кадры 1024×1024, blank face (без логотипов/номеров/текста). Движок: Cursor GenerateImage.

## Copy

См. `TEXTAD_PRODUCT.json` / `manifest.json`. В Title/Text есть «зарубежная карта» / «выпуск зарубежной карты». Промокода нет.

## Ingest

```bash
python3 creatives/pipeline/2/upload_ingest.py \
  --url https://orkestr.online/api/pipeline/ingest-creatives \
  --run-id 2 \
  --token '<INGEST_TOKEN>' \
  --prefer-jpeg
```

Статус последней попытки: `ingest_status.json`.

> **Ingest 403:** токен из брифа шага отклонён оркестратором (`Неверный ingest token` — race/`creative_ingest.hash`). Локальные PNG/JPG готовы; повторите upload со свежим токеном из UI пайплайна.
