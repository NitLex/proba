import { loadEnv } from './lib/env.js';
import { createApp } from './app.js';
import { isOrchestratorMode } from './lib/appMode.js';

loadEnv();

const PORT = Number(process.env.PORT) || 3001;
const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ArbTrack server on http://0.0.0.0:${PORT}`);
});

// Ops Telegram alerts (tracker / full hosts only)
if (!isOrchestratorMode() && process.env.TELEGRAM_BOT_TOKEN) {
  const intervalMin = Math.max(5, Number(process.env.ALERTS_INTERVAL_MIN || 30) || 30);
  const tick = async () => {
    try {
      const { runOpsAlerts } = await import('./lib/opsAlerts.js');
      const r = await runOpsAlerts();
      if (r.sent > 0) console.log(`[alerts] sent=${r.sent}`);
    } catch (err) {
      console.warn('[alerts]', err.message);
    }
  };
  setTimeout(tick, 20_000);
  setInterval(tick, intervalMin * 60_000);
  console.log(`[alerts] enabled, every ${intervalMin} min`);
}
