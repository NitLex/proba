# Pipeline run 2 — РСЯ product creatives (agent)

Товарный формат TextAd: чистая картинка **без текста**; Title/Text только в полях Директа.

## Assets

| File | Hook |
|------|------|
| `generic-agent-0.png` / `.jpg` | Matte black metal blank card, cinematic edge light |
| `generic-agent-1.png` / `.jpg` | Champagne pearl blank card, warm soft light |
| `generic-agent-2.png` / `.jpg` | Frosted ice-blue blank card, deep teal atmosphere |

Все кадры 1024×1024, blank face (без логотипов/номеров/текста).

## Copy

См. `TEXTAD_PRODUCT.json` / `manifest.json`. В Title/Text есть «зарубежная карта» / «выпуск зарубежной карты».

## Ingest

```bash
python3 creatives/pipeline/2/upload_ingest.py \
  --url https://orkestr.online/api/pipeline/ingest-creatives \
  --run-id 2 \
  --token '<INGEST_TOKEN>' \
  --prefer-jpeg
```

Статус последней попытки: `ingest_status.json`.
