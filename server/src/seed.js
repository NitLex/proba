import { db } from './db.js';
import { makeCampaignKey } from './lib/tracking.js';

const count = db.prepare('SELECT COUNT(*) AS c FROM campaigns').get().c;
if (count > 0) {
  console.log('Database already seeded, skipping campaigns.');
  seedBundles();
  process.exit(0);
}

const insertSource = db.prepare(`
  INSERT INTO traffic_sources (name, postback_url, cost_param, currency, token1, token2, token3, notes)
  VALUES (@name, @postback_url, @cost_param, @currency, @token1, @token2, @token3, @notes)
`);

const insertOffer = db.prepare(`
  INSERT INTO offers (name, url, payout, currency, geo, network, status, notes)
  VALUES (@name, @url, @payout, @currency, @geo, @network, @status, @notes)
`);

const insertLanding = db.prepare(`
  INSERT INTO landings (name, url, notes)
  VALUES (@name, @url, @notes)
`);

const insertCampaign = db.prepare(`
  INSERT INTO campaigns (name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
  VALUES (@name, @key, @traffic_source_id, @offer_id, @landing_id, @cost_model, @cost_value, @status, @notes)
`);

const tx = db.transaction(() => {
  const fb = insertSource.run({
    name: 'Facebook Ads',
    postback_url: '',
    cost_param: 'cost',
    currency: 'USD',
    token1: 'utm_campaign',
    token2: 'utm_content',
    token3: 'placement',
    notes: 'Meta Ads traffic',
  });

  const gg = insertSource.run({
    name: 'Google UAC',
    postback_url: '',
    cost_param: 'cost',
    currency: 'USD',
    token1: 'campaignid',
    token2: 'adgroupid',
    token3: 'creative',
    notes: 'Google App campaigns',
  });

  const offer1 = insertOffer.run({
    name: 'Nutra Slim DE',
    url: 'https://example-aff.net/click?offer=1&sub1={clickid}&sub2={campaign_id}&geo={country}',
    payout: 45,
    currency: 'USD',
    geo: 'DE',
    network: 'DemoCPA',
    status: 'active',
    notes: 'Sample nutra offer',
  });

  const offer2 = insertOffer.run({
    name: 'Finance Loan PL',
    url: 'https://example-aff.net/click?offer=2&click_id={clickid}&source={campaign_name}',
    payout: 28,
    currency: 'EUR',
    geo: 'PL',
    network: 'DemoCPA',
    status: 'active',
    notes: 'Sample finance offer',
  });

  const land1 = insertLanding.run({
    name: 'Slim Preland DE',
    url: 'https://example-landings.test/slim-de/?cid={clickid}',
    notes: 'Use /to-offer?clickid={clickid} on CTA',
  });

  const key1 = makeCampaignKey();
  const key2 = makeCampaignKey();

  insertCampaign.run({
    name: 'FB → Slim DE',
    key: key1,
    traffic_source_id: Number(fb.lastInsertRowid),
    offer_id: Number(offer1.lastInsertRowid),
    landing_id: Number(land1.lastInsertRowid),
    cost_model: 'cpc',
    cost_value: 0.35,
    status: 'active',
    notes: 'Demo campaign with landing',
  });

  insertCampaign.run({
    name: 'UAC → Loan PL direct',
    key: key2,
    traffic_source_id: Number(gg.lastInsertRowid),
    offer_id: Number(offer2.lastInsertRowid),
    landing_id: null,
    cost_model: 'cpc',
    cost_value: 0.22,
    status: 'active',
    notes: 'Direct-to-offer campaign',
  });

  // Sample clicks + conversions for dashboard demo
  const insertClick = db.prepare(`
    INSERT INTO clicks (
      clickid, campaign_id, offer_id, landing_id, traffic_source_id,
      ip, user_agent, country, device, os, browser, cost, is_unique, is_bot,
      token1, token2, created_at
    ) VALUES (
      @clickid, @campaign_id, @offer_id, @landing_id, @traffic_source_id,
      @ip, @user_agent, @country, @device, @os, @browser, @cost, @is_unique, @is_bot,
      @token1, @token2, @created_at
    )
  `);

  const insertConv = db.prepare(`
    INSERT INTO conversions (clickid, click_row_id, campaign_id, offer_id, status, payout, currency, txid, created_at)
    VALUES (@clickid, @click_row_id, @campaign_id, @offer_id, @status, @payout, @currency, @txid, @created_at)
  `);

  const camp1 = Number(db.prepare('SELECT id FROM campaigns WHERE key = ?').get(key1).id);
  const camp2 = Number(db.prepare('SELECT id FROM campaigns WHERE key = ?').get(key2).id);
  const o1 = Number(offer1.lastInsertRowid);
  const o2 = Number(offer2.lastInsertRowid);
  const src1 = Number(fb.lastInsertRowid);
  const src2 = Number(gg.lastInsertRowid);
  const l1 = Number(land1.lastInsertRowid);

  const days = [0, 0, 1, 1, 2, 3, 4, 5, 6];
  let n = 0;
  for (const d of days) {
    for (let i = 0; i < 8 + (d % 3); i++) {
      n += 1;
      const clickid = `demo${String(n).padStart(10, '0')}xx`;
      const isCamp1 = n % 3 !== 0;
      const created = `datetime('now', '-${d} days', '-${i} hours')`;
      const info = insertClick.run({
        clickid,
        campaign_id: isCamp1 ? camp1 : camp2,
        offer_id: isCamp1 ? o1 : o2,
        landing_id: isCamp1 ? l1 : null,
        traffic_source_id: isCamp1 ? src1 : src2,
        ip: `203.0.113.${(n % 200) + 1}`,
        user_agent: 'Mozilla/5.0 (demo)',
        country: isCamp1 ? 'DE' : 'PL',
        device: n % 4 === 0 ? 'mobile' : 'desktop',
        os: n % 4 === 0 ? 'Android 14' : 'Windows 11',
        browser: 'Chrome 120',
        cost: isCamp1 ? 0.35 : 0.22,
        is_unique: 1,
        is_bot: 0,
        token1: isCamp1 ? 'slim_lookalike' : 'uac_pl',
        token2: isCamp1 ? 'video_a' : 'adg_1',
        created_at: db.prepare(`SELECT ${created} AS t`).get().t,
      });

      if (n % 7 === 0) {
        insertConv.run({
          clickid,
          click_row_id: Number(info.lastInsertRowid),
          campaign_id: isCamp1 ? camp1 : camp2,
          offer_id: isCamp1 ? o1 : o2,
          status: n % 14 === 0 ? 'sale' : 'lead',
          payout: isCamp1 ? 45 : 28,
          currency: isCamp1 ? 'USD' : 'EUR',
          txid: `tx_${n}`,
          created_at: db.prepare(`SELECT ${created} AS t`).get().t,
        });
      }
    }
  }

  return { key1, key2 };
});

const { key1, key2 } = tx();
console.log('Seeded ArbTrack demo data.');
console.log(`Campaign 1 click URL: /click/${key1}`);
console.log(`Campaign 2 click URL: /click/${key2}`);
console.log('Postback example: /postback?clickid=CLICKID&payout=45&status=sale');

seedBundles();

function seedBundles() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM bundles').get().c;
  if (n > 0) {
    console.log('Bundles already seeded, skipping.');
    return;
  }

  const insert = db.prepare(`
    INSERT INTO bundles (
      name, vertical, geo, source, funnel, payout_model, bid_hint, heat, difficulty, rating,
      where_to_pour, creatives, landing_notes, offer_notes, risks, checklist, status, notes
    ) VALUES (
      @name, @vertical, @geo, @source, @funnel, @payout_model, @bid_hint, @heat, @difficulty, @rating,
      @where_to_pour, @creatives, @landing_notes, @offer_notes, @risks, @checklist, @status, @notes
    )
  `);

  const bundles = [
    {
      name: 'FB Broad → Nutra Slim DE',
      vertical: 'Nutra',
      geo: 'DE',
      source: 'Facebook Ads',
      funnel: 'quiz-preland',
      payout_model: 'CPA',
      bid_hint: 'CPC 0.25–0.55$',
      heat: 'hot',
      difficulty: 'medium',
      rating: 5,
      where_to_pour:
        'Мета Ads, CBO на 3–5 adset. Аудитории: interest weight loss / diabetes / 35–65 + broad 1%. Плейсменты Advantage+, бюджет старт 40–80$/день. Масштаб: дублируй победивший adset ×1.5.',
      creatives:
        'UGC-видео 15–30с, before/after, «врач рекомендует», текст с болью (усталость/живот). 4–6 креативов в ротации. Не используй запрещённые слова Meta в primary text — выноси на креатив.',
      landing_notes:
        'Квиз 4–6 шагов → результат «подходит продукт» → CTA на /to-offer. Мобильный first, скорость <2с. White page под акк + cloaking на black.',
      offer_notes: 'Выбирай офферы с апрувом >35% и холдом ≤14 дней. Тестируй 2–3 оффера на одном преленде.',
      risks: 'Бан аккаунтов Meta, жалобы на креатив, низкий апрув при плохом гео-трафике. Держи 3–5 фарм-акков в резерве.',
      checklist:
        '1) Фарм BM + карта\n2) Пиксель + CAPI\n3) White + cloaker\n4) Постбек sale/lead\n5) 48ч тест на 50–80$ → kill/scale',
      status: 'active',
      notes: 'Классика вечнозелёного нутры на DE.',
    },
    {
      name: 'TikTok Spark → Dating LATAM',
      vertical: 'Dating',
      geo: 'BR, MX, CO',
      source: 'TikTok Ads',
      funnel: 'preland',
      payout_model: 'CPL',
      bid_hint: 'CPC 0.04–0.12$',
      heat: 'hot',
      difficulty: 'easy',
      rating: 5,
      where_to_pour:
        'TikTok Ads Manager, Smart+/ручные ad groups. Возраст 18–34, Android heavy. Бюджет 30–60$/день на гео. Лить в пики вечера локального времени.',
      creatives:
        'Spark Ads с органики: сторис-стиль, «переписка», фейк-уведомления, красивые лица. Хук в первые 1–2 сек. 9:16 only.',
      landing_notes: 'Лёгкий преленд «зарегистрируйся бесплатно» / каталог анкет. Минимум форм — 1–2 поля.',
      offer_notes: 'SOI/DOI dating CPA/CPL. Смотри на EPC и % фейковых лидов у ПП.',
      risks: 'Модерация TikTok, фрод от ботов, каннибализация креативов через 3–5 дней.',
      checklist: '1) Business Center\n2) Pixel + Events API\n3) 8–12 креативов\n4) Kill rule: CPA > 1.5× payout',
      status: 'active',
      notes: 'Дешёвый объём, быстрый фидбек.',
    },
    {
      name: 'Google UAC → Utility App Tier-1',
      vertical: 'Mobile Apps',
      geo: 'US, UK, CA, AU',
      source: 'Google UAC',
      funnel: 'direct',
      payout_model: 'CPI',
      bid_hint: 'tCPI 0.8–2.5$',
      heat: 'warm',
      difficulty: 'hard',
      rating: 4,
      where_to_pour:
        'Google Ads App campaigns (UAC). Отдельные кампании Install / In-app. Стартуй с tCPI ≈ 70–80% от целевого. Креативы: 2–4 видео + HTML5 + статичные.',
      creatives:
        'Store-listing скрины + gameplay/утилита в деле. Без вводящих в заблуждение «cleaner» обещаний если политика Store жёсткая.',
      landing_notes: 'Direct to store / Play. Преленды редко — только если white-hat.',
      offer_notes: 'Ищи CPI с event payout (регистрация/покупка). MMP: AppsFlyer / Adjust — прокинь clickid в sub.',
      risks: 'Learning phase жрёт бюджет, Store reject, конкуренция big brand.',
      checklist: '1) MMP постбек\n2) Assets diversity\n3) Отдельный акк под vertical\n4) Дневной cap на learning',
      status: 'active',
      notes: 'Нужен объём и терпение к learning.',
    },
    {
      name: 'Taboola Native → Finance Loan PL',
      vertical: 'Finance',
      geo: 'PL',
      source: 'Taboola',
      funnel: 'article-preland',
      payout_model: 'CPL',
      bid_hint: 'CPC 0.08–0.20€',
      heat: 'warm',
      difficulty: 'medium',
      rating: 4,
      where_to_pour:
        'Taboola Native: новостные/финанс сайты PL. Бид по CPC, оптимизация на конверсии после 30–50 лидов. Исключай мусорные сайты через site list.',
      creatives:
        'Native thumbnails: «калькулятор кредита», «ставки упали», лица 40+. Заголовки без clickbait бана — иначе low CTR + бан.',
      landing_notes: 'Статья-преленд + форма заявки. Trust badges, калькулятор, короткая форма.',
      offer_notes: 'Локальные МФО/банки через ПП. Важен апрув и скорость ПБ.',
      risks: 'Высокий CPC на премах, реджект креативов, сезонность ставок.',
      checklist: '1) Brand safety\n2) Конверсионный пиксель Taboola\n3) Blacklist сайтов\n4) A/B заголовков',
      status: 'active',
      notes: 'Хорошо масштабируется на связке article → form.',
    },
    {
      name: 'Push → Gambling IN/BD',
      vertical: 'Gambling',
      geo: 'IN, BD',
      source: 'PropellerAds Push',
      funnel: 'direct',
      payout_model: 'RevShare / CPA',
      bid_hint: 'CPC 0.003–0.015$',
      heat: 'hot',
      difficulty: 'medium',
      rating: 4,
      where_to_pour:
        'Push-сети (Propeller, Push.house, RollerAds). Старт на CPC, потом оптимизация на CPA. Зоны с высоким CR выноси в whitelist. Бюджет 20–50$/день на тест.',
      creatives:
        'Иконка + текст: джекпот, «₹10,000 бонус», срочность. 10–20 вариаций. Локализация на Hindi/Bengali где уместно.',
      landing_notes: 'Часто direct-to-offer. Если преленд — мобильный, с бонусом и таймером.',
      offer_notes: 'Казино/betting с первым депозитом. Сравни First Deposit payout vs RevShare.',
      risks: 'Фрод, боты, выгорание пуш-подписок, жёсткие ТО у ПП.',
      checklist: '1) Антифрод правила\n2) Постбек deposit\n3) Whitelist зон\n4) Cap на новые зоны',
      status: 'active',
      notes: 'Объём дешёвый, маржа в фильтрации.',
    },
    {
      name: 'Facebook → Nutra Whitehat US Quiz',
      vertical: 'Nutra',
      geo: 'US',
      source: 'Facebook Ads',
      funnel: 'quiz',
      payout_model: 'CPA',
      bid_hint: 'CPC 0.6–1.4$',
      heat: 'warm',
      difficulty: 'hard',
      rating: 3,
      where_to_pour:
        'Только whitehat: нет medical claims в ads. Интересы health/supplements + lookalike покупателей. Conversion API обязателен. Бюджет от 100$/день.',
      creatives:
        'Lifestyle, отзывы без «cure», disclaimer. Видео-отзывы, carousels с продуктом.',
      landing_notes: 'Легальный квиз → VSL/продукт. HIPAA/claims compliance если бренд требует.',
      offer_notes: 'SS / Continuity офферы с высоким LTV. Смотри refund rate.',
      risks: 'Дорогие клики, Policy team Meta, chargebacks.',
      checklist: '1) CAPI + EMQ\n2) Юр. дисклеймеры\n3) Отдельный бренд-акк\n4) Крео без запрещёнки',
      status: 'active',
      notes: 'Дорого, но можно жить долго на одном акке.',
    },
    {
      name: 'Telegram Ads → Crypto CIS',
      vertical: 'Crypto',
      geo: 'RU, KZ, UZ',
      source: 'Telegram Ads',
      funnel: 'channel-preland',
      payout_model: 'CPL / CPA',
      bid_hint: 'CPM 4–12$',
      heat: 'warm',
      difficulty: 'medium',
      rating: 3,
      where_to_pour:
        'Telegram Ads в тематические каналы: инвестиции, трейдинг, новости. Старт на CPM, цель — подписка/регистрация. Тестируй 15–30 каналов.',
      creatives:
        'Короткий текст + эмодзи-структура, без прямого «гарантия дохода». Кнопка → бот или ленд.',
      landing_notes: 'Преленд-канал или бот с прогревом → оффер биржи/сигналов.',
      offer_notes: 'Биржи с KYC, сигнальные сервисы. Высокий холд и antifraud.',
      risks: 'Регуляторка, фрод, выгорание аудитории каналов.',
      checklist: '1) Белые креативы\n2) Трекинг deep-link\n3) Постбек регистрации\n4) Чёрный список каналов',
      status: 'active',
      notes: 'Работает при сильном прогреве в канале.',
    },
    {
      name: 'SEO Content → Nutra Evergreen',
      vertical: 'Nutra',
      geo: 'ES, IT, FR',
      source: 'SEO / Content',
      funnel: 'blog-preland',
      payout_model: 'CPA',
      bid_hint: 'organic',
      heat: 'cold',
      difficulty: 'hard',
      rating: 4,
      where_to_pour:
        'Органика: PBN / niche sites / guest posts под коммерческие и информационные запросы. Не «лей» бюджет в ads — строй ссылки и контент.',
      creatives: 'Не применимо. Фокус на title/H1 и сниппет CTR.',
      landing_notes: 'Обзоры, сравнения, «лучшие средства 2026». Внутренняя перелинковка на оффер.',
      offer_notes: 'Долгие офферы с стабильным апрувом. Один сайт — 1–2 оффера.',
      risks: 'Google updates, долгий ROI, копирайт/DMCA.',
      checklist: '1) Ядро запросов\n2) 10–20 статей\n3) Ссылочный план\n4) Трекинг позиций + CR',
      status: 'active',
      notes: 'Медленно, но пассив после индексации.',
    },
    {
      name: 'In-app / Offerwall → Sweepstakes Tier-3',
      vertical: 'Sweeps',
      geo: 'ID, PH, NG',
      source: 'Offerwall / In-App',
      funnel: 'direct',
      payout_model: 'CPL',
      bid_hint: 'CPI/CPL network rates',
      heat: 'warm',
      difficulty: 'easy',
      rating: 3,
      where_to_pour:
        'AdGate / AyeT / ironSource offerwalls. Объём большой, качество среднее. Фильтруй по device/OS и времени суток.',
      creatives: 'Сеть отдаёт свои креативы; готовь иконки/баннеры 300×250, 320×50.',
      landing_notes: 'Часто direct. Если ленд — супер-лёгкий mobile form.',
      offer_notes: 'Email/SOI sweeps. Следи за % валидных email.',
      risks: 'Низкое качество лидов, холды, внезапные стопы от ПП.',
      checklist: '1) Постбек lead\n2) Cap по источникам\n3) Ежедневный QC семпл',
      status: 'active',
      notes: 'Хорош для объёма и тестов офферов.',
    },
    {
      name: 'YouTube In-stream → Nutra VSL Tier-2',
      vertical: 'Nutra',
      geo: 'RO, HU, CZ',
      source: 'Google Ads YouTube',
      funnel: 'vsl',
      payout_model: 'CPA',
      bid_hint: 'CPV 0.02–0.06$ / CPC 0.15–0.35$',
      heat: 'warm',
      difficulty: 'medium',
      rating: 4,
      where_to_pour:
        'YouTube Video campaigns (in-stream skippable). Таргет по интересам health + custom intent. Отсекай children content. Бюджет 50–100$/день.',
      creatives:
        'VSL 45–90с: проблема → история → продукт → CTA. Hook 5с критичен. Субтитры обязательны.',
      landing_notes: 'VSL-ленд или продолжение видео + order form. Трекай view-through отдельно.',
      offer_notes: 'COD иногда живёт лучше prepaid на этих гео.',
      risks: 'Политика Google health, дорогой тест креатива, выгорание ролика.',
      checklist: '1) 3 ролика A/B\n2) Частотный кап\n3) Исключение placements\n4) Постбек sale',
      status: 'active',
      notes: 'Сильная связка когда ролик «залетает».',
    },
  ];

  const txBundles = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  txBundles(bundles);
  console.log(`Seeded ${bundles.length} arbitration bundles (связки).`);
}
