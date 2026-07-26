# Pipeline run 1 — product creatives (Cursor agent)

Формат: товарное TextAd (картинка без текста; Title/Text в полях Директа).

| Угол | Файл | Хук |
|------|------|-----|
| travel | `travel-agent-0.png` | navy-карта на паспорте/посадочном, чемодан, lounge sunrise |
| services | `services-agent-0.png` | чёрная карта + смартфон с blur иконок подписок |
| sbp | `sbp-agent-0.png` | карта + mint light-wave (быстрое пополнение) |

Движок: Cursor GenerateImage (`agent`), не YandexART/GPT.  
Размер: 1024×1024, object ~55–70%, blank card face, без логотипов платёжных систем.

Тексты: см. `TEXTAD_PRODUCT.json` (в Title/Text есть «зарубежная карта» / «выпуск зарубежной карты»; промокод LG2026).

## Ingest в трекер

```bash
python3 creatives/pipeline/1/upload_ingest.py --token '<FRESH_INGEST_TOKEN>' --run-id 1
```

Скрипт шлёт **по одному JPEG** на угол (обход nginx 413).  
Токен из промпта агента (`Yi-7t…`) на момент генерации вернул `403 Неверный ingest token` — нужен свежий token из карточки run на оркестраторе.
