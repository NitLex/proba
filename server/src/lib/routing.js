import { db } from '../db.js';
import { pickWeighted } from './tracking.js';
import { pickFirstMatchingRule } from './rules.js';

export function loadCampaignPaths(campaignId) {
  const paths = db
    .prepare(
      `SELECT p.*, l.name AS landing_name, l.url AS landing_url
       FROM campaign_paths p
       LEFT JOIN landings l ON l.id = p.landing_id
       WHERE p.campaign_id = ? AND p.enabled = 1
       ORDER BY p.sort_order ASC, p.id ASC`
    )
    .all(campaignId);

  const offerStmt = db.prepare(
    `SELECT po.offer_id, po.weight, o.name AS offer_name, o.url AS offer_url, o.payout AS offer_payout, o.status
     FROM path_offers po
     JOIN offers o ON o.id = po.offer_id
     WHERE po.path_id = ? AND o.status = 'active'`
  );

  return paths.map((p) => ({
    ...p,
    offers: offerStmt.all(p.id),
  }));
}

export function loadCampaignRules(campaignId) {
  const rules = db
    .prepare(
      `SELECT * FROM campaign_rules WHERE campaign_id = ? AND enabled = 1 ORDER BY priority ASC, id ASC`
    )
    .all(campaignId);
  const condStmt = db.prepare(`SELECT * FROM rule_conditions WHERE rule_id = ?`);
  return rules.map((r) => ({
    ...r,
    conditions: condStmt.all(r.id),
  }));
}

/**
 * Resolve landing + offer for a click using rules then weighted paths.
 */
export function resolveRoute(campaign, ctx) {
  const paths = loadCampaignPaths(campaign.id);
  const rules = loadCampaignRules(campaign.id);
  const matched = pickFirstMatchingRule(rules, ctx);

  let path = null;
  if (matched?.path_id) {
    path = paths.find((p) => p.id === matched.path_id) || null;
    if (!path) {
      // path may be disabled; load anyway
      path = db
        .prepare(
          `SELECT p.*, l.name AS landing_name, l.url AS landing_url
           FROM campaign_paths p
           LEFT JOIN landings l ON l.id = p.landing_id
           WHERE p.id = ?`
        )
        .get(matched.path_id);
      if (path) {
        path.offers = db
          .prepare(
            `SELECT po.offer_id, po.weight, o.name AS offer_name, o.url AS offer_url, o.payout AS offer_payout
             FROM path_offers po JOIN offers o ON o.id = po.offer_id
             WHERE po.path_id = ? AND o.status = 'active'`
          )
          .all(path.id);
      }
    }
  }

  if (!path) {
    const defaults = paths.filter((p) => p.is_default);
    path = pickWeighted(defaults.length ? defaults : paths);
  }

  if (!path) {
    // legacy fallback
    return {
      path_id: null,
      rule_id: matched?.id || null,
      landing_id: campaign.landing_id,
      landing_url: campaign.landing_url,
      landing_name: campaign.landing_name,
      offer_id: null,
      offer_url: null,
      offer_name: null,
      offer_payout: null,
      use_legacy_rotation: true,
    };
  }

  const offer = pickWeighted(path.offers || []);
  return {
    path_id: path.id,
    rule_id: matched?.id || null,
    landing_id: path.landing_id,
    landing_url: path.landing_url,
    landing_name: path.landing_name,
    offer_id: offer?.offer_id || null,
    offer_url: offer?.offer_url || null,
    offer_name: offer?.offer_name || null,
    offer_payout: offer?.offer_payout ?? null,
    use_legacy_rotation: false,
  };
}
