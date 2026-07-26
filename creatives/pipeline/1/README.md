# Pipeline run 1 — product TextAd creatives

Engine: Cursor creative agent (`GenerateImage`), format **product** (no text on image).

| Angle | PNG | Hook |
|-------|-----|------|
| `travel` | `travel-agent-0.png` | Navy blank card on passport + suitcase, airport sunrise |
| `services` | `services-agent-0.png` | Black blank card + phone with abstract neon wash (no brand UI) |
| `sbp` | `sbp-agent-0.png` | Blank card + mint light-waves / instant top-up |

Copy: `TEXTAD_PRODUCT.json` (Title/Text with «зарубежная карта» / «выпуск зарубежной карты», promo `LG2026`).

## Ingest to ArbTrack

```bash
python3 creatives/pipeline/1/upload_ingest.py \
  --token '<pipeline ingest token>' \
  --run-id 1 \
  --prefer-jpeg
```

Use `--prefer-jpeg` to stay under nginx body limits (PNG batch → 413).

Last attempt with the token from the step brief returned `403 Неверный ingest token` (see `ingest_status.json`). Re-run with a fresh token from the pipeline creative step.
