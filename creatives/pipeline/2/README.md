# Pipeline run 2 — РСЯ product creatives (Cursor agent)

Формат: **product** (чистая картинка без текста; Title/Text только в Директе).

| angle_id | PNG 1024×1024 | JPEG (для ingest) | Крючок |
|----------|---------------|-------------------|--------|
| travel | `travel-agent-0.png` | `travel-agent-0.jpg` | Карта + паспорт на чемодане, lounge sunrise |
| services | `services-agent-0.png` | `services-agent-0.jpg` | Чёрная карта + телефон с абстрактным blur иконок |
| sbp | `sbp-agent-0.png` | `sbp-agent-0.jpg` | Мятная карта + light-wave «мгновенное пополнение» |

Движок: Cursor `GenerateImage` (agent). Без YandexART / GPT Image.

Тексты объявлений: `TEXTAD_PRODUCT.json` (везде «зарубежная карта» / «выпуск зарубежной карты», промокод LG2026).

## Ingest в трекер

```bash
python3 upload_ingest.py --token '<fresh-token>' --run-id 2
```

JPEG грузится по одному углу (иначе nginx 413 на полном PNG).  
Если API отвечает `Неверный ingest token` — нужен свежий token из текущего pipeline run.
