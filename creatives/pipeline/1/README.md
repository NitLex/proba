# Pipeline run 1 — product creatives (Cursor agent)

Формат: **товарное TextAd** (чистая картинка без текста на баннере).

| Угол | Файл | Хук |
|------|------|-----|
| travel | `travel-agent-0.png` | Navy-карта на паспорте/чемодане, sunrise lounge |
| services | `services-agent-0.png` | Black-карта + смартфон с abstract app blur |
| sbp | `sbp-agent-0.png` | Карта + mint light-waves (быстрое пополнение) |

Движок: Cursor `GenerateImage` (не YandexART/GPT). Размер: 1024×1024.

## QA картинок

- Квадрат 1:1, объект ~55–70% кадра
- Нет Visa/Mastercard/Apple Pay/Google Pay/банковских логотипов
- Лицо карты blank (без номеров/имён)
- Нет текста/цифр/QR/водяных знаков на изображении

## Ingest

Попытка с токеном из промпта (`run_id=1`) → `403 Неверный ingest token` (после обхода nginx `413` через JPEG one-by-one).

Повтор со свежим токеном:

```bash
python3 creatives/pipeline/1/upload_ingest.py --token '<FRESH_TOKEN>' --run-id 1
```

Тексты: `TEXTAD_PRODUCT.json` (Title ≤56, Text ≤81, есть «зарубежная карта» / «выпуск зарубежной карты», промокод LG2026).
В углу services заголовок «без отказа» из брифа заменён на безопасный вариант без намёка на гарантию одобрения.
