# Разделение: оркестратор (orkestr.online) ↔ трекер (trekerarbitrag.ru)

Один и тот же репозиторий, два режима через `APP_MODE`.

| Хост | IP (SpaceWeb) | `APP_MODE` | Роль |
|------|---------------|------------|------|
| https://orkestr.online | `168.222.141.219` | `orchestrator` | Pipeline UI/API, Direct/LeadGid/Cursor, креативы |
| https://trekerarbitrag.ru | `168.222.203.142` | `tracker` (или `full`) | Клики, постбэки, преленды, статистика |

## Схема

```
Оператор → orkestr.online /pipeline
              │
              ├─ analyst / wordstat / creative / direct / qa  (локально на оркестраторе)
              │
              └─ tracker-agent ──remote──► trekerarbitrag.ru API
                                              │
Реклама / LeadGid клики ─────────────────────► /click /postback
```

Клики в объявлениях **всегда** ведут на трекер (`ARBTRACK_PUBLIC_URL`), не на оркестратор.

## Env на оркестраторе

```bash
APP_MODE=orchestrator
ORCHESTRATOR_PUBLIC_URL=https://orkestr.online
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
PIPELINE_TRACKER_MODE=remote
ARBTRACK_USERNAME=sayx
ARBTRACK_PASSWORD=...

# API keys (Direct / LeadGid / Cursor / Wordstat)
YANDEX_DIRECT_TOKEN=...
YANDEX_DIRECT_LOGIN=...
LEADGID_TOKEN=...
CURSOR_API_KEY=...
CURSOR_REPO_URL=https://github.com/NitLex/proba
CURSOR_STARTING_REF=cursor/orchestrator-tab-47f8
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER_ID=...
IMAGE_PROVIDER=agent
PORT=3001
```

## Env на трекере

```bash
APP_MODE=tracker
ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru
ORCHESTRATOR_PUBLIC_URL=https://orkestr.online
PIPELINE_TRACKER_MODE=local
# Direct/Cursor на трекере не обязательны
PORT=3001
```

`APP_MODE=tracker` отключает `/api/pipeline` на трекере. Пока оркестратор не поднят, можно оставить `full`.

## Деплой оркестратора

1. DNS: `orkestr.online` **A** → `168.222.141.219` (и при желании `www`)
2. На VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/NitLex/proba/cursor/orchestrator-tab-47f8/deploy-orchestrator.sh | bash
# или после git clone:
bash deploy-orchestrator.sh
```

3. Положи секреты в `/var/www/orkestr/SECRETS.env` (или `.env`)
4. `pm2 restart orkestr`
5. Проверка: `curl -s https://orkestr.online/api/health` → `"mode":"orchestrator"`

Обновление:

```bash
cd /var/www/orkestr && bash update-orchestrator.sh
```

## Что блокируется

- На оркестраторе: `/click`, `/postback`, `/to-offer`, `/preland/*` → 404 + ссылка на трекер
- На трекере (`APP_MODE=tracker`): `/api/pipeline/*` → 404 + ссылка на оркестратор
- UI: на оркестраторе видны только Оркестратор + Профиль; на трекере вкладка Оркестратор скрыта

## Аккаунты

Оркестратор и трекер — **разные SQLite БД**. Зарегистрируй/`seed` пользователя на оркестраторе отдельно.  
`ARBTRACK_USERNAME` / `ARBTRACK_PASSWORD` — логин **на трекере**, которым pipeline remote API создаёт офферы/кампании.
