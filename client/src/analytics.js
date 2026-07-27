const STORAGE_KEY = 'arbtrack_vid';

function makeKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function getVisitorKey() {
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!key || key.length < 8) {
      key = makeKey();
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    return makeKey();
  }
}

/** Record one site visit per browser session for a given path. */
export function trackSiteVisit(pathName) {
  try {
    const sessionFlag = `arbtrack_visit_${pathName}`;
    if (sessionStorage.getItem(sessionFlag)) return;
    sessionStorage.setItem(sessionFlag, '1');
  } catch {
    // ignore
  }

  const body = JSON.stringify({
    visitor_key: getVisitorKey(),
    path: pathName || '/',
  });

  // fire-and-forget; keepalive helps on navigation
  try {
    fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
