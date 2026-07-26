/**
 * Enrich offer input from affiliate URL / LeadGid / info page before pipeline starts.
 * Tracking URL (aff_c) and research URL (info/landing) are separated when possible.
 */
import { findOfferByLegacyId } from './leadgid.js';
import { stripHtml } from './htmlText.js';

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
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
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
    const ogDesc =
      (html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      ) || [])[1]?.trim() || '';
    return {
      final_url: res.url || url,
      title: stripHtml(ogTitle || title || ''),
      description: stripHtml(ogDesc || desc || ''),
      status: res.status,
    };
  } catch (err) {
    return { final_url: url, title: '', description: '', error: err.message || String(err) };
  }
}

function mapLeadgidOffer(lg, lgId) {
  const goals = (lg.goals || []).filter((g) => g.active);
  const payoutGoal =
    goals.find((g) => Number(g.payout?.amount || 0) > 0) ||
    goals[0] ||
    null;
  const payout = payoutGoal ? Number(payoutGoal.payout?.amount || 0) : null;
  const epc = lg.metrics?.epc_u != null ? Number(lg.metrics.epc_u) : Number(lg.epc || 0) || null;
  const short = stripHtml(lg.short_description_ru || lg.short_description_en || lg.description || '');
  const advantages = stripHtml(lg.advantages || '');
  const disadvantages = stripHtml(lg.disadvantages || '');
  const cats = Array.isArray(lg.categories)
    ? lg.categories.map((c) => c.name || c.title || c).filter(Boolean).join(', ')
    : lg.category || '';

  const briefParts = [short, advantages ? `Плюсы: ${advantages}` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 900);

  return {
    id: lgId,
    name: lg.name || lg.title || `LeadGid #${lgId}`,
    epc,
    payout,
    payout_goal: payoutGoal?.name || null,
    currency: payoutGoal?.payout?.currency || lg.currency || 'RUB',
    cr: lg.metrics?.cr_u != null ? Number(lg.metrics.cr_u) : null,
    category: cats || null,
    short_description: short,
    advantages,
    disadvantages,
    network_description: briefParts,
    goals: goals.slice(0, 5).map((g) => ({
      name: g.name,
      payout: Number(g.payout?.amount || 0),
      currency: g.payout?.currency || 'RUB',
    })),
  };
}

/**
 * @returns {Promise<{ offer: object, enrich: object }>}
 */
export async function enrichOfferInput(raw = {}) {
  const offer = { ...raw };
  if (!offer.name && offer.offer_name) offer.name = offer.offer_name;
  if (!offer.url && offer.offer_url) offer.url = offer.offer_url;
  // Affiliate research page (cabinet description / lander with product copy)
  const infoUrl = offer.info_url || offer.offer_info_url || offer.landing_url || '';

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
          const mapped = mapLeadgidOffer(lg, lgId);
          enrich.sources.push('leadgid_api');
          enrich.leadgid = mapped;

          if (!offer.name) offer.name = mapped.name;
          if (offer.payout == null && mapped.payout != null) offer.payout = mapped.payout;
          if (offer.epc == null && mapped.epc != null) offer.epc = mapped.epc;
          if (!offer.currency && mapped.currency) offer.currency = mapped.currency;
          if (!offer.geo) offer.geo = 'RU';
          if (!offer.vertical && mapped.category) offer.vertical = String(mapped.category).slice(0, 80);
          if (!offer.notes && mapped.network_description) {
            offer.notes = mapped.network_description.slice(0, 700);
          }
          offer.network_description = mapped.network_description;
          offer.description = mapped.short_description || offer.description || '';
          offer.product_brief = {
            name: mapped.name,
            summary: mapped.short_description,
            advantages: mapped.advantages,
            disadvantages: mapped.disadvantages,
            payout: mapped.payout,
            epc: mapped.epc,
            goals: mapped.goals,
            category: mapped.category,
          };
        } else if (lgRes?.error) {
          enrich.leadgid_error = lgRes.error;
        }
      } catch (err) {
        enrich.leadgid_error = err.message || String(err);
      }
    }
  }

  // Research pages: prefer explicit info_url, then tracking URL (follows redirects to lander)
  const researchTargets = [...new Set([infoUrl, offer.url].filter(Boolean))];
  for (const target of researchTargets) {
    const page = await fetchPageHints(target);
    if (!page) continue;
    const tag = target === infoUrl ? 'info_page' : 'tracking_or_landing';
    enrich.sources.push(tag);
    enrich[tag === 'info_page' ? 'info_page' : 'page'] = page;
    if (page.final_url && !offer.landing_url) offer.landing_url = page.final_url;
    if (!offer.name && page.title) offer.name = page.title.slice(0, 80);
    if (page.description) {
      if (!offer.notes) offer.notes = page.description.slice(0, 700);
      else if (!offer.notes.includes(page.description.slice(0, 40))) {
        offer.notes = `${offer.notes} ${page.description}`.slice(0, 900);
      }
      if (!offer.description) offer.description = page.description.slice(0, 500);
    }
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
  // Keep UI "Fintech" as soft hint only — vertical_key is detected from product text later
  offer.vertical = offer.vertical || 'Fintech';
  if (offer.daily_budget == null && process.env.DAILY_BUDGET_RUB) {
    offer.daily_budget = Number(process.env.DAILY_BUDGET_RUB);
  }

  return { offer, enrich };
}
