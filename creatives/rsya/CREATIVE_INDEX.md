# РСЯ product TextAd — run 1 (agent)

Движок: Cursor GenerateImage. Формат: product (без текста на картинке).

| Угол | Pipeline PNG | Direct 1080 JPG |
|------|--------------|-----------------|
| travel | `creatives/pipeline/1/travel-agent-0.png` | `direct-textad/ppm-travel-1080.jpg` |
| services | `creatives/pipeline/1/services-agent-0.png` | `direct-textad/ppm-services-1080.jpg` |
| sbp | `creatives/pipeline/1/sbp-agent-0.png` | `direct-textad/ppm-sbp-1080.jpg` |

Копирайт: `TEXTAD_PRODUCT_LG2026.json` / `creatives/pipeline/1/TEXTAD_PRODUCT.json`.
Промокод: LG2026 (−500 ₽ если актуально).

Ingest: `python3 creatives/pipeline/1/upload_ingest.py --token '<FRESH>' --run-id 1`
