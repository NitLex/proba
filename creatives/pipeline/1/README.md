# Pipeline run 1 — product creatives (agent)

Товарный формат РСЯ: чистые квадраты 1024×1024 без текста на картинке. Title/Text — только в полях TextAd.

| Угол | Файл | Хук |
|------|------|-----|
| `travel` | `travel-agent-0.png` (+ `.jpg`) | Navy blank-карта на паспорте / boarding pass / чемодане, lounge sunrise |
| `services` | `services-agent-0.png` (+ `.jpg`) | Чёрная blank-карта + смартфон с abstract app-blur |

Движок: Cursor GenerateImage (`agent`), без YandexART/GPT Image.

Копирайт: `TEXTAD_PRODUCT.json` — в каждом Title/Text есть «зарубежная карта» / «выпуск зарубежной карты».

Инжест на оркестратор:

```bash
python3 upload_ingest.py --token '<INGEST_TOKEN>' --prefer-jpeg
```

Токен из шага пайплайна может устареть (HTTP 403) из‑за параллельных creative-spawn'ов, которые раньше ротировали `creative_ingest.hash`. Нужен актуальный token для `run_id=1`. JPEG по одному углу — чтобы не ловить nginx 413 на больших PNG.
