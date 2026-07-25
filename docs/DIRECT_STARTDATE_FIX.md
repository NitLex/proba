# Fix: Direct API 5005 StartDate

## Симптом

```json
{
  "Code": 5005,
  "Message": "Поле задано неверно",
  "Details": "Значение даты в поле StartDate не может быть меньше текущей даты"
}
```

`campaigns.add` падает, черновик не создаётся.

## Причина

```js
StartDate: new Date().toISOString().slice(0, 10)  // UTC calendar day
TimeZone: 'Europe/Moscow'
```

После 00:00 МСК и до 03:00 UTC дата в ISO ещё «вчера» относительно календаря Директа → 5005.

## Исправление

`server/src/lib/directDate.js`:

```js
export function directStartDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
```

Подключено в:

1. `server/src/pipeline/agents/direct.js` (оркестратор)
2. `server/src/apply-direct-plan.js` (ручной/cloud apply)

## Черновик

Pipeline / этот агент: `state=OFF`, `moderation=DO_NOT_SUBMIT`.
Не вызывать `ads.moderate`, не `campaigns.resume` без явного флага.
