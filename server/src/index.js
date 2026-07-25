import { loadEnv } from './lib/env.js';

// Must load SECRETS.env / .env before app modules read process.env
loadEnv();

const { createApp } = await import('./app.js');

const PORT = Number(process.env.PORT) || 3001;
const app = createApp();

app.listen(PORT, () => {
  console.log(`ArbTrack server on http://localhost:${PORT}`);
});
