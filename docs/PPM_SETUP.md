# Связка LeadGid × ArbTrack × РСЯ (Плати по миру)

## 1. Секреты

```bash
cp .env.example .env
# заполни LEADGID_TOKEN и ARBTRACK_PUBLIC_URL
```

В Cloud Agent файл `.env` должен лежать **в корне `/workspace/.env`** (не только на локальном Mac/ПК).

Проверка LeadGid:
```bash
npm run check:leadgid --prefix server
```

## 2. Создать кампанию в трекере

```bash
npm run setup:ppm --prefix server
```

Скрипт создаст:
- источник **Yandex Direct РСЯ**
- оффер LeadGid #7397 (payout первая карта / премиум)
- лендинг-заглушку
- кампанию с ключом `/click/:key`
- связку в разделе UI «Связки»

## 3. Постбек LeadGid → ArbTrack

В кабинете LeadGid (оффер/поток) укажи URL вида:

```
https://ТВОЙ_ТРЕКЕР/postback?clickid={SUB1}&payout={PAYOUT}&status={STATUS}&txid={ID}
```

В партнёрской ссылке LeadGid параметр для sub1 должен получать `{clickid}` из ArbTrack.

Статусы, которые ArbTrack понимает: `sale`, `approved`, `lead`, `rejected`, `hold`.

## 4. Креативы РСЯ

Уже в репо:
- `creatives/rsya/ppm-rsya-travel-premium-v2.zip`
- `creatives/rsya/ppm-rsya-services-premium-v3.zip`

## 5. Яндекс.Директ

**Пока API не одобрен (ошибка 58)** — запуск вручную:
см. пошагово [`docs/DIRECT_MANUAL_PPM.md`](./DIRECT_MANUAL_PPM.md).

Ссылка для объявлений РСЯ:
```
https://trekerarbitrag.ru/click/0BL6esOO?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}
```

Когда заявку на API одобрят — можно создавать кампании через API (`YANDEX_DIRECT_TOKEN` / `YANDEX_DIRECT_LOGIN` уже в `SECRETS.env`).

## Ориентиры экономики (#7397)

| Цель | Payout |
|------|--------|
| Первая карта | ~896 ₽ |
| Премиум | ~2388 ₽ |
| EPC сети | ~8.5 ₽ |

Стартовый CPC тест: **4–7 ₽**, гео **RU**, бюджет **3–5к ₽/день**.
