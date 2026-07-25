# Оркестратор агентов (Offer → Draft)

Вкладка **Оркестратор** на https://trekerarbitrag.ru (`/pipeline`).
Существующий трекер (кампании, офферы, клики) не ломаем — оркестратор добавлен отдельно.

Ключи API лежат на сервере (`SECRETS.env` / `.env`) — в UI их вводить не нужно.

## Поток

```
Ты → ссылка на оффер → POST /api/pipeline/runs
        ↓
   [analyst]  LeadGid / Wordstat / market playbooks
        ↓
   ┌────────────┬────────────┬────────────┐
   │ wordstat   │ creative   │ tracker    │  (параллельно)
   │            │ (+ images) │            │
   └────────────┴────────────┴────────────┘
        ↓
   [direct]  план РСЯ + черновик OFF (без ads.moderate)
        ↓
   Сообщение: «Кампания готова» — запуск вручную
```

| Агент | Что делает |
|-------|------------|
| `analyst` | Глобальный разбор: LeadGid, Wordstat, playbooks по вертикали |
| `wordstat` | Live Wordstat или эвристика + минус-слова |
| `creative` | Брифы + опциональная генерация картинок (OpenAI / Replicate / Midjourney via UseAPI) |
| `tracker` | Source / offer / campaign в ArbTrack, click + postback |
| `direct` | План + создание кампании **OFF**, **без модерации** |

## Креативы (Midjourney-уровень)

В `.env`:

```bash
# Вариант A — Midjourney через UseAPI.net
IMAGE_PROVIDER=useapi_mj
USEAPI_TOKEN=...
# USEAPI_DISCORD_CHANNEL=...

# Вариант B — OpenAI DALL·E
IMAGE_PROVIDER=openai
OPENAI_API_KEY=...

# Вариант C — Replicate FLUX
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=...
```

Без ключа агент всё равно пишет сильные image-промпты и использует готовые ассеты из `creatives/rsya/`.

## Секреты на VPS

```bash
PIPELINE_TRACKER_MODE=local
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
LEADGID_TOKEN=...
IMAGE_PROVIDER=none   # или useapi_mj / openai / replicate
```

## UI

**Оркестратор** → `/pipeline`

1. Вставь URL оффера  
2. (опционально) доп. поля / dry-run / Cursor spawn  
3. Запуск → в конце **«Кампания готова»**  
4. Сам открой Директ → проверь → модерация → старт

## API

```bash
curl -s -X POST https://trekerarbitrag.ru/api/pipeline/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://go.leadgid.ru/aff_c?offer_id=7397&aff_sub={clickid}",
    "apply_direct": true
  }'
```

Флаги:
- `dry_run: true` — не писать в трекер
- `apply_direct: true` (по умолчанию, если есть токен Директа) — создать **черновик OFF**, не модерировать
- `spawn_cursor_agents: true` — Cursor cloud agents
- `async: true` — ответ 202
