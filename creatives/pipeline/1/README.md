# Pipeline run 1 — РСЯ product creatives (agent)

Формат: **товарное TextAd** (картинка без текста + Title/Text в Директе).

| Angle | Файл | Хук |
|-------|------|-----|
| `travel` | `travel-agent-0.png` | Navy-карта на паспорте / чемодане, sunrise lounge |
| `services` | `services-agent-0.png` | Чёрная карта + смартфон с blur-иконками подписок |

Движок: Cursor `GenerateImage` (без YandexART / GPT Image).

Тексты: `TEXTAD_PRODUCT.json` — обязательная фраза «зарубежная карта» / «выпуск зарубежной карты».

Загрузка на оркестратор:

```bash
python3 upload_ingest.py --run-id 1 --token '<token>' --prefer-jpeg
```
