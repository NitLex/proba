/**
 * Direct agent — builds РСЯ plan and optionally creates a DRAFT campaign via API.
 * Never submits ads to moderation. User launches manually.
 *
 * Ad format rules (from creatives):
 * - graphic  → TextAd + AdImageHash (текст уже на креативе; ImageAd/TextImageAd не для TEXT_CAMPAIGN 1024)
 * - product  → TextAd + AdImageHash (чистая картинка + текст в полях объявления)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatLabel, resolveAdFormat } from '../../lib/adFormat.js';
import { buildAdLinkFields } from '../../lib/adHref.js';
import { directApiRetry } from '../../lib/directApi.js';
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
  const res = await directApiRetry('adimages', {
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

const ANGLE_KEYWORD_FALLBACK = {
  travel: [
    'карта для поездок',
    'карта для путешествий',
    'оплата за границей картой',
    'виртуальная карта для путешествий',
  ],
  services: [
    'карта для подписок',
    'оплата зарубежных сервисов',
    'виртуальная карта для сервисов',
    'карта для онлайн сервисов',
  ],
  sbp: [
    'карта с пополнением по сбп',
    'выпуск карты онлайн',
    'открыть карту онлайн',
    'виртуальная карта сбп',
  ],
  premium: ['премиальная виртуальная карта', 'карта с выгодным курсом'],
  generic: ['виртуальная карта онлайн', 'выпуск цифровой карты'],
};

/** Ensure every ad group gets keywords even if Wordstat clustered into one angle. */
export function keywordsForAngle(angle, semantics = {}, playbook = {}) {
  const id = angle?.id || 'generic';
  const fromGroup = semantics.groups?.[id] || [];
  const fromList = (semantics.keywords || [])
    .filter((k) => k.group === id)
    .map((k) => k.phrase);
  let kws = [...fromGroup, ...fromList].filter(Boolean);
  if (!kws.length) {
    const hooks = (angle?.hooks || playbook.angles?.find((a) => a.id === id)?.hooks || []).filter(
      Boolean,
    );
    const pool = (semantics.keywords || []).map((k) => k.phrase).filter(Boolean);
    kws = [...hooks, ...(ANGLE_KEYWORD_FALLBACK[id] || ANGLE_KEYWORD_FALLBACK.generic), ...pool.slice(0, 8)];
  }
  return [...new Set(kws.map((p) => String(p).trim()).filter(Boolean))];
}

function countAddOk(res) {
  return (res?.result?.AddResults || []).filter((r) => r.Id && !(r.Errors || []).length).length;
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
    geo:
      playbook.geo ||
      context.offer_facts?.geo ||
      offer.facts?.geo ||
      offer.geo ||
      null,
    region_ids:
      (Array.isArray(playbook.region_ids) && playbook.region_ids.length
        ? playbook.region_ids
        : null) ||
      (Array.isArray(context.offer_facts?.region_ids) && context.offer_facts.region_ids.length
        ? context.offer_facts.region_ids
        : null) ||
      (Array.isArray(offer.facts?.region_ids) && offer.facts.region_ids.length
        ? offer.facts.region_ids
        : null) ||
      // RU when geo says so, or RUB МФО / «нерезидентам» audience (traffic geo still РФ)
      (String(playbook.geo || context.offer_facts?.geo || offer.facts?.geo || offer.geo || '')
        .toUpperCase()
        .split(/[,\s]+/)
        .includes('RU') ||
      context.offer_facts?.non_resident_audience ||
      offer.facts?.non_resident_audience
        ? [225]
        : []),
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
      const kws = keywordsForAngle(angle, semantics, playbook);
      const imagePath = pickImageForAngle(creativesMeta.generated_images, angle.id);
      const link = buildAdLinkFields({ clickUrl: trackerClick, offer, angle });

      if (format === 'graphic') {
        // TEXT_CAMPAIGN не принимает ImageAd; TextImageAd требует спец. размеры баннера.
        // Квадрат GPT 1024 → TextAd + AdImageHash (текст уже на картинке, поля Title/Text обязательны в API).
        return {
          name: `${String(offer.name || 'Оффер').slice(0, 40)} · ${angle.title || angle.id} · графика`,
          ad_format: 'graphic',
          direct_ad_type: 'TextAd',
          keywords: kws,
          image_path: imagePath,
          overlay_lines: brief.overlay_lines || [],
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
            image_hint: 'графика 1024: TextAd + картинка с надписями (не ImageAd/TextImageAd)',
          })),
          sitelinks: brief.sitelinks || [],
          callouts: brief.callouts || [],
        };
      }

      // Товарное: чистая картинка + текст в настройках TextAd
      return {
        name: `${String(offer.name || 'Оффер').slice(0, 40)} · ${angle.title || angle.id} · товарное`,
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

async function listCampaignAdGroupIds(campaignId) {
  const res = await directApiRetry('adgroups', {
    method: 'get',
    params: {
      SelectionCriteria: { CampaignIds: [campaignId] },
      FieldNames: ['Id', 'Name'],
    },
  });
  return (res?.result?.AdGroups || []).map((g) => g.Id).filter(Boolean);
}

async function applyDraft(plan) {
  const log = [];
  const weeklyMicros = Math.round(plan.strategy.weekly_spend_limit_rub * 1_000_000);
  const cpcMicros = Math.round(plan.strategy.bid_ceiling_rub * 1_000_000);

  const addCampaign = await directApiRetry('campaigns', {
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

  // DRAFT campaigns cannot be suspended — ignore expected 8300
  const suspend = await directApiRetry('campaigns', {
    method: 'suspend',
    params: { SelectionCriteria: { Ids: [campaignId] } },
  });
  log.push({ step: 'campaigns.suspend', result: suspend });

  const groupBodies = (plan.ad_groups || []).slice(0, 5).map((g) => ({
    Name: String(g.name || 'Group').slice(0, 255),
    CampaignId: campaignId,
    // [] is truthy in JS — never use `plan.region_ids || [225]`
    RegionIds: Array.isArray(plan.region_ids) && plan.region_ids.length ? plan.region_ids : [225],
  }));

  let adGroupIds = [];
  if (groupBodies.length) {
    const addGroups = await directApiRetry('adgroups', {
      method: 'add',
      params: { AdGroups: groupBodies },
    });
    log.push({ step: 'adgroups.add', result: addGroups });
    adGroupIds = (addGroups?.result?.AddResults || []).map((r) => r.Id).filter(Boolean);

    // Transient 1000 can still create groups — reconcile by GET
    if (!adGroupIds.length) {
      await new Promise((r) => setTimeout(r, 1500));
      adGroupIds = await listCampaignAdGroupIds(campaignId);
      log.push({
        step: 'adgroups.reconcile',
        result: { ad_group_ids: adGroupIds, after_error: Boolean(addGroups?.error) },
      });
    }
    if (!adGroupIds.length && addGroups?.error) {
      // Drop orphan draft so retries don't spam the Direct account
      const cleanup = await directApiRetry('campaigns', {
        method: 'delete',
        params: { SelectionCriteria: { Ids: [campaignId] } },
      });
      log.push({ step: 'campaigns.delete_orphan', result: cleanup });
      return {
        ok: false,
        campaign_id: null,
        ad_group_ids: [],
        log,
        error: addGroups.error,
        orphan_campaign_deleted: campaignId,
      };
    }
  }

  const imageHashCache = new Map();
  let keywordsAdded = 0;
  let adsAdded = 0;

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
    const group = plan.ad_groups[i] || plan.ad_groups[0] || {};
    const keywords = (group.keywords || []).slice(0, 40).map((phrase) => ({
      Keyword: String(phrase).slice(0, 4096),
      AdGroupId: adGroupIds[i],
    }));
    if (keywords.length) {
      const kw = await directApiRetry('keywords', { method: 'add', params: { Keywords: keywords } });
      log.push({ step: `keywords.add:${adGroupIds[i]}`, result: kw });
      keywordsAdded += countAddOk(kw);
    }

    const adsPayload = [];
    for (const ad of (group.ads || []).slice(0, 3)) {
      const hash = await hashFor(ad.image_path || group.image_path);

      // Creative QA: TextAd without image hash → skip (no empty ads)
      if (!hash) {
        log.push({
          step: `ads.skip_no_image:${adGroupIds[i]}`,
          error: 'нет AdImageHash — объявление без картинки не создаём',
        });
        continue;
      }
      const textAd = {
        Title: String(ad.title || group.overlay_lines?.[0] || 'Оформить онлайн').slice(0, 56),
        Text: String(ad.text || group.overlay_lines?.[1] || 'Оформление онлайн').slice(0, 81),
        Href: ad.href || plan.href,
        Mobile: 'NO',
        AdImageHash: hash,
      };
      if (ad.display_url_path) textAd.DisplayUrlPath = String(ad.display_url_path).slice(0, 20);
      adsPayload.push({ AdGroupId: adGroupIds[i], TextAd: textAd });
    }

    if (adsPayload.length) {
      const adRes = await directApiRetry('ads', { method: 'add', params: { Ads: adsPayload } });
      log.push({ step: `ads.add:${adGroupIds[i]}`, result: adRes });
      adsAdded += countAddOk(adRes);
      // Explicitly DO NOT call ads.moderate
    }
  }

  const imageUploads = log.filter((l) => l.step === 'adimages.add');
  const imageOk = imageUploads.filter((l) => l.result?.ok).length;
  const imageFail = imageUploads.filter((l) => l.result && !l.result.ok).length;
  const neededImages = (plan.ad_groups || []).some((g) => g.image_path || g.ads?.some((a) => a.image_path));

  const incomplete = adsAdded === 0 || adGroupIds.length === 0 || imageOk === 0;
  const warnings = [];
  if (imageOk === 0) {
    warnings.push('Нет загруженных картинок — объявления без AdImageHash запрещены');
  } else if (neededImages && imageFail > 0 && imageOk === 0) {
    warnings.push('Креативы не загрузились в Директ (adimages) — объявления без картинок');
  }
  if (adsAdded === 0) warnings.push('Объявления не созданы');
  if (keywordsAdded === 0) warnings.push('Ключевые фразы не созданы');

  return {
    ok: !incomplete,
    campaign_id: campaignId,
    ad_group_ids: adGroupIds,
    ad_format: plan.ad_format,
    state: 'OFF',
    moderation_submitted: false,
    counts: { ad_groups: adGroupIds.length, keywords: keywordsAdded, ads: adsAdded },
    images: { attempted: imageUploads.length, ok: imageOk, failed: imageFail },
    warning: warnings.length ? warnings.join(' · ') : null,
    error: incomplete
      ? warnings.join(' · ') || 'Кампания создана без объявлений/групп'
      : null,
    log,
  };
}

export async function runDirect({ offer, context, apply = false }) {
  const plan = buildPlan({ offer, context });
  let applyResult = null;
  let trackerLink = null;
  const apiReady = Boolean(process.env.YANDEX_DIRECT_TOKEN && process.env.YANDEX_DIRECT_LOGIN);
  const awaitingAgent = Boolean(context.creatives?.awaiting_agent_images);
  const hasImages = (context.creatives?.generated_images || []).some((g) => g.ok && g.path);
  const regionIds = Array.isArray(plan.region_ids)
    ? plan.region_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  // Hard stop: empty RegionIds used to create orphan DRAFT campaigns in a retry loop
  if (apply && apiReady && !regionIds.length) {
    const details =
      'Нет RegionIds (geo оффера пустой). Укажи гео (например RU / UZ / KZ) перед созданием кампании в Директе — иначе API падает и плодит черновики.';
    return {
      summary: `Директ: ${details}`,
      ready_message: null,
      failed: true,
      direct: {
        plan: { ...plan, region_ids: [] },
        applied: false,
        apply: null,
        campaign_id: null,
        error: details,
      },
      context_patch: {
        direct: {
          plan: { ...plan, region_ids: [] },
          applied: false,
          campaign_id: null,
          error: details,
        },
      },
    };
  }
  plan.region_ids = regionIds.length ? regionIds : plan.region_ids;

  // Agent mode without images yet: don't create incomplete Direct ads
  if (apply && apiReady && awaitingAgent && !hasImages) {
    return {
      summary:
        'Директ: ждём креативы от агента (GenerateImage). После ingest — «Применить креативы в Директ».',
      ready_message: null,
      failed: false,
      direct: {
        plan,
        applied: false,
        awaiting_agent_images: true,
        apply: null,
      },
      context_patch: {
        direct: {
          plan,
          applied: false,
          awaiting_agent_images: true,
        },
      },
    };
  }

  if (apply && apiReady) {
    applyResult = await applyDraft(plan);
    // Bind Direct ↔ tracker even on partial apply (campaign created, ads failed)
    if (applyResult?.campaign_id && context.tracker?.campaign?.id) {
      const { linkDirectToTrackerCampaign } = await import('../../lib/directTrackerLink.js');
      trackerLink = linkDirectToTrackerCampaign({
        trackerCampaignId: context.tracker.campaign.id,
        directCampaignId: applyResult.campaign_id,
      });
    }
  }

  const applied = Boolean(applyResult?.ok);
  const fmt = plan.ad_format_label || formatLabel(plan.ad_format);
  const applyError = apply && apiReady && !applied
    ? applyResult?.error || applyResult || 'unknown'
    : null;

  if (applyError) {
    const details = typeof applyError === 'string' ? applyError : JSON.stringify(applyError);
    const knowledge = getDirectKnowledgeBrief();
    const operator_checklist = buildDirectOperatorChecklist({
      plan,
      offer,
      playbook: context.playbook,
      tracker: context.tracker,
    });
    const applySummary = {
      ok: false,
      campaign_id: applyResult?.campaign_id || null,
      ad_group_ids: applyResult?.ad_group_ids || [],
      counts: applyResult?.counts || null,
      images: applyResult?.images || null,
      warning: applyResult?.warning || null,
      error: details.slice(0, 400),
    };
    // Return structured failure (do not throw bare) so UI keeps apply log / campaign id
    return {
      summary: `Директ: черновик неполный — ${details.slice(0, 200)}`,
      ready_message: null,
      failed: true,
      direct: {
        plan,
        knowledge,
        operator_checklist,
        api_ready: apiReady,
        applied: false,
        draft_only: true,
        moderation_submitted: false,
        campaign_id: applyResult?.campaign_id || null,
        apply_result: applyResult,
        apply_summary: applySummary,
        tracker_link: trackerLink,
        ready_message: null,
        user_action: applyResult?.campaign_id
          ? `Кампания ${applyResult.campaign_id} создана, но объявления/ключи не залились — проверь лог apply`
          : 'Черновик не создан',
      },
      cursor_prompt: [
        directAgentSystemPrompt(),
        '',
        `Ошибка apply: ${details.slice(0, 400)}`,
        JSON.stringify(applySummary, null, 2),
      ].join('\n'),
      context_patch: {
        direct: {
          plan,
          knowledge,
          operator_checklist,
          api_ready: apiReady,
          applied: false,
          campaign_id: applyResult?.campaign_id || null,
          apply_summary: applySummary,
          tracker_link: trackerLink,
          ad_format: plan.ad_format,
        },
      },
    };
  }

  const imgWarn = applyResult?.warning;
  const counts = applyResult?.counts;
  const readyMessage = applied
    ? `Кампания готова · ID ${applyResult.campaign_id} · ${fmt} · групп ${counts?.ad_groups ?? '—'} · объявл. ${counts?.ads ?? '—'} · ключей ${counts?.keywords ?? '—'} · черновик (OFF)${imgWarn ? ` · ⚠ ${imgWarn}` : ', на модерацию не отправляли'}`
    : apiReady
      ? 'Директ: план готов (apply_direct=false — в аккаунте не создавали)'
      : 'Директ: план готов (токена нет — только спецификация)';

  const knowledge = getDirectKnowledgeBrief();
  const operator_checklist = buildDirectOperatorChecklist({
    plan,
    offer,
    playbook: context.playbook,
    tracker: context.tracker,
  });

  // Keep context lean: full apply log stays in step output only
  const applySummary = applyResult
    ? {
        ok: applyResult.ok,
        campaign_id: applyResult.campaign_id,
        ad_group_ids: applyResult.ad_group_ids,
        counts: applyResult.counts,
        images: applyResult.images,
        warning: applyResult.warning,
        error: applyResult.error || null,
      }
    : null;

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
      tracker_link: trackerLink,
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
        apply_summary: applySummary,
        tracker_link: trackerLink,
        ready_message: applied ? 'Кампания готова' : null,
        ad_format: plan.ad_format,
      },
    },
  };
}
