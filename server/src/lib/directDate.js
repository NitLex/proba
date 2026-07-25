/**
 * Yandex Direct validates StartDate against the campaign TimeZone (Europe/Moscow).
 * Using UTC via toISOString() can yield "yesterday" after Moscow midnight → error 5005.
 */

/** @param {Date} [d] */
export function moscowDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Safe StartDate for campaigns.add: Moscow "today", never behind API calendar.
 * @param {Date} [d]
 */
export function directStartDate(d = new Date()) {
  return moscowDateString(d);
}
