# FinMi #7304 — трекинг и постбэк LeadGid

Кампания Direct: `713096941` · трекер: `#22` / key `nVwo8PuS`

## Что уже проверено (OK)

| Шаг | Результат |
|---|---|
| Direct ads | `ACCEPTED` / `ON`, href → `https://trekerarbitrag.ru/click/nVwo8PuS` |
| TrackingParams | `utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}` |
| Direct ↔ tracker | `campaigns.direct_campaign_id = 713096941` |
| Landing #7 | `https://trekerarbitrag.ru/preland/7-speed` (не 404) |
| Offer #17 | `https://fin-lg.com/aff_c?aff_id=123072&offer_id=7304&p=adnetwork&aff_sub={clickid}` |
| Цепочка | click → preland?clickid= → /to-offer → `fin-lg.com/...&aff_sub=<clickid>` → finmi.ru |
| Постбэк endpoint | HTTP 200; тестовый клик сматчился в conversion |

## Постбэк — вставь в кабинет LeadGid

LeadGid **не даёт** выставить постбэк через наш API. Скопируй URL вручную.

**URL (global / offer #7304):**

```
https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}
```

**Куда:** LeadGid → оффер **7304** (FinMi) → Postback / Instrument → Postbacks  
(или Global postback аккаунта, если так принято).

**Макросы:**

| LeadGid | ArbTrack |
|---|---|
| `{aff_sub}` | `clickid` |
| `{payout}` | `payout` |
| `{status}` | `status` (`approved` → sale) |
| `{transaction_id}` | `txid` |

**Метод:** GET (наш `/postback` принимает и POST).

**Проверка в кабинете LeadGid:** «Тест постбэка» с `aff_sub_value` должен дать HTTP 200  
(у нас специально принимается даже неизвестный clickid → 200).

Ручной тест после вставки:

```bash
curl -sS "https://trekerarbitrag.ru/postback?clickid=aff_sub_value&payout=0&status=lead&txid=leadgid_test"
# {"ok":true,...,"unmatched":true}
```

## Важно, чтобы конверсии не терялись

1. В ссылке оффера **обязательно** `aff_sub={clickid}` — уже стоит на offer #17.  
2. Не меняй постбэк на другой домен — только `trekerarbitrag.ru`.  
3. В LeadGid для цели «Выдача» / approved шлёт `status=approved` (у нас → `sale`).  
4. После добавления постбэка сделай тестовую заявку с реального клика по объявлению и сверь `txid` в трекере.

## Не трогать без нужды

- `aff_id=123072`, `offer_id=7304`
- key кампании `nVwo8PuS`
- гео с минус-регионами (СКФО / ЛНР / ДНР / …)
