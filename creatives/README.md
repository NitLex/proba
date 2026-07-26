# Pipeline creatives

- `pipeline/<run_id>/` — PNG от креатив-агента (gitignored), заливаются на `orkestr.online`.
- `run-2-ads.json` — Title/Text/callouts для run #2 (product TextAd).
- `upload-run-2.mjs` — повторная загрузка картинок на ingest API.

```bash
node creatives/upload-run-2.mjs
# или:
PIPELINE_RUN_ID=2 PIPELINE_INGEST_TOKEN=… node creatives/upload-run-2.mjs
```
