# Яндекс.Директ — draft apply РСЯ (Плати по миру)

Черновик кампании из JSON-плана через API v5. **Без модерации и без показов** по умолчанию.

## План

`direct/plans/rsya-ppm-travel-services-sbp-product.json`

| Параметр | Значение |
|----------|----------|
| Формат | товарное → **TextAd** (текст в полях) |
| Сеть | network-only, `WB_MAXIMUM_CLICKS` |
| Потолок / неделя | **5 ₽** / **35 000 ₽** |
| Гео | RU (`225`) |
| Href | `https://trekerarbitrag.ru/click/DBSKE5N0` |
| State | **OFF** |
| Модерация | **DO_NOT_SUBMIT** |
| Neuro Ads | **OFF** |
| Группы | Travel / Services / СБП |

Квадратные креативы 1080×1080: `creatives/rsya/direct-textad/`.

## Фикс StartDate (API 5005)

`StartDate` считается как **календарный день `Europe/Moscow`**, не UTC:

```js
// плохо — после 21:00 UTC дата «вчера» для Москвы → Code 5005
new Date().toISOString().slice(0, 10)

// правильно
moscowStartDate() // server/src/lib/directDate.js
```

Оркестраторный агент `pipeline/agents/direct.js` должен использовать тот же хелпер.

## Секреты

В корне репо `SECRETS.env` (в git не попадает):

```env
YANDEX_DIRECT_TOKEN=y0__...
YANDEX_DIRECT_LOGIN=nitkinaleksandr
```

Cloud-агенты Cursor **не получают** локальный `SECRETS.env` — live apply запускай на машине оркестратора.

## Запуск

```bash
# проверка без записи в кабинет
npm run apply:direct:dry

# создать черновик OFF (группы, ключи, TextAd, картинки, bid modifiers)
# НЕ вызывает ads.moderate и НЕ resume
npm run apply:direct

# только если явно нужно (не для пайплайна «direct»)
npm run apply:direct -- --moderate
npm run apply:direct -- --campaign-id=ID --resume
```

Результат: `direct/apply-results/latest.json` и `STATUS.json`.

## После создания черновика

1. Открой Директ → проверь объявления и креативы  
2. Отправь на модерацию вручную  
3. Включи показы сам  
4. Neuro Ads / авторекомендации не включать  
