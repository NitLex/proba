import { Router } from 'express';
import { UAParser } from 'ua-parser-js';
import { db } from '../db.js';
import {
  applyMacros,
  clientIp,
  detectBot,
  makeClickId,
  parseCost,
} from '../lib/tracking.js';

const router = Router();

function loadCampaign(key) {
  return db
    .prepare(
      `SELECT c.*,
        o.name AS offer_name, o.url AS offer_url, o.payout AS offer_payout,
        l.name AS landing_name, l.url AS landing_url,
        s.name AS source_name, s.cost_param AS source_cost_param,
        s.token1 AS src_token1, s.token2 AS src_token2, s.token3 AS src_token3,
        s.token4 AS src_token4, s.token5 AS src_token5
       FROM campaigns c
       LEFT JOIN offers o ON o.id = c.offer_id
       LEFT JOIN landings l ON l.id = c.landing_id
       LEFT JOIN traffic_sources s ON s.id = c.traffic_source_id
       WHERE c.key = ?`
    )
    .get(key);
}

function tokenValue(req, paramName) {
  if (!paramName) return '';
  const v = req.query[paramName];
  return v == null ? '' : String(v);
}

router.get('/click/:key', (req, res) => {
  const campaign = loadCampaign(req.params.key);
  if (!campaign) return res.status(404).send('Campaign not found');
  if (campaign.status !== 'active') return res.status(403).send('Campaign paused');

  const ua = req.headers['user-agent'] || '';
  const parser = new UAParser(ua);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const clickid = makeClickId();
  const ip = clientIp(req);
  const costParam = campaign.source_cost_param || 'cost';
  const costFromQs = parseCost(req.query[costParam], null);
  const cost =
    costFromQs !== null
      ? costFromQs
      : campaign.cost_model === 'cpc'
        ? campaign.cost_value
        : 0;

  const token1 = tokenValue(req, campaign.src_token1);
  const token2 = tokenValue(req, campaign.src_token2);
  const token3 = tokenValue(req, campaign.src_token3);
  const token4 = tokenValue(req, campaign.src_token4);
  const token5 = tokenValue(req, campaign.src_token5);

  const recent = db
    .prepare(
      `SELECT id FROM clicks
       WHERE campaign_id = ? AND ip = ? AND user_agent = ?
         AND created_at > datetime('now', '-24 hours')
       LIMIT 1`
    )
    .get(campaign.id, ip, ua);
  const isUnique = recent ? 0 : 1;

  db.prepare(
    `INSERT INTO clicks (
      clickid, campaign_id, offer_id, landing_id, traffic_source_id,
      ip, user_agent, country, city, device, os, browser, referer,
      cost, is_unique, is_bot, token1, token2, token3, token4, token5, query_string
    ) VALUES (
      @clickid, @campaign_id, @offer_id, @landing_id, @traffic_source_id,
      @ip, @user_agent, @country, @city, @device, @os, @browser, @referer,
      @cost, @is_unique, @is_bot, @token1, @token2, @token3, @token4, @token5, @query_string
    )`
  ).run({
    clickid,
    campaign_id: campaign.id,
    offer_id: campaign.offer_id,
    landing_id: campaign.landing_id,
    traffic_source_id: campaign.traffic_source_id,
    ip,
    user_agent: ua,
    country: String(req.query.country || req.headers['cf-ipcountry'] || ''),
    city: String(req.query.city || ''),
    device: device.type || 'desktop',
    os: [os.name, os.version].filter(Boolean).join(' '),
    browser: [browser.name, browser.version].filter(Boolean).join(' '),
    referer: req.headers.referer || '',
    cost,
    is_unique: isUnique,
    is_bot: detectBot(ua),
    token1,
    token2,
    token3,
    token4,
    token5,
    query_string: new URLSearchParams(req.query).toString(),
  });

  const ctx = {
    clickid,
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    campaign_key: campaign.key,
    offer_id: campaign.offer_id,
    offer_name: campaign.offer_name,
    cost,
    payout: campaign.offer_payout,
    country: String(req.query.country || ''),
    city: String(req.query.city || ''),
    device: device.type || 'desktop',
    os: [os.name, os.version].filter(Boolean).join(' '),
    browser: [browser.name, browser.version].filter(Boolean).join(' '),
    ip,
    user_agent: ua,
    referer: req.headers.referer || '',
    token1,
    token2,
    token3,
    token4,
    token5,
  };

  // Landing → offer flow, or direct to offer
  if (campaign.landing_url) {
    const dest = applyMacros(campaign.landing_url, ctx);
    const sep = dest.includes('?') ? '&' : '?';
    return res.redirect(302, `${dest}${sep}clickid=${encodeURIComponent(clickid)}&ck=${encodeURIComponent(campaign.key)}`);
  }

  if (!campaign.offer_url) return res.status(400).send('No offer or landing configured');
  return res.redirect(302, applyMacros(campaign.offer_url, ctx));
});

/** Landing page CTA → offer */
router.get('/to-offer', (req, res) => {
  const clickid = String(req.query.clickid || '');
  if (!clickid) return res.status(400).send('clickid required');

  const click = db
    .prepare(
      `SELECT cl.*, c.name AS campaign_name, c.key AS campaign_key,
        o.name AS offer_name, o.url AS offer_url, o.payout AS offer_payout
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       LEFT JOIN offers o ON o.id = COALESCE(cl.offer_id, c.offer_id)
       WHERE cl.clickid = ?`
    )
    .get(clickid);

  if (!click || !click.offer_url) return res.status(404).send('Offer not found');

  const dest = applyMacros(click.offer_url, {
    clickid: click.clickid,
    campaign_id: click.campaign_id,
    campaign_name: click.campaign_name,
    campaign_key: click.campaign_key,
    offer_id: click.offer_id,
    offer_name: click.offer_name,
    cost: click.cost,
    payout: click.offer_payout,
    country: click.country,
    city: click.city,
    device: click.device,
    os: click.os,
    browser: click.browser,
    ip: click.ip,
    user_agent: click.user_agent,
    referer: click.referer,
    token1: click.token1,
    token2: click.token2,
    token3: click.token3,
    token4: click.token4,
    token5: click.token5,
  });

  return res.redirect(302, dest);
});

export default router;
