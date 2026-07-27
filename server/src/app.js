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
import settingsRouter from './routes/settings.js';
import analyticsRouter, { recordSiteVisit } from './routes/analytics.js';
import pipelineRouter from './routes/pipeline.js';
import bundlesRouter from './routes/bundles.js';
import { crudRouter } from './routes/crud.js';
import { requireAuth } from './middleware/auth.js';
import { prelandFilePath, PRELAND_DIR } from './lib/preland.js';
import {
  appMeta,
  isOrchestratorMode,
  isTrackerMode,
  ORCHESTRATOR_BLOCKED_PATH_RE,
  TRACKER_BLOCKED_API_RE,
} from './lib/appMode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const meta = appMeta();

  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Mode guards: orchestrator must not serve ad traffic; tracker can hide pipeline
  app.use((req, res, next) => {
    if (isOrchestratorMode() && ORCHESTRATOR_BLOCKED_PATH_RE.test(req.path)) {
      return res.status(404).json({
        error: 'Этот хост — оркестратор. Клики/постбэки только на трекере.',
        tracker: meta.tracker_public_url,
      });
    }
    if (isTrackerMode() && TRACKER_BLOCKED_API_RE.test(req.path)) {
      return res.status(404).json({
        error: 'Pipeline на этом хосте выключен (APP_MODE=tracker). Используй оркестратор.',
        orchestrator: meta.orchestrator_public_url,
      });
    }
    return next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: meta.name, version: '1.0.0', app: meta });
  });

  // Token-gated creative ingest (Cursor agent uploads images; no user session)
  app.post('/api/pipeline/ingest-creatives', async (req, res) => {
    if (isTrackerMode()) {
      return res.status(404).json({
        error: 'ingest только на оркестраторе',
        orchestrator: meta.orchestrator_public_url,
      });
    }
    try {
      const { ingestCreativesHandler } = await import('./routes/pipelineIngest.js');
      await ingestCreativesHandler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'ingest failed' });
    }
  });

  app.use('/api/auth', authRouter);
  app.post('/api/analytics/visit', recordSiteVisit);

  // Public tracking endpoints (must stay open for ads & affiliate networks)
  if (!isOrchestratorMode()) {
    app.use(trackRouter);
    app.use(postbackRouter);

    // Optional local fallback for prelands (primary host is GitHub Pages)
    app.use('/preland-assets', express.static(path.join(PRELAND_DIR, 'assets'), { maxAge: '7d' }));
    app.get('/preland/:slug', (req, res) => {
      const file = prelandFilePath(req.params.slug);
      if (!file) return res.status(404).send('Preland not found');
      res.type('html').sendFile(file);
    });
  }

  // Protected dashboard API
  app.use('/api', requireAuth);
  app.use('/api/analytics', analyticsRouter);
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
  app.use('/api/settings', settingsRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/bundles', bundlesRouter);

  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    // Distinct tab icon / title before SPA boots (avoid tracker green triangle on orkestr)
    app.get('/favicon.svg', (req, res) => {
      const file = isOrchestratorMode()
        ? path.join(clientDist, 'favicon-orchestrator.svg')
        : path.join(clientDist, 'favicon.svg');
      if (!fs.existsSync(file)) return res.status(404).end();
      res.type('image/svg+xml').sendFile(file);
    });

    app.use(express.static(clientDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/click') ||
        req.path.startsWith('/postback') ||
        req.path.startsWith('/to-offer') ||
        req.path.startsWith('/preland')
      ) {
        return next();
      }
      const indexPath = path.join(clientDist, 'index.html');
      if (!isOrchestratorMode()) {
        return res.sendFile(indexPath);
      }
      try {
        let html = fs.readFileSync(indexPath, 'utf8');
        html = html
          .replace(
            /<title>[^<]*<\/title>/,
            '<title>Orkestr.online — оркестратор</title>'
          )
          .replace(
            /href="\/favicon\.svg"/,
            'href="/favicon-orchestrator.svg"'
          );
        res.type('html').send(html);
      } catch {
        res.sendFile(indexPath);
      }
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });

  return app;
}
