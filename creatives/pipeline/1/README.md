# Pipeline run 1 — product TextAd creatives

Engine: Cursor creative agent (`GenerateImage`), format **product** (no text on image).

| Angle | PNG | Hook |
|-------|-----|------|
| `travel` | `travel-agent-0.png` | Navy card + passport on suitcase, airport sunrise |
| `services` | `services-agent-0.png` | Black card + phone, abstract subscription icons |
| `sbp` | `sbp-agent-0.png` | Card + mint light-wave / instant top-up |

Copy: `TEXTAD_PRODUCT.json` (Title/Text with «зарубежная карта» / «выпуск зарубежной карты», promo `LG2026`).

## Ingest to ArbTrack

```bash
python3 creatives/pipeline/1/upload_ingest.py \
  --url https://orkestr.online/api/pipeline/ingest-creatives \
  --token '<pipeline ingest token>' \
  --run-id 1 \
  --prefer-jpeg
```

Ingest status: **ok** — `images_ok: 3` (JPEG uploaded to `orkestr.online`, see `ingest_status.json`).
