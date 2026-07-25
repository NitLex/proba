/**
 * Enrich offer input from affiliate URL / LeadGid before pipeline starts.
 */
import { findOfferByLegacyId } from './leadgid.js';

function extractLeadgidOfferId(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('offer_id') || u.searchParams.get('offerid');
    if (id) return String(id);
  } catch {
    /* ignore */
  }
  const m = String(url).match(/offer_id=(\d+)/i);
  return m ? m[1] : null;
}

async function fetchPageHints(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'ArbTrack-Orchestrator/1.0 (+https://trekerarbitrag.ru)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(t);
    const html = (await res.text()).slice(0, 120_000);
    const title =
      (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, ' ') || '';
    const desc =
      (html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
        ) ||
        [])[1]?.trim() || '';
    const ogTitle =
      (html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      ) || [])[1]?.trim() || '';
    return {
      final_url: res.url || url,
      title: ogTitle || title || '',
      description: desc || '',
      status: res.status,
    };
  } catch (err) {
    return { final_url: url, title: '', description: '', error: err.message || String(err) };
  }
}

/**
 * @returns {Promise<{ offer: object, enrich: object }>}
 */
export async function enrichOfferInput(raw = {}) {
  const offer = { ...raw };
  if (!offer.name && offer.offer_name) offer.name = offer.offer_name;
  if (!offer.url && offer.offer_url) offer.url = offer.offer_url;

  const enrich = { sources: [] };

  if (offer.url) {
    const lgId = extractLeadgidOfferId(offer.url);
    if (lgId) {
      offer.network_offer_id = offer.network_offer_id || lgId;
      offer.network = offer.network || 'LeadGid';
      try {
        const token = process.env.LEADGID_TOKEN || '';
        const lgRes = await findOfferByLegacyId(lgId, token || undefined);
        const lg = lgRes?.offer || null;
        if (lg) {
          enrich.sources.push('leadgid_api');
          enrich.leadgid = {
            id: lgId,
            name: lg.name || lg.title,
            epc: lg.epc,
            payout: lg.payout || lg.price || lg.payment,
            geo: lg.geo || lg.countries,
          };
          if (!offer.name) offer.name = lg.name || lg.title || `LeadGid #${lgId}`;
          const pay = lg.payout ?? lg.price ?? lg.payment;
          if (offer.payout == null && pay != null) offer.payout = Number(pay);
          if (offer.epc == null && lg.epc != null) offer.epc = Number(lg.epc);
          if (!offer.geo && (lg.geo || lg.countries)) {
            offer.geo = String(lg.geo || lg.countries)
              .split(/[,;]/)[0]
              .trim()
              .slice(0, 8) || 'RU';
          }
          if (!offer.vertical && lg.category) offer.vertical = String(lg.category);
          if (!offer.notes && lg.description) {
            offer.notes = String(lg.description).slice(0, 500);
          }
        } else if (lgRes?.error) {
          enrich.leadgid_error = lgRes.error;
        }
      } catch (err) {
        enrich.leadgid_error = err.message || String(err);
      }
    }

    const page = await fetchPageHints(offer.url);
    enrich.sources.push('page_meta');
    enrich.page = page;
    if (!offer.name && page.title) offer.name = page.title.slice(0, 80);
    if (!offer.notes && page.description) offer.notes = page.description.slice(0, 500);
  }

  if (!offer.name && offer.url) {
    try {
      offer.name = new URL(offer.url).hostname.replace(/^www\./, '');
    } catch {
      offer.name = 'Оффер по ссылке';
    }
  }

  offer.geo = offer.geo || 'RU';
  offer.source = offer.source || 'Yandex Direct РСЯ';
  offer.network = offer.network || (offer.network_offer_id ? 'LeadGid' : '');
  offer.vertical = offer.vertical || 'Fintech';
  if (offer.daily_budget == null && process.env.DAILY_BUDGET_RUB) {
    offer.daily_budget = Number(process.env.DAILY_BUDGET_RUB);
  }

  return { offer, enrich };
}
