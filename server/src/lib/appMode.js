/**
 * App deployment mode: full monolith | orchestrator-only | tracker-only.
 *
 * APP_MODE=orchestrator  → orkestr.online (pipeline + Direct/LeadGid/Cursor)
 * APP_MODE=tracker       → trekerarbitrag.ru (clicks/postbacks/stats)
 * APP_MODE=full          → both (default / local dev)
 */

export function appMode() {
  const raw = String(process.env.APP_MODE || 'full').toLowerCase().trim();
  if (raw === 'orchestrator' || raw === 'orkestr' || raw === 'pipeline') return 'orchestrator';
  if (raw === 'tracker' || raw === 'track') return 'tracker';
  return 'full';
}

export function isOrchestratorMode() {
  return appMode() === 'orchestrator';
}

export function isTrackerMode() {
  return appMode() === 'tracker';
}

/** Public URL of this orchestrator host (creative ingest, operator UI). */
export function orchestratorPublicUrl() {
  const explicit = String(process.env.ORCHESTRATOR_PUBLIC_URL || '').replace(/\/$/, '');
  if (explicit) return explicit;
  if (isOrchestratorMode()) {
    return String(process.env.PUBLIC_URL || 'https://orkestr.online').replace(/\/$/, '');
  }
  return String(process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '');
}

/** Public tracker URL used for click/postback links in ads. */
export function trackerPublicUrl() {
  return String(process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '');
}

export function appMeta() {
  const mode = appMode();
  return {
    mode,
    name: mode === 'orchestrator' ? 'Orchestrator' : mode === 'tracker' ? 'ArbTrack' : 'ArbTrack',
    tracker_public_url: trackerPublicUrl(),
    orchestrator_public_url: orchestratorPublicUrl(),
    pipeline_tracker_mode: String(process.env.PIPELINE_TRACKER_MODE || '').toLowerCase() || null,
  };
}

/** Paths blocked on orchestrator host (traffic must hit tracker domain). */
export const ORCHESTRATOR_BLOCKED_PATH_RE =
  /^\/(click|postback|to-offer)(\/|$)|^\/preland\//;

/** API prefixes blocked on tracker-only host (optional hardening). */
export const TRACKER_BLOCKED_API_RE = /^\/api\/pipeline(\/|$)/;
