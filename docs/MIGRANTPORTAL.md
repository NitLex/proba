# migrantportal.online

SEO-лендинг «Документы для иностранных граждан» на отдельном домене.

- **URL:** https://migrantportal.online/
- **VPS:** `168.222.203.142` (тот же, что `trekerarbitrag.ru`)
- **Web root:** `/var/www/migrantportal`
- **Nginx:** `/etc/nginx/sites-available/migrantportal`
- **SSL:** Let's Encrypt `migrantportal.online` (+ `www`)
- **CTA:** `https://trekerarbitrag.ru/click/nVwo8PuS`

## Обновить контент

Из репо:

```bash
rsync -avz prelands/finmi-docs-inostrancam.html root@168.222.203.142:/var/www/migrantportal/index.html
rsync -avz prelands/assets/svoy-chelovek-*.jpg root@168.222.203.142:/var/www/migrantportal/assets/
rsync -avz prelands/favicon.ico prelands/favicon.svg prelands/apple-touch-icon.png \
  root@168.222.203.142:/var/www/migrantportal/
scp prelands/migrantportal-robots.txt root@168.222.203.142:/var/www/migrantportal/robots.txt
scp prelands/migrantportal-sitemap.xml root@168.222.203.142:/var/www/migrantportal/sitemap.xml
```

После правки `index.html` на сервере проверь:
- canonical → `https://migrantportal.online/`
- `https://migrantportal.online/favicon.ico` → 200
- `https://migrantportal.online/sitemap.xml` → 200
- в Яндекс.Вебмастере: **Индексирование → Файлы Sitemap → добавить** `https://migrantportal.online/sitemap.xml`
  (запись в `robots.txt` есть, но Яндекс часто ждёт ручного добавления).

## DNS

NS SpaceWeb. A `@` и `www` → `168.222.203.142`.
