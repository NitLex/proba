/**
 * Direct agent — builds РСЯ plan and optionally creates a DRAFT campaign via API.
 * Never submits ads to moderation. User launches manually.
 */

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
  const data = await res.json();
  return data;
}

function buildPlan({ offer, context }) {
  const playbook = context.playbook || {};
  const econ = playbook.economics || {};
  const tracker = context.tracker || {};
  const semantics = context.semantics || {};
  const creatives = context.creatives?.briefs || [];
  const href =
    tracker.click_url?.split('?')[0] ||
    `${(process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '')}/click/PENDING`;

  const cpc = Number(econ.cpc_max || process.env.MAX_CPC_RUB || 7);
  const weekly = Number(econ.weekly_budget || (econ.daily_budget || offer.daily_budget || 5000) * 7);

  return {
    name: `РСЯ | ${offer.name || 'Offer'} | ${(playbook.angles || []).map((a) => a.id).join('+') || 'test'}`,
    network_only: true,
    state: 'OFF',
    moderation: 'DO_NOT_SUBMIT',
    strategy: {
      search: 'SERVING_OFF',
      network: 'WB_MAXIMUM_CLICKS',
      bid_ceiling_rub: cpc,
      weekly_spend_limit_rub: weekly,
    },
    geo: playbook.geo || offer.geo || 'RU',
    region_ids: [225],
    tracking_params:
      'utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}',
    href,
    settings: {
      ENABLE_SITE_MONITORING: 'YES',
      ENABLE_COMPANY_INFO: 'NO',
      ENABLE_AREA_OF_INTEREST_TARGETING: 'NO',
      ALTERNATIVE_TEXTS_ENABLED: 'NO',
      ADD_METRICA_TAG: 'NO',
      neuro_ads: 'OFF',
      direct_helps_auto: 'OFF',
    },
    negatives: semantics.negatives || [],
    ad_groups: (playbook.angles || [{ id: 'generic', title: 'Main' }]).map((angle) => {
      const brief = creatives.find((c) => c.angle_id === angle.id);
      const kws =
        (semantics.groups && semantics.groups[angle.id]) ||
        semantics.keywords?.filter((k) => k.group === angle.id).map((k) => k.phrase) ||
        [];
      return {
        name: `PPM ${angle.title || angle.id}`,
        keywords: kws,
        ads: (brief?.titles || [offer.name || 'Офер']).slice(0, 3).map((title, i) => ({
          title: String(title).slice(0, 56),
          text: String((brief?.texts || ['Оформление онлайн'])[i % (brief?.texts?.length || 1)]).slice(
            0,
            81,
          ),
          href,
          image_hint: '1080x1080 JPG for TextAd',
        })),
        sitelinks: brief?.sitelinks || [],
        callouts: brief?.callouts || [],
      };
    }),
    bid_modifiers: {
      age_25_34: 115,
      age_35_44: 115,
      age_0_17: 0,
      age_55: 50,
    },
    generated_images: context.creatives?.generated_images || [],
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
          StartDate: new Date().toISOString().slice(0, 10),
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

  // Keep campaign stopped — user starts manually
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
    adGroupIds = (addGroups?.result?.AddResults || [])
      .map((r) => r.Id)
      .filter(Boolean);
  }

  for (let i = 0; i < adGroupIds.length; i++) {
    const group = plan.ad_groups[i];
    const keywords = (group.keywords || [])
      .slice(0, 40)
      .map((phrase) => ({
        Keyword: String(phrase).slice(0, 4096),
        AdGroupId: adGroupIds[i],
      }));
    if (keywords.length) {
      const kw = await directApi('keywords', { method: 'add', params: { Keywords: keywords } });
      log.push({ step: `keywords.add:${adGroupIds[i]}`, result: kw });
    }

    const ads = (group.ads || []).slice(0, 3).map((ad) => ({
      AdGroupId: adGroupIds[i],
      TextAd: {
        Title: String(ad.title || 'Оформить онлайн').slice(0, 56),
        Text: String(ad.text || 'Оформление онлайн').slice(0, 81),
        Href: ad.href || plan.href,
        Mobile: 'NO',
      },
    }));
    if (ads.length) {
      const adRes = await directApi('ads', { method: 'add', params: { Ads: ads } });
      log.push({ step: `ads.add:${adGroupIds[i]}`, result: adRes });
      // Explicitly DO NOT call ads.moderate — draft only
    }
  }

  return {
    ok: true,
    campaign_id: campaignId,
    ad_group_ids: adGroupIds,
    state: 'OFF',
    moderation_submitted: false,
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
  const readyMessage = applied
    ? `Кампания готова · ID ${applyResult.campaign_id} · черновик (OFF), на модерацию не отправляли — запусти вручную в Директе`
    : apiReady
      ? apply
        ? `Директ: не удалось создать черновик — ${JSON.stringify(applyResult?.error || applyResult).slice(0, 200)}`
        : 'Директ: план готов (apply_direct=false — в аккаунте не создавали)'
      : 'Директ: план готов (токена нет — только спецификация)';

  return {
    summary: readyMessage,
    ready_message: applied ? 'Кампания готова' : null,
    direct: {
      plan,
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
      'Ты Директ-агент. Кампания должна остаться черновиком OFF.',
      'НЕ вызывай ads.moderate и НЕ запускай показы.',
      JSON.stringify(plan, null, 2),
      'Не включай Neuro Ads / авторекомендации.',
    ].join('\n'),
    context_patch: {
      direct: {
        plan,
        api_ready: apiReady,
        applied,
        campaign_id: applyResult?.campaign_id || null,
        ready_message: applied ? 'Кампания готова' : null,
      },
    },
  };
}
