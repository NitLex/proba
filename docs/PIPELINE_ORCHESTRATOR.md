# Оркестратор агентов (Offer → Draft)

Вкладка **Оркестратор** (`/pipeline`).
Прод-сплит: UI пайплайна на **https://orkestr.online**, клики/статы на **https://trekerarbitrag.ru**.
Подробности: [ORCHESTRATOR_SPLIT.md](./ORCHESTRATOR_SPLIT.md).
Локально / на одном VPS можно держать оба режима (`APP_MODE=full`).

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

## Креативы: Cursor-агент + референсы

Креатив-агент — арт-директор: роль по вертикали, тексты TextAd, промпты, QA.
Картинки рисует **сам агент** через GenerateImage (не YandexART / не GPT Image).

```bash
IMAGE_PROVIDER=agent
# CURSOR_API_KEY=...   # чтобы оркестратор запускал креатив-агента
# CURSOR_REPO_URL=https://github.com/NitLex/proba
```

В UI оркестратора можно приложить **референсы** (jpg/png/webp) — агент использует их как visual references.
После генерации агент грузит файлы на `POST /api/pipeline/ingest-creatives` (one-time token).
Затем в UI: «Применить креативы в Директ».

### Legacy: YandexART / GPT Image

```bash
IMAGE_PROVIDER=yandex_art
# или
IMAGE_PROVIDER=openai
OPENAI_RELAY_URL=...
```

## Секреты на VPS

### Оркестратор (orkestr.online)

```bash
APP_MODE=orchestrator
ORCHESTRATOR_PUBLIC_URL=https://orkestr.online
PIPELINE_TRACKER_MODE=remote
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
ARBTRACK_USERNAME=...
ARBTRACK_PASSWORD=...
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
LEADGID_TOKEN=...
IMAGE_PROVIDER=agent
CURSOR_API_KEY=...
CURSOR_REPO_URL=https://github.com/NitLex/proba
CURSOR_STARTING_REF=cursor/orchestrator-tab-47f8
YANDEX_CLOUD_API_KEY=...   # для Wordstat; для картинок не обязателен
YANDEX_CLOUD_FOLDER_ID=...
```

### Трекер (монолит / пока вместе)

```bash
APP_MODE=full   # или tracker после выноса оркестратора
PIPELINE_TRACKER_MODE=local
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
```

## Домен в объявлении (вместо trekerarbitrag.ru)

В превью Директ всегда показывает **хост из Href**. Подменить на `payservices.ru` нельзя «косметикой» — только если клик реально идёт через этот домен:

1. Купи/привяжи домен → DNS **A** на IP VPS  
2. Nginx: добавь `server_name payservices.ru` (+ certbot)  
3. В `.env` или в UI оркестратора: `AD_DISPLAY_DOMAIN=payservices.ru` / поле «Домен в объявлении»  
4. Пайплайн сделает Href `https://payservices.ru/click/...` и `DisplayUrlPath` (`karta/poezdki` и т.п.)

Без своего домена уже сейчас ставится смысловой **путь**: `trekerarbitrag.ru/karta/poezdki`.

## LeadGid постбэк (вручную)

Автоматом через API не ставится. Шаблон всегда в оркестраторе + после run:

```
https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}
```

LeadGid → оффер → Postback. В ссылке оффера нужен `aff_sub={clickid}`.

## UI

**Оркестратор** → `/pipeline`

1. Вставь URL оффера  
2. (опционально) доп. поля / домен в объявлении / dry-run / Cursor spawn  
3. Запуск → в конце **«Кампания готова»**  
4. Скопируй постбэк в LeadGid (блок на странице)  
5. Сам открой Директ → проверь → модерация → старт

## API

```bash
curl -s -X POST https://orkestr.online/api/pipeline/runs \
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
