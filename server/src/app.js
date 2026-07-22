import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import './db.js';
import trackRouter from './routes/track.js';
import postbackRouter from './routes/postback.js';
import campaignsRouter from './routes/campaigns.js';
import statsRouter from './routes/stats.js';
import authRouter from './routes/auth.js';
import { crudRouter } from './routes/crud.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'ArbTrack', version: '1.0.0' });
  });

  app.use('/api/auth', authRouter);

  // Public tracking endpoints (must stay open for ads & affiliate networks)
  app.use(trackRouter);
  app.use(postbackRouter);

  // Protected dashboard API
  app.use('/api', requireAuth);
  app.use('/api/campaigns', campaignsRouter);
  app.use(
    '/api/offers',
    crudRouter('offers', {
      createFields: ['name', 'url', 'payout', 'currency', 'geo', 'network', 'status', 'notes'],
      updateFields: ['name', 'url', 'payout', 'currency', 'geo', 'network', 'status', 'notes'],
    })
  );
  app.use(
    '/api/landings',
    crudRouter('landings', {
      createFields: ['name', 'url', 'notes'],
      updateFields: ['name', 'url', 'notes'],
    })
  );
  app.use(
    '/api/sources',
    crudRouter('traffic_sources', {
      createFields: [
        'name',
        'postback_url',
        'cost_param',
        'currency',
        'token1',
        'token2',
        'token3',
        'token4',
        'token5',
        'notes',
      ],
      updateFields: [
        'name',
        'postback_url',
        'cost_param',
        'currency',
        'token1',
        'token2',
        'token3',
        'token4',
        'token5',
        'notes',
      ],
    })
  );
  app.use('/api/stats', statsRouter);

  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/click') ||
        req.path.startsWith('/postback') ||
        req.path.startsWith('/to-offer')
      ) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });

  return app;
}
