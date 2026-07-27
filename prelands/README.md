# Prelands (GitHub Pages)

Статические преленды для РСЯ. Хостинг: **GitHub Pages**, не VPS трекера.

- Прод-база: `https://nitlex.github.io/proba/`
- CTA ведёт на трекер: `https://trekerarbitrag.ru/to-offer?clickid=…`
- Клики Директа по-прежнему через `/click/<key>` на трекере; в лендинге кампании — URL Pages.

## Файлы

| Файл | URL |
|---|---|
| `finmfo-7426.html` | https://nitlex.github.io/proba/finmfo-7426.html |
| `assets/*` | https://nitlex.github.io/proba/assets/… |

## Деплой

Push в `main` (или workflow_dispatch) → `.github/workflows/deploy-prelands.yml`.

Один раз в Settings → Pages: Source = **GitHub Actions**.

## Локально

Открой HTML напрямую или `npx serve prelands`.
