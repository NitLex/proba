# Безопасность: trekerarbitrag.ru / orkestr.online

## Есть сейчас

| Слой | Статус |
|---|---|
| HTTPS (Let's Encrypt) | да |
| Nginx reverse proxy | да |
| UFW (SSH + nginx) | частично (на трекере ещё открыт :3001) |
| Bot/antifraud на `/click` | да (UA + datacenter IP + частота) |
| JWT auth | да |
| Rate limit login/register | да (приложение, ~20/мин с IP) |
| Демо на orkestr / трекере | отключено |
| Регистрация на orkestr | закрыта по умолчанию при seed |

## Нет (и это важно)

| Слой | Статус |
|---|---|
| Cloudflare / внешний WAF / DDoS scrubbing | **нет** |
| fail2ban | **нет** |
| nginx `limit_req` на весь сайт | желательно включить |
| Закрытие прямого :3001 снаружи | желательно |

**Вывод:** от ботов в кликах защита есть. От полноценного DDoS / веб-сканеров — нет CDN/WAF. Для серьёзной защиты поставить домены за Cloudflare (прокси orange cloud) + закрыть 3001 в ufw.

## Рекомендация

1. Cloudflare Free на `trekerarbitrag.ru`, `orkestr.online`, `finexpert24.online`, `migrantportal.online`
2. UFW: только 22/80/443 (убрать 3001)
3. fail2ban на nginx 401/429
