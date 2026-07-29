# Метрика ↔ Директ для кампании 713057647 (Плати по миру)

## Диагноз (как было)

| Звено | Статус |
|---|---|
| Direct `#713057647` | `CounterIds=null`, `ADD_METRICA_TAG=NO` |
| Click `https://trekerarbitrag.ru/click/9dJYdFd5` | сразу 302 на LeadGid — **нет страницы со счётчиком** |
| finexpert24.online | только display domain, трафик клика туда не шёл |
| Цели | нет |

Без страницы со счётчиком Метрика «не видит» визиты, Директ не показывает конверсии.

## Целевая схема (оплата за CTA)

```
Директ (yclid)
  → https://finexpert24.online/karta/abroad?...&yclid=…
  → преленд (Метрика pageview)
  → клик «Выпустить карту» → reachGoal(soft_lead)  ← сюда PAY_FOR_CONVERSION
  → /click/9dJYdFd5?nometrika=1 → LeadGid
```

Цель `soft_lead` (ID 590344795) бьётся **только** по кнопке «Выпустить карту», не при каждом заходе.

## Что сделать вручную в Метрике (1 раз)

1. Открой [Метрику](https://metrika.yandex.ru/) под логином `nitkinaleksandr`.
2. **Добавить счётчик**:
   - Адрес сайта: `finexpert24.online`
   - Доп. адреса: `trekerarbitrag.ru`, `www.finexpert24.online`
   - Часовой пояс: Москва
3. Создай цели:
   - **JavaScript-событие** название `soft_lead`, идентификатор **`soft_lead`**, условие **совпадает**
     (числовой ID цели в кабинете: **590344795** — его ставим в Direct PriorityGoals)
   - Позже hard: оффлайн-конверсия / постбек (выдача карты) — когда пойдёт объём
4. Скопируй **номер счётчика** (цифры в шапке счётчика, обычно 7–9 знаков).

Уже зафиксировано:
- soft goal JS identifier: `soft_lead`
- soft goal id (Direct PriorityGoals): `590344795`

## Привязка (мы / скрипт)

На машине с `SECRETS.env`:

```bash
# 1) в SECRETS.env на трекере:
# YANDEX_METRIKA_COUNTER_ID=XXXXXXXX
# YANDEX_METRIKA_SOFT_GOAL_NAME=soft_lead

# 2) связать кампанию в Директе + Href на finexpert24
node scripts/link-direct-metrika.mjs \
  --campaign 713057647 \
  --counter XXXXXXXX \
  --href-host finexpert24.online
```

Скрипт ставит:
- `CounterIds`
- `ADD_METRICA_TAG=YES` (в ссылку попадёт `yclid`)
- опционально `PriorityGoals`
- переписывает Href объявлений на `finexpert24.online/click/...`

## Код трекера

Если задан `YANDEX_METRIKA_COUNTER_ID`, `/click/:key` отдаёт короткий HTML с Метрикой и редиректит на оффер (модераторским ботам — по-прежнему чистый 302).

Проверка:

```bash
curl -sL 'https://finexpert24.online/click/9dJYdFd5?yclid=test123' | head
# должен быть tag.js / ym(COUNTER
```

В кабинете Метрики → «Онлайн» должен появиться визит после тестового клика из Директа (или с `yclid`).

## Где смотреть «везде»

| Место | Что увидеть |
|---|---|
| Метрика → Отчёты → Источники → Директ | визиты / `yclid` |
| Метрика → Конверсии | `soft_lead` |
| Директ → кампания → статистика по целям | после привязки счётчика и накопления |
| Директ → параметры кампании | счётчик в списке |

Оплату за конверсии **не** включаем, пока нет ≥40 soft или ≥25 hard / неделю.
