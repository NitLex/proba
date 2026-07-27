/**
 * Evaluate campaign routing rules (AND across conditions).
 * Supported fields: country, device, os, browser, bot, language, token1..token5, ip
 * Operators: eq, neq, contains, in, not_in, starts
 */
export function matchRule(rule, ctx) {
  const conditions = rule.conditions || [];
  if (!conditions.length) return false;
  return conditions.every((c) => matchCondition(c, ctx));
}

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

export function matchCondition(cond, ctx) {
  const field = String(cond.field || '');
  const op = String(cond.operator || 'eq');
  const expected = String(cond.value ?? '');
  let actual = '';

  switch (field) {
    case 'country':
      actual = ctx.country;
      break;
    case 'device':
      actual = ctx.device;
      break;
    case 'os':
      actual = ctx.os;
      break;
    case 'browser':
      actual = ctx.browser;
      break;
    case 'bot':
      actual = ctx.is_bot ? '1' : '0';
      break;
    case 'language':
      actual = ctx.language;
      break;
    case 'ip':
      actual = ctx.ip;
      break;
    case 'token1':
    case 'token2':
    case 'token3':
    case 'token4':
    case 'token5':
      actual = ctx[field];
      break;
    default:
      return false;
  }

  const a = norm(actual);
  const e = norm(expected);

  if (op === 'eq') return a === e;
  if (op === 'neq') return a !== e;
  if (op === 'contains') return a.includes(e);
  if (op === 'starts') return a.startsWith(e);
  if (op === 'in') {
    const list = expected.split(/[,;|]/).map((x) => norm(x)).filter(Boolean);
    return list.includes(a);
  }
  if (op === 'not_in') {
    const list = expected.split(/[,;|]/).map((x) => norm(x)).filter(Boolean);
    return !list.includes(a);
  }
  return false;
}

export function pickFirstMatchingRule(rules, ctx) {
  const ordered = [...(rules || [])]
    .filter((r) => r.enabled !== 0 && r.enabled !== false)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
  for (const rule of ordered) {
    if (matchRule(rule, ctx)) return rule;
  }
  return null;
}
