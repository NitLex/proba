# Оркестратор агентов (Offer → Launch)

Сервис принимает **вводные по офферу** и распределяет работу по агентам.
Поддерживает **live Wordstat** и **автозапуск Cursor Cloud Agents**.

## Поток

```
Ты → POST /api/pipeline/runs (данные оффера)
        ↓
   [analyst]  анализ + похожие связки из БД
        ↓
   ┌────────────┬────────────┬────────────┐
   │ wordstat   │ creative   │ tracker    │  (параллельно)
   │ (live API) │            │            │
   └────────────┴────────────┴────────────┘
        ↓
   [direct]  план РСЯ (+ опционально API)
        ↓
   [Cursor spawn]  cloud-агенты по cursor_prompt
        (wordstat / creative / direct)
```

| Агент | Что делает |
|-------|------------|
| `analyst` | Разбирает оффер, ищет похожие связки в `bundles`, углы, CPC, риски |
| `wordstat` | Live Wordstat (Yandex Cloud) или эвристика + минус-слова |
| `creative` | Брифы заголовков/текстов/sitelinks, список ассетов из `creatives/rsya` |
| `tracker` | Создаёт source/offer/campaign в ArbTrack, click + postback URL |
| `direct` | План кампании Директа; с `apply_direct: true` — создание через API |

Каждый шаг кладёт в output поле **`cursor_prompt`**. При `spawn_cursor_agents: true` оркестратор сам дергает Cursor API и запускает cloud-агентов.

## Секреты

В `SECRETS.env` / `.env`:

```bash
# Live Wordstat — Yandex Cloud Search API v2
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...

# Cursor Cloud Agents
CURSOR_API_KEY=...          # Dashboard → API Keys / Cloud Agents
CURSOR_REPO_URL=https://github.com/NitLex/proba
CURSOR_STARTING_REF=main
CURSOR_AUTO_CREATE_PR=false
```

Ключ Wordstat: [Yandex Cloud Search API / AI Studio](https://yandex.cloud/docs/search-api/concepts/wordstat)  
Ключ Cursor: [Dashboard → API Keys](https://cursor.com/dashboard/api) (для POST `/v0/agents` иногда нужен ключ из вкладки Cloud Agents).

## UI

Раздел **Оркестратор** → `/pipeline`

- Статус интеграций Wordstat / Cursor
- Чекбокс «Автозапуск Cursor-субагентов»
- Кнопка **Spawn Cursor** на готовом run

## API

```bash
# Роли + статус интеграций
curl -s localhost:3001/api/pipeline/roles | jq .integrations

# Запуск с live Wordstat + spawn Cursor
curl -s -X POST localhost:3001/api/pipeline/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Плати по миру",
    "url": "https://go.leadgid.ru/aff_c?aff_id=123072&offer_id=7397&aff_sub={clickid}",
    "payout": 896,
    "epc": 9.5,
    "geo": "RU",
    "vertical": "Fintech",
    "source": "Yandex Direct РСЯ",
    "daily_budget": 5000,
    "promo_code": "LG2026",
    "notes": "путешествия и зарубежные сервисы",
    "spawn_cursor_agents": true,
    "cursor_agents": ["creative", "direct", "wordstat"]
  }' | jq

# Повторный spawn для существующего run
curl -s -X POST localhost:3001/api/pipeline/runs/1/spawn-cursor | jq
```

Флаги:
- `dry_run: true` — не писать в трекер
- `apply_direct: true` — создать кампанию в Директе
- `spawn_cursor_agents: true` — запустить Cursor cloud agents
- `cursor_agents: ["creative","direct"]` — кого именно спавнить (по умолчанию wordstat/creative/direct)
- `async: true` — ответ 202, исполнение в фоне

## CLI

```bash
npm run pipeline --prefix server -- \
  --name "Плати по миру" \
  --url "https://go.leadgid.ru/..." \
  --payout 896 --geo RU --epc 9.5 \
  --spawn-cursor
```

## Как устроен Wordstat live

1. Берёт seeds из углов аналитика  
2. Для каждого seed → `POST .../v2/wordstat/topRequests`  
3. Собирает `results` + `associations` с частотностью  
4. Кластеризует в группы travel/services/premium  

Если ключей нет — fallback на эвристику (пайплайн не падает).

## Как устроен spawn Cursor

1. После успешного run выбираются шаги `wordstat` / `creative` / `direct`  
2. В Cursor API уходит `cursor_prompt` + JSON контекста шага  
3. Ответ: `agent_id` + `url` → пишется в `context.cursor_launches` и в output шага  

API: `POST https://api.cursor.com/v1/agents` (fallback `/v0/agents`).

## Расширение

Новый агент:
1. `server/src/pipeline/agents/<name>.js`
2. Запись в `roles.js` + `DEFAULT_PIPELINE`
3. Хендлер в `runner.js` → `HANDLERS`
4. При необходимости добавь id в `DEFAULT_CURSOR_SPAWN_AGENTS`
