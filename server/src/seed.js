import { db } from './db.js';
import { makeCampaignKey } from './lib/tracking.js';
import { hashPassword } from './lib/auth.js';

const DEMO_USER = 'demo';
const DEMO_PASS = 'demo123';

function ensureDemoUser() {
  let user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(DEMO_USER);
  if (!user) {
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, email, telegram, is_admin) VALUES (?, ?, ?, ?, 1)`
      )
      .run(DEMO_USER, hashPassword(DEMO_PASS), 'demo@arbtrack.local', '@arbtrack_demo');
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(info.lastInsertRowid));
  } else {
    db.prepare(`UPDATE users SET is_admin = 1 WHERE username = ?`).run(DEMO_USER);
    // backfill profile for older demo users
    if (!user.email) {
      db.prepare(`UPDATE users SET email = ? WHERE id = ? AND (email IS NULL OR email = '')`).run(
        'demo@arbtrack.local',
        user.id
      );
    }
    if (!user.telegram) {
      db.prepare(
        `UPDATE users SET telegram = ? WHERE id = ? AND (telegram IS NULL OR telegram = '')`
      ).run('@arbtrack_demo', user.id);
    }
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  }

  // attach orphan rows from pre-auth installs
  db.prepare(`UPDATE traffic_sources SET user_id = ? WHERE user_id IS NULL`).run(user.id);
  db.prepare(`UPDATE offers SET user_id = ? WHERE user_id IS NULL`).run(user.id);
  db.prepare(`UPDATE landings SET user_id = ? WHERE user_id IS NULL`).run(user.id);
  db.prepare(`UPDATE campaigns SET user_id = ? WHERE user_id IS NULL`).run(user.id);

  return user;
}

const user = ensureDemoUser();
const count = db.prepare('SELECT COUNT(*) AS c FROM campaigns WHERE user_id = ?').get(user.id).c;
if (count > 0) {
  console.log('Database already seeded, skipping.');
  console.log(`Login: ${DEMO_USER} / ${DEMO_PASS}`);
  process.exit(0);
}

const insertSource = db.prepare(`
  INSERT INTO traffic_sources (user_id, name, postback_url, cost_param, currency, token1, token2, token3, notes)
  VALUES (@user_id, @name, @postback_url, @cost_param, @currency, @token1, @token2, @token3, @notes)
`);

const insertOffer = db.prepare(`
  INSERT INTO offers (user_id, name, url, payout, currency, geo, network, status, notes)
  VALUES (@user_id, @name, @url, @payout, @currency, @geo, @network, @status, @notes)
`);

const insertLanding = db.prepare(`
  INSERT INTO landings (user_id, name, url, notes)
  VALUES (@user_id, @name, @url, @notes)
`);

const insertCampaign = db.prepare(`
  INSERT INTO campaigns (user_id, name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
  VALUES (@user_id, @name, @key, @traffic_source_id, @offer_id, @landing_id, @cost_model, @cost_value, @status, @notes)
`);

const tx = db.transaction(() => {
  const fb = insertSource.run({
    user_id: user.id,
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
    user_id: user.id,
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
    user_id: user.id,
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
    user_id: user.id,
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
    user_id: user.id,
    name: 'Slim Preland DE',
    url: 'https://example-landings.test/slim-de/?cid={clickid}',
    notes: 'Use /to-offer?clickid={clickid} on CTA',
  });

  const key1 = makeCampaignKey();
  const key2 = makeCampaignKey();

  insertCampaign.run({
    user_id: user.id,
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
    user_id: user.id,
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
console.log(`Login: ${DEMO_USER} / ${DEMO_PASS}`);
console.log(`Campaign 1 click URL: /click/${key1}`);
console.log(`Campaign 2 click URL: /click/${key2}`);
console.log('Postback example: /postback?clickid=CLICKID&payout=45&status=sale');
