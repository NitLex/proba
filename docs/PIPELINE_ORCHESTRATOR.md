# Оркестратор агентов (Offer → Launch)

Сервис принимает **вводные по офферу** и распределяет работу по агентам.

## Поток

```
Ты → POST /api/pipeline/runs (данные оффера)
        ↓
   [analyst]  анализ + похожие связки из БД
        ↓
   ┌────────────┬────────────┬────────────┐
   │ wordstat   │ creative   │ tracker    │  (параллельно)
   └────────────┴────────────┴────────────┘
        ↓
   [direct]  план РСЯ (+ опционально API)
```

| Агент | Что делает |
|-------|------------|
| `analyst` | Разбирает оффер, ищет похожие связки в `bundles`, углы, CPC, риски |
| `wordstat` | Семантика + минус-слова (эвристика; live Wordstat — по `WORDSTAT_TOKEN`) |
| `creative` | Брифы заголовков/текстов/sitelinks, список ассетов из `creatives/rsya` |
| `tracker` | Создаёт source/offer/campaign в ArbTrack, click + postback URL |
| `direct` | План кампании Директа; с `apply_direct: true` — создание через API |

Каждый шаг кладёт в output поле **`cursor_prompt`** — готовый бриф для Cursor/cloud-агента, если нужно доработать руками.

## UI

Раздел **Оркестратор** → `/pipeline`

## API

```bash
# Роли и граф
curl -s localhost:3001/api/pipeline/roles | jq

# Запуск
curl -s -X POST localhost:3001/api/pipeline/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Плати по миру",
    "url": "https://go.leadgid.ru/aff_c?aff_id=123072&offer_id=7397&aff_sub={clickid}",
    "payout": 896,
    "epc": 9.5,
    "geo": "RU",
    "vertical": "Fintech",
    "network": "LeadGid",
    "source": "Yandex Direct РСЯ",
    "daily_budget": 5000,
    "promo_code": "LG2026",
    "notes": "путешествия и зарубежные сервисы",
    "dry_run": false,
    "apply_direct": false
  }' | jq
```

Флаги:
- `dry_run: true` — не писать в трекер
- `apply_direct: true` — создать кампанию в Директе (нужны `YANDEX_DIRECT_*`)
- `async: true` — ответ 202, выполнение в фоне

## CLI

```bash
npm run pipeline --prefix server -- \
  --name "Плати по миру" \
  --url "https://go.leadgid.ru/..." \
  --payout 896 --geo RU --epc 9.5 \
  --daily-budget 5000 --promo-code LG2026
```

## Как этим пользоваться с Cursor-агентами

1. Запусти пайплайн (UI/API/CLI).
2. Открой run → у каждого шага есть `cursor_prompt`.
3. Отдай промпт нужному агенту (креатив / Директ / доработка Wordstat).
4. Оркестратор уже связал зависимости: Директ ждёт аналитика + семантику + креатив + трекер.

## Расширение

Новый агент:
1. Файл `server/src/pipeline/agents/<name>.js` с `export async function runX({ offer, context })`
2. Запись в `roles.js` + `DEFAULT_PIPELINE`
3. Хендлер в `runner.js` → `HANDLERS`

Wordstat live: добавить вызов в `agents/wordstat.js` при `WORDSTAT_TOKEN`.
