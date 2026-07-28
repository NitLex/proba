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
# robots/sitemap при необходимости:
# scp prelands/migrantportal-robots.txt root@...:/var/www/migrantportal/robots.txt
```

После правки `index.html` на сервере проверь canonical → `https://migrantportal.online/`.

## DNS

NS SpaceWeb. A `@` и `www` → `168.222.203.142`.
