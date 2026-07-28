# Pipeline run 1 — РСЯ product creatives (agent)

Оффер: **Тестовая карта** · формат: **product** (TextAd + картинка без текста) · движок: **Cursor GenerateImage**.

| Угол | Файл | Хук |
|------|------|-----|
| `travel` (Поездки) | `travel-agent-0.png` | Navy blank-карта на паспорте + suitcase, sunrise lounge |
| `services` (Подписки) | `services-agent-0.png` | Чёрная blank-карта + смартфон с абстрактным blur иконок |

JPEG-варианты (`*-agent-0.jpg`) — для лёгкого ingest (меньше риск 413).

## TextAd

См. `TEXTAD_PRODUCT.json`. В каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты». Title ≤56, Text ≤81. Промокода нет.

## Ingest

```bash
python3 upload_ingest.py --run-id 1 --token '<TOKEN>' --prefer-jpeg
```

Endpoint: `POST https://orkestr.online/api/pipeline/ingest-creatives`
