# Яндекс.Директ — черновик РСЯ (товарное / TextAd)

План: `direct/plans/rsya-ppm-product-travel-services-sbp.json`

| Параметр | Значение |
|----------|----------|
| Формат | **product** → `TextAd` (текст в полях, чистая картинка) |
| Состояние | **OFF** (черновик) |
| Модерация | **DO_NOT_SUBMIT** — `ads.moderate` не вызываем |
| Сеть | `WB_MAXIMUM_CLICKS`, потолок **5 ₽**, неделя **35 000 ₽** |
| Гео | RU (`225`) |
| Href | `https://trekerarbitrag.ru/click/DBSKE5N0` |
| Neuro / Direct Helps | **OFF** |

## Баг StartDate (API 5005)

Ошибка: *«Значение даты в поле StartDate не может быть меньше текущей даты»*.

Причина: `new Date().toISOString().slice(0, 10)` даёт **UTC**, а `TimeZone: Europe/Moscow`.
После полуночи МСК UTC ещё «вчера» → Direct отвергает кампанию.

Фикс: `server/src/lib/directDate.js` → `directStartDate()` (календарь Москвы).
Используется в:

- `server/src/apply-direct-plan.js`
- `server/src/pipeline/agents/direct.js`

## Секреты

```env
YANDEX_DIRECT_TOKEN=y0__...
YANDEX_DIRECT_LOGIN=nitkinaleksandr
```

Файл `SECRETS.env` в корне (в git не попадает). Cloud-агенты Cursor **не получают** секреты автоматически.

## Запуск

```bash
# проверка без записи (StartDate MSK в preview)
npm run apply:direct:dry

# создать черновик OFF: кампания + группы + ключи + TextAd + картинки + bid modifiers
# БЕЗ ads.moderate и БЕЗ resume
npm run apply:direct

# явный путь к плану
npm run apply:direct -- direct/plans/rsya-ppm-product-travel-services-sbp.json
```

Результат: `direct/apply-results/latest.json`.

Опционально (только вручную, не для pipeline):

```bash
npm run apply:direct -- --submit-moderation   # отправить на модерацию
npm run apply:direct -- --submit-moderation --resume   # + включить после ACCEPTED
```

## Креативы

`creatives/rsya/direct-textad/` — квадрат 1080×1080 JPEG для товарных TextAd.

## После apply

1. Открой Директ → проверь объявления / картинки / ключи  
2. Сам отправь на модерацию и запусти показы  
3. Neuro Ads / авторекомендации не включать  
