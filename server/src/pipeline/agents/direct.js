/**
 * Direct agent — builds РСЯ plan and optionally creates a DRAFT campaign via API.
 * Never submits ads to moderation. User launches manually.
 *
 * Ad format rules (from creatives):
 * - graphic  → ImageAd (текст на креативе)
 * - product  → TextAd  (чистая картинка + текст в полях объявления)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatLabel, resolveAdFormat } from '../../lib/adFormat.js';
import { buildAdLinkFields } from '../../lib/adHref.js';
import { directApi } from '../../lib/directApi.js';
import {
  buildDirectOperatorChecklist,
  directAgentSystemPrompt,
  DIRECT_BID_MODIFIERS,
  DIRECT_CREATIVE_RULES,
  DIRECT_EXCLUDED_PLACEMENTS,
  DIRECT_FINANCE_DOCS,
  DIRECT_HARD_RULES,
  DIRECT_RSYA_PLAYBOOK,
  getDirectKnowledgeBrief,
} from '../knowledge/direct-handbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

/** Direct StartDate must be >= today in Europe/Moscow, not UTC. */
export function moscowDateISO(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA → YYYY-MM-DD
  return fmt.format(d);
}

function resolveImageAbs(relOrAbs) {
  if (!relOrAbs) return null;
  if (path.isAbsolute(relOrAbs) && fs.existsSync(relOrAbs)) return relOrAbs;
  const cand = path.resolve(repoRoot, relOrAbs);
  return fs.existsSync(cand) ? cand : null;
}

async function uploadAdImage(filePath) {
  const abs = resolveImageAbs(filePath);
  if (!abs) return { ok: false, error: `file not found: ${filePath}` };
  const b64 = fs.readFileSync(abs).toString('base64');
  const name = path.basename(abs).slice(0, 255) || 'creative.jpg';
  const res = await directApi('adimages', {
    method: 'add',
    params: {
      AdImages: [
        {
          ImageData: b64,
          Name: name, // required by Direct API
          Type: 'AUTO',
        },
      ],
    },
  });
  const add0 = res?.result?.AddResults?.[0] || {};
  const hash = add0.AdImageHash || add0.Hash;
  if (!hash) {
    return {
      ok: false,
      error: res?.error || add0.Errors || 'no hash',
      raw: res,
      path: abs,
    };
  }
  return { ok: true, hash, path: abs, name, type: add0.Type || null };
}

function pickImageForAngle(generatedImages, angleId) {
  const list = generatedImages || [];
  const hit =
    list.find((g) => g.ok && g.path && String(g.prompt || '').includes(angleId)) ||
    list.find((g) => g.ok && g.path && (g.format === 'graphic' || g.format === 'product')) ||
    list.find((g) => g.ok && g.path);
  return hit?.path || null;
}

function buildPlan({ offer, context }) {
  const playbook = context.playbook || {};
  const econ = playbook.economics || {};
  const tracker = context.tracker || {};
  const semantics = context.semantics || {};
  const creativesMeta = context.creatives || {};
  const creatives = creativesMeta.briefs || [];
  const trackerClick =
    tracker.click_url?.split('?')[0] ||
    `${(process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '')}/click/PENDING`;
  const defaultLink = buildAdLinkFields({ clickUrl: trackerClick, offer });

  const cpc = Number(econ.cpc_max || process.env.MAX_CPC_RUB || 7);
  const weekly = Number(econ.weekly_budget || (econ.daily_budget || offer.daily_budget || 5000) * 7);

  const campaignFormat = resolveAdFormat({
    requested: creativesMeta.ad_format || offer.ad_format || 'auto',
    imageHasText: creativesMeta.image_has_text,
  });

  const handbookNegatives = DIRECT_RSYA_PLAYBOOK.negatives_seed || [];
  const negatives = [...new Set([...(semantics.negatives || []), ...handbookNegatives])];

  return {
    name: `РСЯ | ${offer.name || 'Offer'} | ${formatLabel(campaignFormat)} | ${(playbook.angles || []).map((a) => a.id).join('+') || 'test'}`,
    network_only: true,
    state: 'OFF',
    moderation: 'DO_NOT_SUBMIT',
    ad_format: campaignFormat,
    ad_format_label: formatLabel(campaignFormat),
    knowledge: {
      help_root: 'https://yandex.ru/support/direct/ru/',
      strategy_why: DIRECT_RSYA_PLAYBOOK.recommended_strategy.why,
      hard_rules: DIRECT_HARD_RULES.slice(0, 8),
      bid_modifiers: DIRECT_BID_MODIFIERS.recommended_rsya_test,
      excluded_placements: {
        limit: DIRECT_EXCLUDED_PLACEMENTS.limit,
        when_to_clean: DIRECT_EXCLUDED_PLACEMENTS.when_to_clean,
        seed_patterns: DIRECT_EXCLUDED_PLACEMENTS.seed_blocklist_patterns,
        workflow: DIRECT_EXCLUDED_PLACEMENTS.workflow,
      },
      creative_rules: {
        text: DIRECT_CREATIVE_RULES.text,
        images: DIRECT_CREATIVE_RULES.images,
        landing: DIRECT_CREATIVE_RULES.landing,
      },
      finance_docs: DIRECT_FINANCE_DOCS.payment_systems,
    },
    strategy: {
      search: DIRECT_RSYA_PLAYBOOK.recommended_strategy.search,
      network: DIRECT_RSYA_PLAYBOOK.recommended_strategy.network,
      bid_ceiling_rub: cpc,
      weekly_spend_limit_rub: weekly,
    },
    geo: playbook.geo || offer.geo || 'RU',
    region_ids: [225],
    tracking_params: DIRECT_RSYA_PLAYBOOK.tracking_params,
    href: defaultLink.href,
    display_domain: defaultLink.display_domain,
    display_preview: defaultLink.display_preview,
    tracker_click_url: trackerClick,
    settings: {
      ...DIRECT_RSYA_PLAYBOOK.settings_defaults,
      neuro_ads: 'OFF',
      direct_helps_auto: 'OFF',
    },
    negatives,
    ad_groups: (playbook.angles || [{ id: 'generic', title: 'Main' }]).map((angle) => {
      const brief = creatives.find((c) => c.angle_id === angle.id) || {};
      const format = resolveAdFormat({
        requested: brief.ad_format || campaignFormat,
        imageHasText: brief.image_has_text,
      });
      const kws =
        (semantics.groups && semantics.groups[angle.id]) ||
        semantics.keywords?.filter((k) => k.group === angle.id).map((k) => k.phrase) ||
        [];
      const imagePath = pickImageForAngle(creativesMeta.generated_images, angle.id);
      const link = buildAdLinkFields({ clickUrl: trackerClick, offer, angle });

      if (format === 'graphic') {
        // Графическое: текст на креативе → ImageAd (поля Title/Text не дублируем)
        return {
          name: `PPM ${angle.title || angle.id} · графика`,
          ad_format: 'graphic',
          direct_ad_type: 'ImageAd',
          keywords: kws,
          image_path: imagePath,
          overlay_lines: brief.overlay_lines || [],
          display_preview: link.display_preview,
          ads: [
            {
              type: 'ImageAd',
              href: link.href,
              display_url_path: link.display_url_path,
              image_path: imagePath,
              image_hint: 'баннер с надписями оффера → ImageAd',
            },
          ],
          sitelinks: brief.sitelinks || [],
          callouts: brief.callouts || [],
        };
      }

      // Товарное: чистая картинка + текст в настройках TextAd
      return {
        name: `PPM ${angle.title || angle.id} · товарное`,
        ad_format: 'product',
        direct_ad_type: 'TextAd',
        keywords: kws,
        image_path: imagePath,
        display_preview: link.display_preview,
        ads: (brief.titles || [offer.name || 'Офер']).slice(0, 3).map((title, i) => ({
          type: 'TextAd',
          title: String(title).slice(0, 56),
          text: String((brief.texts || ['Оформление онлайн'])[i % (brief.texts?.length || 1)]).slice(
            0,
            81,
          ),
          href: link.href,
          display_url_path: link.display_url_path,
          image_path: imagePath,
          image_hint: 'чистая картинка без текста + Title/Text в полях',
        })),
        sitelinks: brief.sitelinks || [],
        callouts: brief.callouts || [],
      };
    }),
    bid_modifiers: { ...DIRECT_RSYA_PLAYBOOK.bid_modifiers_defaults },
    generated_images: creativesMeta.generated_images || [],
  };
}

async function applyDraft(plan) {
  const log = [];
  const weeklyMicros = Math.round(plan.strategy.weekly_spend_limit_rub * 1_000_000);
  const cpcMicros = Math.round(plan.strategy.bid_ceiling_rub * 1_000_000);

  const addCampaign = await directApi('campaigns', {
    method: 'add',
    params: {
      Campaigns: [
        {
          Name: plan.name.slice(0, 255),
          StartDate: moscowDateISO(),
          TextCampaign: {
            BiddingStrategy: {
              Search: { BiddingStrategyType: 'SERVING_OFF' },
              Network: {
                BiddingStrategyType: 'WB_MAXIMUM_CLICKS',
                WbMaximumClicks: {
                  WeeklySpendLimit: weeklyMicros,
                  BidCeiling: cpcMicros,
                },
              },
            },
            Settings: [
              { Option: 'ENABLE_SITE_MONITORING', Value: 'YES' },
              { Option: 'ENABLE_COMPANY_INFO', Value: 'NO' },
              { Option: 'ENABLE_AREA_OF_INTEREST_TARGETING', Value: 'NO' },
              { Option: 'ALTERNATIVE_TEXTS_ENABLED', Value: 'NO' },
              { Option: 'ADD_METRICA_TAG', Value: 'NO' },
            ],
            TrackingParams: plan.tracking_params,
          },
          NegativeKeywords: { Items: (plan.negatives || []).slice(0, 20) },
          TimeZone: 'Europe/Moscow',
        },
      ],
    },
  });
  log.push({ step: 'campaigns.add', result: addCampaign });
  if (addCampaign?.error || addCampaign?.skipped) {
    return { ok: false, campaign_id: null, log, error: addCampaign?.error || addCampaign?.reason };
  }

  const campaignId = addCampaign?.result?.AddResults?.[0]?.Id;
  if (!campaignId) {
    return {
      ok: false,
      campaign_id: null,
      log,
      error: addCampaign?.result?.AddResults?.[0]?.Errors || 'no campaign id',
    };
  }

  const suspend = await directApi('campaigns', {
    method: 'suspend',
    params: { SelectionCriteria: { Ids: [campaignId] } },
  });
  log.push({ step: 'campaigns.suspend', result: suspend });

  const groupBodies = (plan.ad_groups || []).slice(0, 5).map((g) => ({
    Name: String(g.name || 'Group').slice(0, 255),
    CampaignId: campaignId,
    RegionIds: plan.region_ids || [225],
  }));

  let adGroupIds = [];
  if (groupBodies.length) {
    const addGroups = await directApi('adgroups', {
      method: 'add',
      params: { AdGroups: groupBodies },
    });
    log.push({ step: 'adgroups.add', result: addGroups });
    adGroupIds = (addGroups?.result?.AddResults || []).map((r) => r.Id).filter(Boolean);
  }

  const imageHashCache = new Map();

  async function hashFor(imagePath) {
    if (!imagePath) return null;
    if (imageHashCache.has(imagePath)) return imageHashCache.get(imagePath);
    const uploaded = await uploadAdImage(imagePath);
    log.push({ step: 'adimages.add', path: imagePath, result: uploaded });
    const hash = uploaded.ok ? uploaded.hash : null;
    imageHashCache.set(imagePath, hash);
    return hash;
  }

  for (let i = 0; i < adGroupIds.length; i++) {
    const group = plan.ad_groups[i];
    const keywords = (group.keywords || []).slice(0, 40).map((phrase) => ({
      Keyword: String(phrase).slice(0, 4096),
      AdGroupId: adGroupIds[i],
    }));
    if (keywords.length) {
      const kw = await directApi('keywords', { method: 'add', params: { Keywords: keywords } });
      log.push({ step: `keywords.add:${adGroupIds[i]}`, result: kw });
    }

    const adsPayload = [];
    for (const ad of (group.ads || []).slice(0, 3)) {
      const hash = await hashFor(ad.image_path || group.image_path);

      if (ad.type === 'ImageAd' || group.direct_ad_type === 'ImageAd') {
        if (!hash) {
          log.push({
            step: `ads.skip_imagead:${adGroupIds[i]}`,
            error: 'нет hash картинки для ImageAd',
          });
          continue;
        }
        // ImageAd: domain comes from Href only (no DisplayUrlPath in API)
        adsPayload.push({
          AdGroupId: adGroupIds[i],
          ImageAd: {
            AdImageHash: hash,
            Href: ad.href || plan.href,
          },
        });
      } else {
        const textAd = {
          Title: String(ad.title || 'Оформить онлайн').slice(0, 56),
          Text: String(ad.text || 'Оформление онлайн').slice(0, 81),
          Href: ad.href || plan.href,
          Mobile: 'NO',
        };
        if (ad.display_url_path) textAd.DisplayUrlPath = String(ad.display_url_path).slice(0, 20);
        if (hash) textAd.AdImageHash = hash;
        adsPayload.push({ AdGroupId: adGroupIds[i], TextAd: textAd });
      }
    }

    if (adsPayload.length) {
      const adRes = await directApi('ads', { method: 'add', params: { Ads: adsPayload } });
      log.push({ step: `ads.add:${adGroupIds[i]}`, result: adRes });
      // Explicitly DO NOT call ads.moderate
    }
  }

  const imageUploads = log.filter((l) => l.step === 'adimages.add');
  const imageOk = imageUploads.filter((l) => l.result?.ok).length;
  const imageFail = imageUploads.filter((l) => l.result && !l.result.ok).length;
  const neededImages = (plan.ad_groups || []).some((g) => g.image_path || g.ads?.some((a) => a.image_path));

  return {
    ok: true,
    campaign_id: campaignId,
    ad_group_ids: adGroupIds,
    ad_format: plan.ad_format,
    state: 'OFF',
    moderation_submitted: false,
    images: { attempted: imageUploads.length, ok: imageOk, failed: imageFail },
    warning:
      neededImages && imageFail > 0 && imageOk === 0
        ? 'Креативы не загрузились в Директ (adimages) — объявления без картинок'
        : null,
    log,
  };
}

export async function runDirect({ offer, context, apply = false }) {
  const plan = buildPlan({ offer, context });
  let applyResult = null;
  const apiReady = Boolean(process.env.YANDEX_DIRECT_TOKEN && process.env.YANDEX_DIRECT_LOGIN);

  if (apply && apiReady) {
    applyResult = await applyDraft(plan);
  }

  const applied = Boolean(applyResult?.ok);
  const fmt = plan.ad_format_label || formatLabel(plan.ad_format);
  const applyError = apply && apiReady && !applied
    ? applyResult?.error || applyResult || 'unknown'
    : null;

  if (applyError) {
    const details = typeof applyError === 'string' ? applyError : JSON.stringify(applyError);
    throw new Error(`Директ: не удалось создать черновик — ${details.slice(0, 400)}`);
  }

  const imgWarn = applyResult?.warning;
  const readyMessage = applied
    ? `Кампания готова · ID ${applyResult.campaign_id} · ${fmt} · черновик (OFF)${imgWarn ? ` · ⚠ ${imgWarn}` : ', на модерацию не отправляли'}`
    : apiReady
      ? 'Директ: план готов (apply_direct=false — в аккаунте не создавали)'
      : 'Директ: план готов (токена нет — только спецификация)';

  const knowledge = getDirectKnowledgeBrief();
  const operator_checklist = buildDirectOperatorChecklist({
    plan,
    offer,
    playbook: context.playbook,
  });

  return {
    summary: readyMessage,
    ready_message: applied ? 'Кампания готова' : null,
    direct: {
      plan,
      knowledge,
      operator_checklist,
      api_ready: apiReady,
      applied,
      draft_only: true,
      moderation_submitted: false,
      campaign_id: applyResult?.campaign_id || null,
      apply_result: applyResult,
      ready_message: applied ? 'Кампания готова' : null,
      user_action: applied
        ? 'Открой Директ → проверь объявления/креативы → отправь на модерацию и запусти сам'
        : null,
    },
    cursor_prompt: [
      directAgentSystemPrompt(),
      '',
      `Формат текущего запуска: ${plan.ad_format} (${plan.ad_format_label}).`,
      'План кампании (JSON):',
      JSON.stringify(plan, null, 2),
      '',
      'Чеклист для оператора:',
      JSON.stringify(operator_checklist, null, 2),
    ].join('\n'),
    context_patch: {
      direct: {
        plan,
        knowledge,
        operator_checklist,
        api_ready: apiReady,
        applied,
        campaign_id: applyResult?.campaign_id || null,
        ready_message: applied ? 'Кампания готова' : null,
        ad_format: plan.ad_format,
      },
    },
  };
}
