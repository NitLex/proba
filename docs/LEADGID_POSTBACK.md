# LeadGid ↔ ArbTrack (trekerarbitrag.ru)

## Кампания
- Ключ: `0BL6esOO`
- Клик для РСЯ:
  `https://trekerarbitrag.ru/click/0BL6esOO?cost={cost}&utm_campaign={campaign_id}&utm_content={ad_id}`

## Оффер LeadGid
```
https://go.leadgid.ru/aff_c?aff_id=123072&offer_id=7397&p=adnetwork&aff_sub={clickid}&aff_sub2={campaign_id}&aff_sub3={token1}
```
`aff_sub` = clickid трекера.

## Постбек (вставь в LeadGid)
В кабинете LeadGid → оффер/поток → Postback / Глобальный постбек:

```
https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}
```

Если макросы в LeadGid называются иначе — сопоставь:
| ArbTrack | LeadGid (типично) |
|----------|-------------------|
| clickid  | `{aff_sub}` или `{sub1}` |
| payout   | `{payout}` / `{sum}` / `{amount}` |
| status   | `{status}` / `{goal_name}` |
| txid     | `{transaction_id}` / `{id}` |

Статусы, которые трекер понимает как sale: `sale`, `approved`, `approve`, `confirmed`, `paid`.

## Проверка
1. Открой клик-ссылку в браузере → должен редирект на go.leadgid.ru
2. В LeadGid дождись тестовой/реальной конверсии или дерни постбек вручную
3. В трекере: Клики / конверсии → виден sale и payout

## Тест постбека в LeadGid
Тестер LeadGid подставляет `clickid=aff_sub_value` (фейковый). Трекер должен отвечать **HTTP 200** даже если клика нет (`unmatched: true`).
Если видишь 404 — на сервере старая версия postback, нужен деплой фикса.
