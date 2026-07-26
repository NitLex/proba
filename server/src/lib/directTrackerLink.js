/**
 * Bind Yandex Direct campaign_id ↔ ArbTrack tracker campaign.
 * Used by Direct agent (on apply) and traffic analyst (attribution / EPC).
 */

import { db } from '../db.js';

/**
 * Persist Direct campaign id on a tracker campaign row.
 * @returns {{ ok: boolean, campaign?: object, error?: string }}
 */
export function linkDirectToTrackerCampaign({
  trackerCampaignId,
  directCampaignId,
  appendNote = true,
} = {}) {
  const trackerId = Number(trackerCampaignId);
  const directId = String(directCampaignId || '').trim();
  if (!trackerId || !directId) {
    return { ok: false, error: 'trackerCampaignId and directCampaignId required' };
  }

  const camp = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(trackerId);
  if (!camp) return { ok: false, error: `tracker campaign ${trackerId} not found` };

  const noteLine = `Direct campaign_id=${directId}`;
  let notes = camp.notes || '';
  if (appendNote && !notes.includes(noteLine) && !notes.includes(`campaign_id=${directId}`)) {
    notes = notes ? `${notes}\n${noteLine}` : noteLine;
  }

  db.prepare(
    `UPDATE campaigns
     SET direct_campaign_id = ?, notes = ?
     WHERE id = ?`,
  ).run(directId, notes, trackerId);

  // Clear the same Direct id from other campaigns of the same user (1:1 preferred)
  if (camp.user_id) {
    db.prepare(
      `UPDATE campaigns
       SET direct_campaign_id = NULL
       WHERE user_id = ? AND id != ? AND direct_campaign_id = ?`,
    ).run(camp.user_id, trackerId, directId);
  }

  return {
    ok: true,
    campaign: db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(trackerId),
  };
}

/** Find tracker campaign by stored Direct id (optionally scoped to user). */
export function findTrackerByDirectCampaignId(directCampaignId, userId = null) {
  const directId = String(directCampaignId || '').trim();
  if (!directId) return null;
  if (userId) {
    return (
      db
        .prepare(
          `SELECT * FROM campaigns
           WHERE direct_campaign_id = ? AND user_id = ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(directId, userId) || null
    );
  }
  return (
    db
      .prepare(
        `SELECT * FROM campaigns
         WHERE direct_campaign_id = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(directId) || null
  );
}

/**
 * Resolve tracker campaign for a Direct campaign.
 * Priority: direct_campaign_id → pipeline context → notes → name/key fuzzy match.
 */
export function resolveTrackerForDirect({
  directCampaignId,
  directName = '',
  userId = null,
  context = {},
} = {}) {
  const directId = String(directCampaignId || '').trim();

  const byColumn = findTrackerByDirectCampaignId(directId, userId);
  if (byColumn) {
    return { campaign: byColumn, match: 'direct_campaign_id' };
  }

  const ctxId = context.tracker?.campaign?.id;
  const ctxDirect = context.direct?.campaign_id
    ? String(context.direct.campaign_id)
    : null;
  if (ctxId && ctxDirect && ctxDirect === directId) {
    const row = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(ctxId);
    if (row) {
      // heal missing column
      linkDirectToTrackerCampaign({
        trackerCampaignId: row.id,
        directCampaignId: directId,
      });
      return {
        campaign: db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(row.id),
        match: 'pipeline_context',
      };
    }
  }

  const noteNeedle = `%campaign_id=${directId}%`;
  const byNotes = userId
    ? db
        .prepare(
          `SELECT * FROM campaigns
           WHERE user_id = ? AND notes LIKE ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(userId, noteNeedle)
    : db
        .prepare(
          `SELECT * FROM campaigns
           WHERE notes LIKE ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(noteNeedle);
  if (byNotes) {
    linkDirectToTrackerCampaign({
      trackerCampaignId: byNotes.id,
      directCampaignId: directId,
    });
    return {
      campaign: db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(byNotes.id),
      match: 'notes',
    };
  }

  // Fuzzy: Direct name contains tracker name or key
  const camps = userId
    ? db
        .prepare(
          `SELECT * FROM campaigns WHERE user_id = ? ORDER BY id DESC LIMIT 80`,
        )
        .all(userId)
    : db.prepare(`SELECT * FROM campaigns ORDER BY id DESC LIMIT 80`).all();

  const name = String(directName || '');
  const fuzzy =
    camps.find((t) => t.name && name.includes(t.name)) ||
    camps.find((t) => t.key && name.includes(t.key)) ||
    null;
  if (fuzzy) {
    return { campaign: fuzzy, match: 'name_fuzzy', linked: false };
  }

  return { campaign: null, match: 'none' };
}

/**
 * Backfill direct_campaign_id from pipeline run contexts (done runs with both ids).
 * @param {Array<{ context?: object }>} runs
 */
export function backfillLinksFromPipelineRuns(runs = []) {
  let linked = 0;
  for (const run of runs) {
    const ctx = run?.context || {};
    const trackerId = ctx.tracker?.campaign?.id;
    const directId = ctx.direct?.campaign_id || ctx.direct?.apply_summary?.campaign_id;
    if (!trackerId || !directId) continue;
    const existing = findTrackerByDirectCampaignId(String(directId));
    if (existing?.id === Number(trackerId)) continue;
    const res = linkDirectToTrackerCampaign({
      trackerCampaignId: trackerId,
      directCampaignId: directId,
    });
    if (res.ok) linked += 1;
  }
  return { linked };
}
