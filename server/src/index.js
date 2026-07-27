import { loadEnv } from './lib/env.js';
import { createApp } from './app.js';

loadEnv();

const PORT = Number(process.env.PORT) || 3001;
const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ArbTrack server on http://0.0.0.0:${PORT}`);
});
