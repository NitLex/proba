# Как запустить ArbTrack 24/7 на сервере (для чайника)

Нужен обычный VPS (виртуальный сервер). Подойдут Timeweb, Aeza, FirstVDS, Hetzner, Contabo и т.п.  
Минимум: **1 CPU, 1 GB RAM, Ubuntu 22.04**, около 300–500 ₽/мес.

---

## Шаг 1. Купи VPS

1. Зарегистрируйся у хостера.
2. Создай сервер:
   - ОС: **Ubuntu 22.04**
   - Тариф: самый простой
3. После создания тебе дадут:
   - **IP-адрес** (например `123.45.67.89`)
   - **логин** (обычно `root`)
   - **пароль**

Сохрани это.

---

## Шаг 2. Подключись к серверу с Windows

1. Скачай **PuTTY**: https://www.putty.org  
   или используй встроенный терминал Windows:
   ```powershell
   ssh root@123.45.67.89
   ```
   (подставь свой IP)
2. Введи пароль (при вводе символы не видны — это нормально) и нажми Enter.
3. Ты внутри сервера, если видишь что-то вроде `root@...:~#`

---

## Шаг 3. Установи Node.js и PM2

Скопируй и вставь эти команды **по очереди** на сервере:

```bash
apt update && apt upgrade -y
```

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
```

```bash
apt install -y nodejs git build-essential
```

```bash
npm install -g pm2
```

Проверка:

```bash
node -v
npm -v
pm2 -v
```

Должны показаться версии.

---

## Шаг 4. Скачай проект на сервер

```bash
cd /var/www
```

```bash
git clone -b cursor/arbitrage-tracker-binom-fa77 https://github.com/NitLex/proba.git arbtrack
```

```bash
cd arbtrack
```

---

## Шаг 5. Установи зависимости и собери сайт

```bash
npm install
npm run install:all
npm run seed --prefix server
npm run build
```

---

## Шаг 6. Запусти навсегда (24/7)

```bash
pm2 start ecosystem.config.cjs
```

```bash
pm2 save
```

```bash
pm2 startup
```

Последняя команда покажет ещё одну длинную команду — **скопируй её и выполни**.  
После этого трекер будет подниматься сам после перезагрузки сервера.

Полезные команды:

```bash
pm2 status          # статус
pm2 logs arbtrack   # логи
pm2 restart arbtrack
```

---

## Шаг 7. Открой в браузере

Пока без домена:

```
http://123.45.67.89:3001
```

(свой IP вместо примера)

Если не открывается — открой порт:

```bash
ufw allow 3001
ufw allow OpenSSH
ufw enable
```

---

## Шаг 8 (желательно). Домен + HTTPS

1. Купи домен (например `track.example.com`) и в DNS сделай **A-запись** на IP сервера.
2. На сервере:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

3. Создай конфиг:

```bash
nano /etc/nginx/sites-available/arbtrack
```

Вставь (замени домен):

```nginx
server {
    listen 80;
    server_name track.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Сохрани: `Ctrl+O`, Enter, `Ctrl+X`.

```bash
ln -s /etc/nginx/sites-available/arbtrack /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
ufw allow 'Nginx Full'
certbot --nginx -d track.example.com
```

После этого трекер будет на:

```
https://track.example.com
```

А клик-ссылка для рекламы:

```
https://track.example.com/click/ТВОЙ_KEY
```

Постбек для партнёрки:

```
https://track.example.com/postback?clickid={clickid}&payout={payout}&status={status}&txid={txid}
```

(макросы подставь те, что даёт твоя CPA-сеть)

---

## Проверка, что всё живо

```bash
pm2 status
curl http://127.0.0.1:3001/api/health
```

Открой сайт в браузере → зайди в **Кампании** → скопируй ссылку → открой в новой вкладке.  
В разделе **Клики / конверсии** должен появиться клик.

---

## Частые проблемы

| Проблема | Что делать |
|----------|------------|
| `npm: command not found` | Заново шаг 3 (установка Node) |
| Сайт не открывается по IP | Открой порт: `ufw allow 3001` |
| После перезагрузки сервер молчит | Выполни `pm2 startup` и ту команду, которую он покажет |
| Хочу обновить код | `cd /var/www/arbtrack && git pull && npm run install:all && npm run build && pm2 restart arbtrack` |
