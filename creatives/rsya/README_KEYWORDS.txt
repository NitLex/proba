Семантика РСЯ «Плати по миру» (Wordstat cleanup)
================================================

Файлы:
- keywords-final.json     — полный результат чистки (для пайплайна / Директ-агента)
- keywords-travel.txt     — группа Travel
- keywords-services.txt   — группа Services
- keywords-sbp.txt        — группа SBP (быстрый выпуск + СБП)
- negatives.txt           — минус-слова кампании

Документация: docs/SEMANTICS_PPM_WORDSTAT.md

Как использовать в Директе:
1) Создай группу объявлений под угол (Travel / Services / SBP)
2) Вставь фразы из соответствующего .txt (по одной на строку, без строк с #)
3) На кампанию добавь минус-слова из negatives.txt
4) Автотаргетинг на старте выключи

Пересборка:
  npm run semantics:cleanup
