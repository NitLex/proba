/**
 * Yandex Direct validates StartDate against the campaign TimeZone (Europe/Moscow).
 * `toISOString().slice(0,10)` is UTC and can be "yesterday" after 21:00 UTC → error 5005.
 */
export function moscowDateString(base = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

/** StartDate safe for TextCampaign create (Moscow calendar day, never behind API "today"). */
export function moscowStartDate(base = new Date()) {
  return moscowDateString(base);
}
