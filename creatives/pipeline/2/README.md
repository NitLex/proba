# Pipeline run 2 — product creatives (Cursor agent)

Формат: **товарное TextAd** (чистая картинка без текста на баннере).

| Угол | Файл | Хук |
|------|------|-----|
| travel | `travel-agent-0.png` | Navy-карта на паспорте/чемодане, sunrise lounge |
| services | `services-agent-0.png` | Black-карта + смартфон с abstract app blur |
| sbp | `sbp-agent-0.png` | Карта + mint light-waves (быстрое пополнение) |

Движок: Cursor `GenerateImage` (не YandexART/GPT). Размер: 1024×1024.

## Ingest

Первая попытка с токеном из промпта → `403 Неверный ingest token`
(на трекере hash перезаписывается параллельными creative-агентами).

Повтор со свежим токеном:

```bash
python3 creatives/pipeline/2/upload_ingest.py --token '<FRESH_TOKEN>' --run-id 2 --prefer-jpeg
```

Тексты: `TEXTAD_PRODUCT.json` (Title ≤56, Text ≤81, есть «зарубежная карта» / «выпуск зарубежной карты», промокод LG2026).
