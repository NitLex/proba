# РСЯ креативы (pipeline run 2)

Арт-директорский пакет для Яндекс.Директ РСЯ, формат **product** (чистая картинка без текста на баннере).

## Угол `generic` — Основной угол

| Файл | Хук |
|------|-----|
| `rsya/2/generic-agent-0.png` | Матовая blank-карта, cool/warm rim light |
| `rsya/2/generic-agent-1.png` | Frosted ice-white blank-карта |
| `rsya/2/generic-agent-2.png` | Satin black metal blank-карта, amber rim |

Размер: **1024×1024**, движок: **Cursor GenerateImage** (без YandexART/GPT).

Локальный путь пайплайна (gitignore): `pipeline/2/<angle_id>-agent-N.png`.

## Тексты Direct (Title ≤56 / Text ≤81)

Обязательный маркер лицензии: **«зарубежная карта» / «выпуск зарубежной карты»**.

**Titles**

1. Выпуск зарубежной карты  
2. Зарубежная карта онлайн  
3. Оформить зарубежную карту  

**Texts**

1. Выпуск зарубежной карты. Заявка онлайн.  
2. Зарубежная карта. Оформление заявки онлайн.  
3. Выпуск зарубежной карты без очередей.  

Полный манифест: [`run-2-ads.json`](./run-2-ads.json).

## Ингест в оркестратор

```bash
python3 creatives/ingest_run2.py
```

`POST https://orkestr.online/api/pipeline/ingest-creatives` с `run_id`, `token` и base64 PNG.
