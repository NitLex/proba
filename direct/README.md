# Яндекс.Директ — apply РСЯ плана

Полный apply кампании из JSON-плана через API v5 (не только shell).

## План этой связки

`direct/plans/rsya-kredit365-premium-travel-services.json`

- Network-only, `WB_MAXIMUM_CLICKS`, потолок **10.2 ₽**, неделя **35 000 ₽**
- Гео RU (`225`)
- Href: `https://trekerarbitrag.ru/click/9oXIbDTD`
- Neuro Ads / авторекомендации: **OFF**
- 3 группы: Премиум / Путешествия / Сервисы
- Квадратные креативы 1080×1080: `creatives/rsya/direct-textad/`

## Секреты

В корне репо создай `SECRETS.env` (в git не попадает):

```env
YANDEX_DIRECT_TOKEN=y0__...
YANDEX_DIRECT_LOGIN=nitkinaleksandr
```

Cloud-агенты Cursor **не получают** локальный `SECRETS.env` автоматически — apply нужно запускать там, где лежит токен (локальный оркестратор / машина с секретами).

## Запуск

```bash
# проверка без записи в кабинет
npm run apply:direct:dry

# создать кампанию + группы + ключи + объявления + картинки + bid modifiers + moderate
npm run apply:direct

# то же + poll модерации и resume при ACCEPTED
npm run apply:direct:resume
```

Результат: `direct/apply-results/latest.json`.

## После модерации

Если кампания в `ACCEPTED` / `OFF`:

```bash
npm run apply:direct -- --campaign-id=ID --resume
```

Либо в UI Директа: включить показы. Neuro Ads не включать.
