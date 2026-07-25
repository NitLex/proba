/**
 * LeadGid postback template for ArbTrack.
 * LeadGid UI/API не даёт нам поставить постбэк программно — оператор копирует вручную.
 */

export function publicTrackerBase() {
  return (
    process.env.ARBTRACK_PUBLIC_URL ||
    process.env.ARBTRACK_LOCAL_URL ||
    'https://trekerarbitrag.ru'
  ).replace(/\/$/, '');
}

/** Canonical LeadGid → ArbTrack postback URL (macros as LeadGid expects). */
export function buildLeadgidPostbackUrl(base = publicTrackerBase()) {
  const b = String(base || publicTrackerBase()).replace(/\/$/, '');
  return `${b}/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}`;
}

export function leadgidPostbackInstructions(postbackUrl) {
  const url = postbackUrl || buildLeadgidPostbackUrl();
  return {
    network: 'LeadGid',
    manual: true,
    reason: 'LeadGid не даёт выставить постбэк через наш API — вставь вручную в кабинете оффера',
    where: 'LeadGid → оффер → Postback / Global postback (или Instrument → Postbacks)',
    url,
    macros: [
      { leadgid: '{aff_sub}', arbtrack: 'clickid' },
      { leadgid: '{payout}', arbtrack: 'payout' },
      { leadgid: '{status}', arbtrack: 'status' },
      { leadgid: '{transaction_id}', arbtrack: 'txid' },
    ],
    offer_url_must_contain: 'aff_sub={clickid}',
    note: 'В ссылке оффера должен быть aff_sub={clickid}, иначе clickid в постбеке будет пустым',
  };
}
