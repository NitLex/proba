/**
 * Direct agent — builds campaign plan from context; optionally applies via API.
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

  const cpc = Number(econ.cpc_max || 7);
  const weekly = Number(econ.weekly_budget || (econ.daily_budget || 5000) * 7);

  return {
    name: `РСЯ | ${offer.name || 'Offer'} | ${(playbook.angles || []).map((a) => a.id).join('+') || 'test'}`,
    network_only: true,
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
      const kws = (semantics.groups && semantics.groups[angle.id]) || semantics.keywords?.filter((k) => k.group === angle.id).map((k) => k.phrase) || [];
      return {
        name: `PPM ${angle.title || angle.id}`,
        keywords: kws,
        ads: (brief?.titles || [offer.name || 'Офер']).slice(0, 3).map((title, i) => ({
          title,
          text: (brief?.texts || ['Оформление онлайн'])[i % (brief?.texts?.length || 1)],
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
  };
}

export async function runDirect({ offer, context, apply = false }) {
  const plan = buildPlan({ offer, context });
  let applyResult = null;

  if (apply && process.env.YANDEX_DIRECT_TOKEN) {
    // Lightweight apply: create campaign shell with strategy (full ads may be large — plan is primary).
    const weeklyMicros = Math.round(plan.strategy.weekly_spend_limit_rub * 1_000_000);
    const cpcMicros = Math.round(plan.strategy.bid_ceiling_rub * 1_000_000);
    const add = await directApi('campaigns', {
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
    applyResult = add;
  }

  const apiReady = Boolean(process.env.YANDEX_DIRECT_TOKEN && process.env.YANDEX_DIRECT_LOGIN);

  return {
    summary: apiReady
      ? apply
        ? `Директ: план + apply (${applyResult?.result ? 'ok' : 'see apply_result'})`
        : 'Директ: план готов (API токен есть, apply=false — не создавали в аккаунте)'
      : 'Директ: план готов (токена нет — только спецификация)',
    direct: {
      plan,
      api_ready: apiReady,
      applied: Boolean(apply && applyResult && !applyResult.error),
      apply_result: applyResult,
    },
    cursor_prompt: [
      'Ты Директ-агент. Примени план кампании РСЯ через API v5 или UI.',
      JSON.stringify(plan, null, 2),
      'Не включай Neuro Ads / авторекомендации. После модерации — resume кампании.',
    ].join('\n'),
    context_patch: { direct: { plan, api_ready: apiReady } },
  };
}
