# ArbTrack — порядок и roadmap (trekerarbitrag.ru)

Цель: удобный трекер для одного / небольшой команды.  
Не клон Keitaro, а ядро с минимумом кликов + сильной аналитикой + модульным наращиванием.

## Что уже есть (не переписывать)

| Модуль | Статус |
|---|---|
| Dashboard | Есть (углубляем) |
| Campaigns + paths/rules/weights | Есть |
| Offers / Landings / Sources | CRUD есть |
| Stats (кампании/офферы/источники/дни/токены) | Есть |
| Click + Conversion log | Есть (фильтры — в работе) |
| Track `/click/:key` + `/postback` | Прод |
| Auth (JWT, multi-user) | Есть |
| Antifraud (базовый bot-flag) | Есть |
| Bundles + Pipeline | Отдельный продукт (`orkestr.online`) |

## Где поправить исходное ТЗ

1. **Не 20 модулей в v1.** Раздельные GEO / Device / Browser / SubID страницы = дубль одного **Analytics-конструктора**. Один экран отчётов с группировками выгоднее пяти почти одинаковых.
2. **Sources ≠ API Facebook/TikTok в первой очереди.** Сначала: расходы (cost param / CPC), токены, исходящий postback в кабинет источника. Полные API-интеграции — плагины.
3. **Smart Rules ≠ только «если ROI < −30% pause».** У нас уже есть **routing rules** (GEO/device/tokens → path). Автопауза по ROI — второй тип rules (optimization). Не смешивать в одном UI без нужды.
4. **Rotator уже в Campaigns** (веса paths/offers). Отдельный модуль «Ротация» на старте не нужен.
5. **Домены / CDN / мультисервер / ML-антифрод** — правильно отложить.
6. **Роли Admin/Buyer/Analyst** — полезно, но после стабилизации логов и алертов: сейчас хватает owner + JWT isolation.
7. **Виджеты drag-and-drop на Dashboard** — приятно, но медленнее, чем фиксированный «боевой» экран с датами и алертами. Сначала метрики и предупреждения, потом кастомизация.
8. **Главный KPI-день = «сегодня» + быстрые пресеты 7/30**, не только «последние 7 дней без выбора».

## MVP «в порядке» (целевое ядро)

1. Dashboard  
2. Campaigns  
3. Sources  
4. Offers  
5. Landings  
6. Click Log  
7. Conversion Log  
8. Analytics (единый Stats)  
9. Smart Rules (routing уже; optimization alerts — next)  
10. API (track/postback) + Notifications  

## Очередь работ

### Phase A — скорость байера (сейчас)
- Dashboard: период, Today/7d/30d, Profit/ROI/EPC/CPA, топ, последние конверсии, простые алерты  
- Stats: колонка CPA  
- Logs: даты, поиск, refresh, лимит  

### Phase B — доверие к цифрам
- `path_id` / `rule_id` на клике → отчёт by-path  
- Исходящий `postback_url` источника при конверсии  
- CPA / EPC везде единообразно  

### Phase C — алерты
- Telegram: 0 конверсий при N кликах, ROI < порога, домен/SSL later  

### Phase D — плагины
- API источников, GEO-карта, глубокий antifraud, командные роли  

## Принцип

Ядро лёгкое. Новые фичи — модули/плагины без переписывания track/postback.
