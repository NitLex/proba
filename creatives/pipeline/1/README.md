# Pipeline run 1 — product TextAd creatives

Engine: Cursor creative agent (`GenerateImage`), format **product** (no text on image).

| Angle | PNG | Hook |
|-------|-----|------|
| `travel` | `travel-agent-0.png` | Card + passport on suitcase, airport sunrise |
| `services` | `services-agent-0.png` | Card + phone, abstract subscription icons |
| `sbp` | `sbp-agent-0.png` | Card + mint motion / instant top-up |

Copy: `TEXTAD_PRODUCT.json` (Title/Text with «зарубежная карта» / «выпуск зарубежной карты», promo `LG2026`).

## Ingest to ArbTrack

```bash
python3 creatives/pipeline/1/upload_ingest.py \
  --token '<pipeline ingest token>' \
  --run-id 1 \
  --prefer-jpeg
```

Last attempt with the token from the step brief returned `403 Неверный ingest token` (see `ingest_status.json`).
