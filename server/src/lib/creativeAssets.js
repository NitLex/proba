/**
 * Creative references + agent-produced assets for pipeline runs.
 * Files live under creatives/pipeline/ (gitignored).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pipelineRoot = path.resolve(__dirname, '../../../creatives/pipeline');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(s) {
  return String(s || 'img')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

function decodeDataUrlOrBase64(raw) {
  const s = String(raw || '');
  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], 'base64') };
  return { mime: null, buf: Buffer.from(s.replace(/\s+/g, ''), 'base64') };
}

export function creativesPipelineRoot() {
  return pipelineRoot;
}

export function runCreativesDir(runId) {
  return path.join(pipelineRoot, String(runId));
}

export function runReferencesDir(runId) {
  return path.join(runCreativesDir(runId), 'references');
}

/**
 * Persist uploaded reference images (base64) into a staging batch.
 * @returns {{ batch_id, files: Array<{ path, abs, name, mime, size, note? }> }}
 */
export function saveReferenceBatch(files = [], { note = '' } = {}) {
  if (!Array.isArray(files) || !files.length) {
    throw new Error('Нужен хотя бы один файл-референс');
  }
  if (files.length > MAX_FILES) {
    throw new Error(`Максимум ${MAX_FILES} референсов`);
  }

  const batchId = `ref-${nanoid(10)}`;
  const dir = path.join(pipelineRoot, 'uploads', batchId);
  ensureDir(dir);
  const out = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i] || {};
    const decoded = decodeDataUrlOrBase64(f.data_base64 || f.data || f.base64);
    let mime = String(f.mime || f.type || decoded.mime || '').toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error(`Недопустимый тип файла: ${mime || 'unknown'} (нужен jpg/png/webp)`);
    }
    if (!decoded.buf?.length) throw new Error(`Пустой файл #${i + 1}`);
    if (decoded.buf.length > MAX_BYTES) {
      throw new Error(`Файл #${i + 1} больше ${MAX_BYTES / 1024 / 1024} МБ`);
    }
    const ext = EXT_BY_MIME[mime] || path.extname(f.name || '') || '.jpg';
    const base = safeName(path.basename(f.name || `ref-${i + 1}`, ext)) || `ref-${i + 1}`;
    const filename = `${String(i + 1).padStart(2, '0')}-${base}${ext}`;
    const abs = path.join(dir, filename);
    fs.writeFileSync(abs, decoded.buf);
    const rel = path.relative(path.resolve(__dirname, '../../..'), abs);
    out.push({
      path: rel,
      abs,
      name: filename,
      original_name: f.name || filename,
      mime,
      size: decoded.buf.length,
      note: f.note || note || '',
      angle_hint: f.angle_id || f.angle_hint || null,
    });
  }

  const manifest = { batch_id: batchId, created_at: new Date().toISOString(), files: out };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { batch_id: batchId, files: out.map(({ abs, ...rest }) => rest) };
}

/** Copy a reference batch into run folder and return relative paths. */
export function materializeReferencesForRun(runId, batchId) {
  if (!batchId) return [];
  const srcDir = path.join(pipelineRoot, 'uploads', String(batchId));
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Референс-батч не найден: ${batchId}`);
  }
  const destDir = runReferencesDir(runId);
  ensureDir(destDir);
  const files = [];
  for (const name of fs.readdirSync(srcDir)) {
    if (name === 'manifest.json') continue;
    if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
    const absSrc = path.join(srcDir, name);
    const absDest = path.join(destDir, name);
    fs.copyFileSync(absSrc, absDest);
    const rel = path.relative(path.resolve(__dirname, '../../..'), absDest);
    let angleHint = null;
    try {
      const man = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
      const hit = (man.files || []).find((f) => f.name === name);
      angleHint = hit?.angle_hint || null;
    } catch {
      /* ignore */
    }
    files.push({
      path: rel,
      name,
      angle_hint: angleHint,
      role: 'reference',
    });
  }
  return files;
}

/** Also accept already-relative paths from offer payload. */
export function normalizeOfferReferences(offer = {}) {
  const list = [];
  const raw = offer.reference_images || offer.references || [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') list.push({ path: item, role: 'reference' });
      else if (item?.path) list.push({ ...item, role: item.role || 'reference' });
    }
  }
  return list;
}

/**
 * Map references onto angles as usable creative images (until agent upgrades them).
 */
export function referencesAsGeneratedImages(references = [], angles = []) {
  const refs = (references || []).filter((r) => r?.path);
  if (!refs.length) return [];
  const angleList = angles?.length ? angles : [{ id: 'generic' }];
  return refs.map((ref, i) => {
    const angle =
      angleList.find((a) => a.id && a.id === ref.angle_hint) ||
      angleList[i % angleList.length] ||
      { id: 'generic' };
    return {
      ok: true,
      provider: 'reference',
      angle_id: angle.id,
      path: ref.path,
      format: 'product',
      image_has_text: false,
      from_reference: true,
      note: ref.note || ref.original_name || ref.name || '',
    };
  });
}

export function createIngestToken() {
  const token = nanoid(24);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function verifyIngestToken(token, hash) {
  if (!token || !hash) return false;
  const got = crypto.createHash('sha256').update(String(token)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(String(hash)));
  } catch {
    return false;
  }
}

/**
 * Save agent/operator creatives into the run folder.
 * @returns {{ files: object[], generated_images: object[] }}
 */
export function attachCreativesToRun(runId, images = []) {
  if (!Array.isArray(images) || !images.length) {
    throw new Error('Нужен хотя бы один креатив');
  }
  if (images.length > MAX_FILES) throw new Error(`Максимум ${MAX_FILES} креативов`);

  const dir = runCreativesDir(runId);
  ensureDir(dir);
  const generated = [];
  const files = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i] || {};
    const decoded = decodeDataUrlOrBase64(img.data_base64 || img.data || img.base64);
    let mime = String(img.mime || img.type || decoded.mime || 'image/jpeg').toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error(`Недопустимый тип: ${mime}`);
    }
    if (!decoded.buf?.length) throw new Error(`Пустой креатив #${i + 1}`);
    if (decoded.buf.length > MAX_BYTES) {
      throw new Error(`Креатив #${i + 1} больше ${MAX_BYTES / 1024 / 1024} МБ`);
    }
    const ext = EXT_BY_MIME[mime] || '.jpg';
    const angleId = safeName(img.angle_id || img.angle || `angle-${i}`) || `angle-${i}`;
    const filename = `${angleId}-agent-${i}${ext}`;
    const abs = path.join(dir, filename);
    fs.writeFileSync(abs, decoded.buf);
    const rel = path.relative(path.resolve(__dirname, '../../..'), abs);
    const entry = {
      ok: true,
      provider: 'agent',
      angle_id: img.angle_id || angleId,
      path: rel,
      format: img.format || 'product',
      image_has_text: Boolean(img.image_has_text),
      from_agent: true,
    };
    generated.push(entry);
    files.push({ path: rel, name: filename, size: decoded.buf.length, angle_id: entry.angle_id });
  }

  const manifestPath = path.join(dir, 'agent-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ run_id: runId, updated_at: new Date().toISOString(), files, generated }, null, 2),
  );
  return { files, generated_images: generated };
}

export function mergeGeneratedImages(existing = [], incoming = []) {
  const byAngle = new Map();
  for (const g of existing || []) {
    if (g?.ok && g.path) byAngle.set(`${g.angle_id || 'generic'}::${g.path}`, g);
  }
  for (const g of incoming || []) {
    if (g?.ok && g.path) byAngle.set(`${g.angle_id || 'generic'}::${g.path}`, g);
  }
  // Prefer agent images over references for same angle
  const list = [...byAngle.values()];
  const preferred = [];
  const seenAngle = new Set();
  for (const g of list.filter((x) => x.provider === 'agent' || x.from_agent)) {
    preferred.push(g);
    if (g.angle_id) seenAngle.add(g.angle_id);
  }
  for (const g of list) {
    if (g.angle_id && seenAngle.has(g.angle_id)) continue;
    if (g.provider === 'agent' || g.from_agent) continue;
    preferred.push(g);
    if (g.angle_id) seenAngle.add(g.angle_id);
  }
  return preferred.length ? preferred : list;
}
