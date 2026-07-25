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

### Рекомендуемо на RU VPS: YandexART
OpenAI GPT Image с российского IP отвечает `Country, region, or territory not supported`.
На VPS используем **YandexART** (те же `YANDEX_CLOUD_API_KEY` + `YANDEX_CLOUD_FOLDER_ID`, что Wordstat).

```bash
IMAGE_PROVIDER=yandex_art
# уже должны быть:
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
```

`IMAGE_PROVIDER=auto` (по умолчанию) сам выберет YandexART, если cloud-ключи есть.

### Опционально: GPT Image через прокси
```bash
IMAGE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_HTTP_PROXY=http://user:pass@HOST:PORT   # EU/US HTTP(S) proxy
```

Если OpenAI вернул geo-ошибку, а YandexART настроен — будет **авто-fallback** на YandexART.

## Секреты на VPS

```bash
PIPELINE_TRACKER_MODE=local
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
LEADGID_TOKEN=...
IMAGE_PROVIDER=yandex_art
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
