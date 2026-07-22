# ArbTrack

Полноценный арбитражный трекер в стиле [Binom](https://binom.org): кампании, офферы, лендинги, источники, клики, постбеки и статистика.

## Возможности

- **Кампании** с уникальным ключом и ссылкой `/click/:key`
- **Офферы / лендинги** с макросами `{clickid}`, `{campaign_id}`, `{token1}`…
- **Источники трафика** — маппинг токенов и параметра `cost`
- **Постбеки** `/postback?clickid=…&payout=…&status=sale`
- **Переход с лендинга** `/to-offer?clickid=…`
- **Статистика**: клики, cost, revenue, profit, ROI, CR, EPC — по кампаниям / офферам / источникам / дням
- **UI-дашборд** на React

## Авторизация

- Регистрация: `/register`
- Вход: `/login`
- Демо после `seed`: логин `demo`, пароль `demo123`
- Панель и API закрыты токеном; `/click`, `/postback`, `/to-offer` остаются публичными
- У каждого пользователя свои кампании / офферы / статистика

На проде задайте секрет:
```bash
export JWT_SECRET='длинная-случайная-строка'
```

## Быстрый старт (на своём компьютере)

```bash
npm install
npm run install:all
npm run seed --prefix server
npm run dev
```

- UI: http://localhost:5173  
- API / трекинг: http://localhost:3001  

## Запуск 24/7 на сервере (VPS)

Подробная инструкция для новичка: **[DEPLOY.md](./DEPLOY.md)**

Кратко на Ubuntu-сервере:

```bash
npm install && npm run install:all
npm run seed --prefix server
npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

После сборки UI и API работают вместе на порту **3001** (или через домен + nginx).

## Как пользоваться

1. Создайте **источник** (например Facebook) и укажите имена query-параметров для токенов.
2. Добавьте **оффер** с URL вида `https://aff.net/click?sub1={clickid}`.
3. (Опционально) добавьте **лендинг**; на кнопке CTA ведите на `/to-offer?clickid={clickid}`.
4. Создайте **кампанию** — скопируйте трекинг-ссылку.
5. В партнёрке укажите постбек:
   ```
   https://YOUR_HOST/postback?clickid={clickid}&payout={payout}&status={status}&txid={txid}
   ```

### Пример клика

```
http://localhost:3001/click/CAMPAIGN_KEY?cost=0.35&utm_campaign=lookalike
```

### Макросы

| Макрос | Описание |
|--------|----------|
| `{clickid}` / `{external_id}` | ID клика |
| `{campaign_id}` / `{campaign_name}` / `{campaign_key}` | Кампания |
| `{offer_id}` / `{offer_name}` | Оффер |
| `{cost}` `{country}` `{city}` `{device}` `{os}` `{browser}` `{ip}` | Контекст |
| `{token1}` … `{token5}` | Токены источника |

## Стек

- **Server:** Node.js, Express, better-sqlite3  
- **Client:** React 19, Vite, React Router  

## Тесты

```bash
npm test --prefix server
```
