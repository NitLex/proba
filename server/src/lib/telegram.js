/**
 * Telegram Bot API helpers for ops alerts.
 * Some VPS resolve api.telegram.org to unreachable IPs — set TELEGRAM_API_IP
 * (e.g. 149.154.167.220) to force a working address while keeping SNI/Host.
 */
import https from 'https';
import { URL } from 'url';

export function telegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

export function telegramApiIp() {
  return String(process.env.TELEGRAM_API_IP || '').trim();
}

export function normalizeChatId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // numeric chat id (user / group / channel)
  if (/^-?\d{5,20}$/.test(s)) return s;
  return '';
}

async function telegramRequest(method, payload = null, timeoutMs = 12000) {
  const token = telegramBotToken();
  if (!token) return { ok: false, skipped: true, reason: 'no_bot_token' };

  const path = `/bot${token}/${method}`;
  const url = new URL(`https://api.telegram.org${path}`);
  const body = payload == null ? null : JSON.stringify(payload);
  const ip = telegramApiIp();

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: ip || url.hostname,
        servername: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: body ? 'POST' : 'GET',
        family: 4,
        headers: {
          Host: url.hostname,
          Accept: 'application/json',
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { description: raw.slice(0, 200) };
          }
          if (res.statusCode >= 400 || data.ok === false) {
            resolve({
              ok: false,
              status: res.statusCode,
              error: data.description || res.statusMessage || 'telegram_error',
              data,
            });
            return;
          }
          resolve({ ok: true, status: res.statusCode, data });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout', reason: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message || 'network_error', reason: 'network' });
    });
    if (body) req.write(body);
    req.end();
  });
}

export async function sendTelegramMessage(chatId, text, opts = {}) {
  const id = normalizeChatId(chatId);
  if (!telegramBotToken()) return { ok: false, skipped: true, reason: 'no_bot_token' };
  if (!id) return { ok: false, skipped: true, reason: 'bad_chat_id' };

  const r = await telegramRequest('sendMessage', {
    chat_id: id,
    text: String(text || '').slice(0, 3900),
    disable_web_page_preview: true,
    ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}),
  });
  if (!r.ok) {
    return {
      ok: false,
      skipped: r.skipped,
      reason: r.reason,
      status: r.status,
      error: r.error || 'Не удалось отправить',
    };
  }
  return { ok: true, message_id: r.data?.result?.message_id };
}

/**
 * Find private-chat id from recent /start (or any) messages to the bot.
 * Optionally match by Telegram @username.
 */
export async function discoverChatIdFromUpdates(preferredUsername = '') {
  const r = await telegramRequest('getUpdates', null, 15000);
  if (!r.ok) {
    return { ok: false, error: r.error || r.reason || 'getUpdates failed' };
  }
  const updates = Array.isArray(r.data?.result) ? r.data.result : [];
  const want = String(preferredUsername || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

  const candidates = [];
  for (const u of updates) {
    const msg = u.message || u.edited_message;
    if (!msg?.chat || msg.chat.type !== 'private') continue;
    const chat = msg.chat;
    const from = msg.from || {};
    candidates.push({
      chat_id: String(chat.id),
      username: chat.username || from.username || '',
      first_name: chat.first_name || from.first_name || '',
      text: msg.text || '',
      date: msg.date || 0,
    });
  }
  if (!candidates.length) {
    return {
      ok: false,
      error:
        'Нет сообщений боту. Откройте @info_trekerbot и нажмите /start, затем повторите.',
    };
  }

  candidates.sort((a, b) => b.date - a.date);
  const matched = want
    ? candidates.find((c) => String(c.username).toLowerCase() === want)
    : null;
  const best = matched || candidates[0];
  return { ok: true, chat_id: best.chat_id, match: best, candidates: candidates.slice(0, 5) };
}
