# Pipeline run 2 — РСЯ product creatives (agent)

Товарный формат TextAd: чистая картинка 1024×1024 без текста на баннере.

| angle_id | Угол | Файл |
|----------|------|------|
| travel | Поездки / travel-оплаты | `travel-agent-0.png` / `.jpg` |
| services | Подписки и онлайн-сервисы | `services-agent-0.png` / `.jpg` |
| sbp | Быстрый выпуск + СБП | `sbp-agent-0.png` / `.jpg` |

Движок: Cursor GenerateImage (`provider: agent`). Без YandexART / GPT Image.

## Ingest

```bash
python3 creatives/pipeline/2/upload_ingest.py --token '<FRESH_INGEST_TOKEN>' --run-id 2
```

Правила загрузки:
- JPEG по одному углу на запрос (иначе nginx 413 на больших PNG)
- `mime: image/jpeg`, `format: product`
- токен одноразовый из `run.context.creative_ingest` — при респавне шага обновляется

Копии для PR: `creatives/rsya/assets/` и `creatives/rsya/direct-textad/`.
Тексты TextAd: `TEXTAD_PRODUCT.json`.
