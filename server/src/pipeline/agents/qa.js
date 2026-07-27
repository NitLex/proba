/**
 * QA / smoke agent — runs after Direct.
 * Verifies click redirects, ad-review bots, postback template, creative checklist, Direct status.
 */

import { directApi } from '../../lib/directApi.js';
import { runSmokeSuite } from '../../lib/smokeCheck.js';
import {
  validateCreatives,
  creativeModerationChecklist,
} from '../../lib/creativeQa.js';

export async function runQa({ offer, context, dryRun }) {
  const tracker = context.tracker || {};
  const direct = context.direct || {};
  const creatives = context.creatives || {};
  const playbook = context.playbook || {};
  const verticalKey = playbook.vertical_key || '';
  const clickUrl = tracker.click_url || direct.plan?.href || '';
  const postbackUrl = tracker.postback_url || '';
  const offerUrl = tracker.offer?.url || offer.url || offer.offer_url || '';
  const campaignId = direct.campaign_id || direct.apply_result?.campaign_id || null;

  const creativeQa =
    creatives.qa ||
    validateCreatives(creatives.briefs || [], {
      verticalKey,
      requireImages: true,
      generatedImages: creatives.generated_images || [],
    });
  const checklist = creativeModerationChecklist({
    verticalKey,
    qa: { direct_status: direct.apply_summary?.status || null },
  });

  if (dryRun || String(process.env.PIPELINE_SKIP_QA || '') === '1') {
    const reason = dryRun ? 'dry_run' : 'PIPELINE_SKIP_QA';
    return {
      summary: `QA пропущен (${reason})`,
      qa: {
        ok: true,
        skipped: true,
        reason,
        checks: [],
        creative_qa: creativeQa,
        checklist,
      },
      context_patch: {
        qa: { ok: true, skipped: true, reason, creative_qa: creativeQa, checklist },
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

  // Soft creative warnings don't fail QA; hard image/vertical errors do.
  // Agent mode awaiting GenerateImage: missing images is not a hard fail yet.
  const awaitingAgent = Boolean(creatives.awaiting_agent_images);
  const creativeHardFail =
    !awaitingAgent &&
    !creativeQa.ok &&
    (creativeQa.errors || []).some((e) =>
      /нет ни одной картинки|зарубежная карта|займы:|маркетплейс:/.test(e.text || ''),
    );

  const moderationGate = {
    id: 'moderation_gate',
    ok: true,
    severity: 'ok',
    summary: campaignId
      ? `Кампания ${campaignId}: не лить бюджет до ACCEPTED; чеклист модерации готов`
      : 'Кампания Директа не создана — модерация после apply',
    checklist,
  };
  suite.checks.push(moderationGate);
  if (creativeHardFail) {
    suite.checks.push({
      id: 'creative_qa',
      ok: false,
      severity: 'fail',
      summary: creativeQa.errors.map((e) => e.text).join('; '),
      creative_qa: creativeQa,
    });
    suite.ok = false;
    suite.stats.fail += 1;
    suite.summary = `QA fail · creative_qa · ${suite.summary}`;
  } else {
    suite.checks.push({
      id: 'creative_qa',
      ok: creativeQa.ok,
      severity: creativeQa.ok ? 'ok' : 'warn',
      summary: creativeQa.ok
        ? `креативы ok (${creativeQa.briefs} бриф / ${creativeQa.images_ok} img)`
        : `креативы: ${creativeQa.warnings.length} предупреждений`,
      creative_qa: creativeQa,
    });
  }

  suite.creative_qa = creativeQa;
  suite.checklist = checklist;

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
      'Если есть fail — почини click/block_bots/постбек/креатив до модерации.',
      'Не лей бюджет в REJECTED / сильно ограниченную кампанию.',
    ].join('\n'),
    context_patch: {
      qa: suite,
    },
  };
}
