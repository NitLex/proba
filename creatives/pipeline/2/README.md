# Pipeline run 2 — product creatives (Cursor agent)

Формат: товарное TextAd (картинка без текста; Title/Text в полях Директа).

| Угол | Файл | Хук |
|------|------|-----|
| travel | `travel-agent-0.png` | карта + паспорт + чемодан, аэропорт sunrise |
| services | `services-agent-0.png` | карта + смартфон с blur иконок подписок |
| sbp | `sbp-agent-0.png` | карта + mint light-wave (быстрое пополнение) |

Движок: Cursor GenerateImage (`agent`), не YandexART/GPT.

## Ingest в трекер

```bash
python3 creatives/pipeline/2/upload_ingest.py --token '<FRESH_INGEST_TOKEN>' --run-id 2
```

Токен из промпта агента (`EAPXa_…`) на момент генерации вернул `403 Неверный ingest token`
(hash на run, вероятно, перезаписан параллельными spawn). Нужен свежий token из карточки run.
