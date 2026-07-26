# Pipeline run 1 — product creatives (Cursor GenerateImage)

Формат: **product** (без текста на картинке). Квадрат 1024×1024.

| angle_id | файл | хук |
|---|---|---|
| travel | `travel-agent-0.png` | карта + паспорт/посадочный на чемодане, lounge sunrise |
| services | `services-agent-0.png` | чёрная карта + телефон с blur иконок подписок |
| sbp | `sbp-agent-0.png` | карта + mint light-wave (мгновенное пополнение) |

Движок: Cursor креатив-агент (`GenerateImage`), без YandexART/GPT Image.

## Ingest на трекер

Токен из промпта спавна отклоняется (`403 Неверный ingest token`).

```bash
python3 creatives/pipeline/1/upload_ingest.py --run-id 1 --token '<FRESH_TOKEN>'
```

Копии для Директа: `creatives/rsya/direct-textad/ppm-*-1080.jpg`  
Тексты объявлений: `TEXTAD_PRODUCT.json`
