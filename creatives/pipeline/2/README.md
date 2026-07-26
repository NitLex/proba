# Pipeline run 2 — РСЯ креативы (product / agent)

Движок: **Cursor креатив-агент** (`GenerateImage`), без YandexART / GPT Image.

## Файлы

| Файл | Назначение |
|------|------------|
| `generic-agent-0.png` / `.jpg` | Угол `generic`, вариант 0 — тёмная blank-карта |
| `generic-agent-1.png` / `.jpg` | Угол `generic`, вариант 1 — светлая blank-карта + золотой торец |
| `TEXTAD_PRODUCT.json` | Title/Text для TextAd (≤56 / ≤81) |
| `manifest.json` | Полный манифест креативов |
| `upload_ingest.py` | Повторная загрузка на оркестратор |

## Тексты (обязательная фраза)

Во всех Title/Text есть **«зарубежная карта»** / **«выпуск зарубежной карты»**.

## Ingest

```bash
python3 upload_ingest.py --prefer-jpeg
```

`POST https://orkestr.online/api/pipeline/ingest-creatives`  
`run_id=2`, token из шага pipeline.

Если API отвечает `{"error":"Run not found"}` — прогон на оркестраторе ещё не создан/уже удалён; локальные ассеты готовы, повторите `upload_ingest.py` когда run активен.
