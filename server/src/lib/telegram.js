/**
 * Telegram Bot API helpers for ops alerts.
 */

export function telegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

export function normalizeChatId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // numeric chat id (user / group / channel)
  if (/^-?\d{5,20}$/.test(s)) return s;
  return '';
}

export async function sendTelegramMessage(chatId, text, opts = {}) {
  const token = telegramBotToken();
  if (!token) return { ok: false, skipped: true, reason: 'no_bot_token' };
  const id = normalizeChatId(chatId);
  if (!id) return { ok: false, skipped: true, reason: 'bad_chat_id' };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: id,
      text: String(text || '').slice(0, 3900),
      disable_web_page_preview: true,
      ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: body.description || res.statusText,
    };
  }
  return { ok: true, message_id: body.result?.message_id };
}
