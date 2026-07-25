import { db } from '../db.js';

export function ensurePipelineSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL DEFAULT '',
      offer_input TEXT NOT NULL DEFAULT '{}',
      context TEXT NOT NULL DEFAULT '{}',
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      agent TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      depends_on TEXT NOT NULL DEFAULT '[]',
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      error TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run ON pipeline_steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
  `);
}

ensurePipelineSchema();

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function serializeRun(row) {
  if (!row) return null;
  return {
    ...row,
    offer_input: parseJson(row.offer_input, {}),
    context: parseJson(row.context, {}),
  };
}

export function serializeStep(row) {
  if (!row) return null;
  return {
    ...row,
    depends_on: parseJson(row.depends_on, []),
    input: parseJson(row.input_json, {}),
    output: parseJson(row.output_json, {}),
    input_json: undefined,
    output_json: undefined,
  };
}

export function createRun({ title, offerInput, steps }) {
  const insertRun = db.prepare(`
    INSERT INTO pipeline_runs (status, title, offer_input, context)
    VALUES ('pending', ?, ?, ?)
  `);
  const insertStep = db.prepare(`
    INSERT INTO pipeline_steps (run_id, agent, title, status, depends_on, sort_order)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `);

  const tx = db.transaction(() => {
    const info = insertRun.run(title || 'Offer launch', JSON.stringify(offerInput || {}), '{}');
    const runId = info.lastInsertRowid;
    steps.forEach((s, i) => {
      insertStep.run(runId, s.agent, s.title, JSON.stringify(s.dependsOn || []), i);
    });
    return runId;
  });

  return Number(tx());
}

export function listRuns(limit = 50) {
  return db
    .prepare(`SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT ?`)
    .all(limit)
    .map(serializeRun);
}

export function getRun(id) {
  const run = serializeRun(db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`).get(id));
  if (!run) return null;
  const steps = db
    .prepare(`SELECT * FROM pipeline_steps WHERE run_id = ? ORDER BY sort_order, id`)
    .all(id)
    .map(serializeStep);
  return { ...run, steps };
}

export function updateRun(id, patch) {
  const row = db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`).get(id);
  if (!row) return;
  const status = patch.status ?? row.status;
  const context =
    patch.context !== undefined ? JSON.stringify(patch.context) : row.context;
  const error = patch.error !== undefined ? patch.error : row.error;
  db.prepare(
    `UPDATE pipeline_runs SET status = ?, context = ?, error = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, context, error || '', id);
}

export function updateStep(id, patch) {
  const row = db.prepare(`SELECT * FROM pipeline_steps WHERE id = ?`).get(id);
  if (!row) return;
  db.prepare(
    `UPDATE pipeline_steps
     SET status = ?,
         input_json = ?,
         output_json = ?,
         error = ?,
         started_at = COALESCE(?, started_at),
         finished_at = COALESCE(?, finished_at)
     WHERE id = ?`,
  ).run(
    patch.status ?? row.status,
    patch.input !== undefined ? JSON.stringify(patch.input) : row.input_json,
    patch.output !== undefined ? JSON.stringify(patch.output) : row.output_json,
    patch.error !== undefined ? patch.error : row.error,
    patch.started_at ?? null,
    patch.finished_at ?? null,
    id,
  );
}

export function getSteps(runId) {
  return db
    .prepare(`SELECT * FROM pipeline_steps WHERE run_id = ? ORDER BY sort_order, id`)
    .all(runId)
    .map(serializeStep);
}
