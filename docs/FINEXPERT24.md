# finexpert24.online — брендовый домен для финансов в РСЯ

Основной **отображаемый** домен финансовых офферов.  
Трекер остаётся на `trekerarbitrag.ru`, но в объявлениях Директа виден **Finexpert24**.

| | |
|---|---|
| Домен | `https://finexpert24.online` |
| DNS A | `168.222.203.142` |
| Nginx | `/etc/nginx/sites-available/finexpert24` → proxy `127.0.0.1:3001` |
| SSL | Let's Encrypt `finexpert24.online` |
| Env | `AD_DISPLAY_DOMAIN=finexpert24.online` |

## Ссылка для объявлений (FinMi / LeadGid #7304)

```
https://finexpert24.online/click/nVwo8PuS?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}
```

В объявлении будет домен **finexpert24.online**, не trekerarbitrag.ru.

Проверка:

```
https://finexpert24.online/click/nVwo8PuS
```

Должен уйти на оффер (302).

## Другие фин-кампании

Тот же хост, другой ключ кампании:

```
https://finexpert24.online/click/<KEY>?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}
```

## Что не менять

- `ARBTRACK_PUBLIC_URL=https://trekerarbitrag.ru` — кабинет, постбеки партнёрок, внутренние ссылки.
- Постбек LeadGid по-прежнему на `https://trekerarbitrag.ru/postback?...`

## Оркестратор / pipeline

При создании объявлений через API `buildAdLinkFields` подставит `AD_DISPLAY_DOMAIN` в Href.
