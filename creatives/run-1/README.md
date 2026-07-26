# Pipeline run 1 — РСЯ product creatives (agent)

Формат: **product** (чистая картинка, текст только в TextAd).

| angle_id | Файл | Хук |
|----------|------|-----|
| `travel` | `travel-agent-0.png` / `.jpg` | Navy card + passport + suitcase, airport sunrise |
| `services` | `services-agent-0.png` / `.jpg` | Matte black card + phone with abstract app blur |

Локальный путь для оркестратора: `creatives/pipeline/1/<angle_id>-agent-0.png` (gitignored).

## TextAd

См. `textads.json`. В Title/Text есть «зарубежная карта» / «выпуск зарубежной карты». Title ≤56, Text ≤81. Промокода нет.

## Ingest

```bash
INGEST_TOKEN='<актуальный token из оркестратора>' ./creatives/run-1/ingest.sh
```

Статус последней попытки: `ingest_status.json` (токен из промпта вернул `403 Неверный ingest token`).
