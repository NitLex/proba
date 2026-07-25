PPM — ключевые фразы для РСЯ
=============================

Файлы для ручной загрузки в Директ:

- keywords-ppm-travel.txt    → группа Travel
- keywords-ppm-services.txt  → группа Services
- negatives-ppm.txt          → минус-слова кампании

Документация и JSON:
- docs/PPM_WORDSTAT_SEMANTICS.md
- docs/ppm-semantics.json

Фильтр повторных Wordstat-дампов:
  node scripts/filter-wordstat-ppm.mjs raw.json --write
