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
   [qa]  smoke: click / bots / postback / Direct draft
        ↓
   «Кампания готова» + отчёт QA — запуск вручную
```

| Агент | Что делает |
|-------|------------|
| `analyst` | Глобальный разбор: LeadGid, Wordstat, playbooks по вертикали |
| `wordstat` | Live Wordstat или эвристика + минус-слова |
| `creative` | Брифы + GPT Image: **графическое** (текст на баннере) или **товарное** (чистая картинка) |
| `tracker` | Source / offer / campaign в ArbTrack, click + postback |
| `direct` | Черновик **OFF** + handbook из [справки Директа](https://yandex.ru/support/direct/ru/); ImageAd/TextAd; **без авто-модерации** |
| `qa` | Smoke: click `302`, YandexBot/YaDirectFetcher не `403`, редирект на оффер, шаблон postback, кампания Директа |

## «Обучение» Директ-агента

Это **не fine-tune модели**, а knowledge-pack:

- файл `server/src/pipeline/knowledge/direct-handbook.js`
- правила из официальной справки + жёсткие правила оркестратора
- план кампании, чеклист оператора и Cursor-промпт строятся с опорой на handbook

Сейчас в handbook уже есть блоки:
- корректировки ставок (возраст/mobile, −100%…+1200%)
- минус-площадки (лимит 1000, чистка на 2–3 день)
- требования к текстам/картинкам/лендингу
- документы для фин/платёжных тематик (в т.ч. платежные системы)

Расширять — дописывай правила в `direct-handbook.js`. Полный автопарсинг всего `support/direct` не нужен.

## Формат объявлений

Параметр `ad_format`:

| Значение | Креатив | В Директе |
|----------|---------|-----------|
| `graphic` | Картинка **с надписями** оффера | `ImageAd` |
| `product` | **Чистая** картинка без текста | `TextAd` — заголовок/текст в полях |
| `auto` | По умолчанию product; если в заметках «графич/надпись» → graphic | как выше |

Правило: текст либо на креативе (графика), либо в настройках объявления (товарка) — не дублируем.

## Креативы

### Рекомендуемо: GPT Image (оплаченный OpenAI)
С российского IP OpenAI отвечает `Country, region, or territory not supported`.
Решение — **OPENAI_RELAY_URL** на не-RU хосте (ключ OpenAI не светится через чужие free-proxy).

```bash
# 1) на не-RU машине / Cloudflare Worker:
OPENAI_API_KEY=sk-...
OPENAI_RELAY_SECRET=long-random
node scripts/openai-image-relay-server.mjs
# или: scripts/openai-image-relay-worker.js → wrangler deploy

# 2) на RU VPS:
IMAGE_PROVIDER=openai
OPENAI_RELAY_URL=http://127.0.0.1:8787   # или https://xxx.workers.dev
OPENAI_RELAY_SECRET=long-random
# OPENAI_API_KEY на VPS не обязателен, если ключ только в relay
```

Альтернатива: личный `OPENAI_HTTP_PROXY` (EU/US) + `undici` на VPS.

Тихий откат на YandexART **выключен** (YandexART часто даёт «иероглифы»).
Включить только явно: `OPENAI_ALLOW_YANDEX_FALLBACK=1`.

### Запасной: YandexART
```bash
IMAGE_PROVIDER=yandex_art
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
```

`IMAGE_PROVIDER=auto` выберет YandexART, если cloud-ключи есть.

## Секреты на VPS

```bash
PIPELINE_TRACKER_MODE=local
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
LEADGID_TOKEN=...
IMAGE_PROVIDER=openai
OPENAI_RELAY_URL=http://127.0.0.1:8787
OPENAI_RELAY_SECRET=...
# OPENAI_API_KEY=...  # можно только в relay
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
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
