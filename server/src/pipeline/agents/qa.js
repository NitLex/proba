/**
 * QA / smoke agent — runs after Direct.
 * Verifies click redirects, ad-review bots, postback template, optional Direct campaign.
 */

import { runSmokeSuite } from '../../lib/smokeCheck.js';

async function directApi(service, body) {
  const token = process.env.YANDEX_DIRECT_TOKEN;
  const login = process.env.YANDEX_DIRECT_LOGIN;
  if (!token || !login) return { skipped: true, reason: 'no_token' };

  const res = await fetch(`https://api.direct.yandex.com/json/v5/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Login': login,
      'Accept-Language': 'ru',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function runQa({ offer, context, dryRun }) {
  const tracker = context.tracker || {};
  const direct = context.direct || {};
  const clickUrl = tracker.click_url || direct.plan?.href || '';
  const postbackUrl = tracker.postback_url || '';
  const offerUrl = tracker.offer?.url || offer.url || offer.offer_url || '';
  const campaignId = direct.campaign_id || direct.apply_result?.campaign_id || null;

  if (dryRun || String(process.env.PIPELINE_SKIP_QA || '') === '1') {
    const reason = dryRun ? 'dry_run' : 'PIPELINE_SKIP_QA';
    return {
      summary: `QA пропущен (${reason})`,
      qa: {
        ok: true,
        skipped: true,
        reason,
        checks: [],
      },
      context_patch: {
        qa: { ok: true, skipped: true, reason },
      },
    };
  }

  const suite = await runSmokeSuite({
    clickUrl,
    postbackUrl,
    offerUrl,
    directCampaignId: campaignId,
    directApi: process.env.YANDEX_DIRECT_TOKEN ? directApi : null,
  });

  if (!suite.ok) {
    const details = suite.checks
      .filter((c) => !c.ok && c.severity === 'fail')
      .map((c) => `${c.id}: ${c.summary}`)
      .join('; ');
    throw new Error(`QA smoke fail — ${details}`);
  }

  return {
    summary: suite.summary,
    qa: suite,
    ready_message: suite.ok ? 'Проверки пройдены' : null,
    cursor_prompt: [
      'Ты QA-агент трекера/Директа.',
      'Результаты smoke-проверок:',
      JSON.stringify(suite, null, 2),
      'Если есть fail — почини click/block_bots/постбек до модерации.',
    ].join('\n'),
    context_patch: {
      qa: suite,
    },
  };
}
