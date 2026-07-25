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
| `creative` | Брифы + GPT Image: **графическое** (текст на баннере) или **товарное** (чистая картинка) |
| `tracker` | Source / offer / campaign в ArbTrack, click + postback |
| `direct` | Черновик **OFF**: ImageAd если графика, TextAd если товарное; **без модерации** |

## Формат объявлений

Параметр `ad_format`:

| Значение | Креатив | В Директе |
|----------|---------|-----------|
| `graphic` | Картинка **с надписями** оффера | `ImageAd` |
| `product` | **Чистая** картинка без текста | `TextAd` — заголовок/текст в полях |
| `auto` | По умолчанию product; если в заметках «графич/надпись» → graphic | как выше |

Правило: текст либо на креативе (графика), либо в настройках объявления (товарка) — не дублируем.

## Креативы — GPT Image API

Ключ: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)  
Документация: [Image generation](https://platform.openai.com/docs/guides/image-generation)

В `SECRETS.env` / `.env`:

```bash
IMAGE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1          # или gpt-image-2 / gpt-image-1.5
# OPENAI_IMAGE_QUALITY=medium           # low | medium | high
# OPENAI_IMAGE_SIZE=1024x1024
```

Если `OPENAI_API_KEY` задан, а `IMAGE_PROVIDER` пустой — оркестратор сам выберет `openai`.

Без ключа агент пишет image-промпты и использует готовые ассеты из `creatives/rsya/`.

> Для GPT Image иногда нужна [Organization Verification](https://platform.openai.com/settings/organization/general) в кабинете OpenAI.

## Секреты на VPS

```bash
PIPELINE_TRACKER_MODE=local
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
LEADGID_TOKEN=...
IMAGE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1
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
