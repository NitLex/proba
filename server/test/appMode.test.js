import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appMode,
  appMeta,
  isOrchestratorMode,
  isTrackerMode,
  orchestratorPublicUrl,
  trackerPublicUrl,
  ORCHESTRATOR_BLOCKED_PATH_RE,
  TRACKER_BLOCKED_API_RE,
} from '../src/lib/appMode.js';

const KEYS = [
  'APP_MODE',
  'ORCHESTRATOR_PUBLIC_URL',
  'ARBTRACK_PUBLIC_URL',
  'PUBLIC_URL',
  'PIPELINE_TRACKER_MODE',
];

describe('appMode', () => {
  const prev = {};

  beforeEach(() => {
    for (const k of KEYS) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('defaults to full', () => {
    assert.equal(appMode(), 'full');
    assert.equal(isOrchestratorMode(), false);
    assert.equal(isTrackerMode(), false);
  });

  it('parses orchestrator aliases', () => {
    process.env.APP_MODE = 'orkestr';
    assert.equal(appMode(), 'orchestrator');
    assert.equal(isOrchestratorMode(), true);
  });

  it('parses tracker', () => {
    process.env.APP_MODE = 'tracker';
    assert.equal(isTrackerMode(), true);
  });

  it('builds public URLs for split deploy', () => {
    process.env.APP_MODE = 'orchestrator';
    process.env.ORCHESTRATOR_PUBLIC_URL = 'https://orkestr.online';
    process.env.ARBTRACK_PUBLIC_URL = 'https://trekerarbitrag.ru';
    assert.equal(orchestratorPublicUrl(), 'https://orkestr.online');
    assert.equal(trackerPublicUrl(), 'https://trekerarbitrag.ru');
    const meta = appMeta();
    assert.equal(meta.mode, 'orchestrator');
    assert.equal(meta.name, 'Orchestrator');
  });

  it('blocks traffic paths on orchestrator and pipeline on tracker', () => {
    assert.match('/click/abc', ORCHESTRATOR_BLOCKED_PATH_RE);
    assert.match('/postback', ORCHESTRATOR_BLOCKED_PATH_RE);
    assert.match('/preland/x', ORCHESTRATOR_BLOCKED_PATH_RE);
    assert.doesNotMatch('/api/pipeline/runs', ORCHESTRATOR_BLOCKED_PATH_RE);
    assert.match('/api/pipeline/runs', TRACKER_BLOCKED_API_RE);
    assert.doesNotMatch('/api/stats', TRACKER_BLOCKED_API_RE);
  });
});
