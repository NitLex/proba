/**
 * Yandex Direct Reports API (placements / custom reports).
 * https://yandex.ru/dev/direct/doc/reports/
 */

import { parseDirectJson, stringifyDirectBody } from './directApi.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  // Europe/Moscow ≈ UTC+3 without DST since 2014
  const msk = new Date(d.getTime() + 3 * 3600000);
  return msk.toISOString().slice(0, 10);
}

function parseTsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split('\t');
  const rows = lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
  return { headers, rows };
}

function num(v) {
  if (v == null || v === '' || v === '--') return 0;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Request a report and wait until TSV is ready.
 * @returns {{ ok: boolean, rows?: object[], error?: any, skipped?: boolean }}
 */
export async function fetchDirectReport(params, { maxWaitMs = 45000 } = {}) {
  const token = process.env.YANDEX_DIRECT_TOKEN;
  const login = process.env.YANDEX_DIRECT_LOGIN;
  if (!token || !login) return { ok: false, skipped: true, reason: 'no_token' };

  const body = { params };
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < maxWaitMs) {
    attempt += 1;
    const res = await fetch('https://api.direct.yandex.com/json/v5/reports', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Login': login,
        'Accept-Language': 'ru',
        'Content-Type': 'application/json; charset=utf-8',
        processingMode: 'auto',
        returnMoneyInMicros: 'false',
        skipReportHeader: 'true',
        skipColumnHeader: 'false',
        skipReportSummary: 'true',
      },
      body: stringifyDirectBody(body),
    });

    const text = await res.text();
    if (res.status === 200) {
      const { rows } = parseTsv(text);
      return { ok: true, rows, attempts: attempt };
    }

    // 201/202 — still building
    if (res.status === 201 || res.status === 202) {
      const retryIn = Number(res.headers.get('retryIn') || 2);
      await sleep(Math.max(1, retryIn) * 1000);
      continue;
    }

    // Error JSON
    const err = parseDirectJson(text) || { raw: text.slice(0, 400), status: res.status };
    return { ok: false, error: err, attempts: attempt };
  }

  return { ok: false, error: 'report_timeout', attempts: attempt };
}

/** Placement report for one or more campaigns (РСЯ площадки). */
export async function fetchPlacementReport(campaignIds, { dateFrom, dateTo } = {}) {
  const ids = (campaignIds || []).map(String).filter(Boolean);
  if (!ids.length) return { ok: false, error: 'no_campaign_ids', rows: [] };

  const from = dateFrom || moscowDate(-7);
  const to = dateTo || moscowDate(0);
  const name = `arbtrack_placements_${ids.join('_').slice(0, 40)}_${Date.now()}`;

  const result = await fetchDirectReport({
    SelectionCriteria: {
      DateFrom: from,
      DateTo: to,
      Filter: [{ Field: 'CampaignId', Operator: 'IN', Values: ids }],
    },
    FieldNames: [
      'CampaignId',
      'CampaignName',
      'Placement',
      'Impressions',
      'Clicks',
      'Cost',
      'Conversions',
      'AvgCpc',
    ],
    ReportName: name.slice(0, 255),
    ReportType: 'CUSTOM_REPORT',
    DateRangeType: 'CUSTOM_DATE',
    Format: 'TSV',
    IncludeVAT: 'YES',
    IncludeDiscount: 'NO',
  });

  if (!result.ok) return { ...result, rows: [], dateFrom: from, dateTo: to };

  const rows = (result.rows || []).map((r) => ({
    campaign_id: String(r.CampaignId || ''),
    campaign_name: r.CampaignName || '',
    placement: String(r.Placement || '').trim(),
    impressions: num(r.Impressions),
    clicks: num(r.Clicks),
    cost: num(r.Cost),
    conversions: num(r.Conversions),
    avg_cpc: num(r.AvgCpc),
  }));

  return { ok: true, rows, dateFrom: from, dateTo: to, attempts: result.attempts };
}

export { moscowDate, num as reportNum };
