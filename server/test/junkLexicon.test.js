import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_TOOL_NEGATIVES,
  filterOfficeDocumentJunk,
  isOfficeDocumentJunk,
  junkLexiconForVertical,
  mergeNegatives,
} from '../src/lib/junkLexicon.js';
import { keywordsForAngle } from '../src/pipeline/agents/direct.js';

test('keeps loan-intent document phrases', () => {
  for (const p of [
    'займ по паспорту',
    'минимум документов',
    'займ без документов',
    'мало документов для займа',
    'документы для кредита',
  ]) {
    assert.equal(isOfficeDocumentJunk(p), false, p);
  }
});

test('drops office/PDF Wordstat bleed', () => {
  for (const p of [
    'ворлд документ',
    'прожиточный минимум документы',
    'преобразовать документ в пдф',
    'сжать документ пдф',
    'документ из пдф в ворд',
    'файлы для документов',
    'папка для документов',
    'пдф документ',
    'конвертер pdf word',
  ]) {
    assert.equal(isOfficeDocumentJunk(p), true, p);
  }
});

test('filterOfficeDocumentJunk splits kept/dropped', () => {
  const { kept, dropped } = filterOfficeDocumentJunk([
    'займ по паспорту',
    'минимум документов',
    'сжать документ пдф',
    'ворлд документ',
  ]);
  assert.deepEqual(
    kept.map((x) => (typeof x === 'string' ? x : x.phrase)),
    ['займ по паспорту', 'минимум документов'],
  );
  assert.ok(dropped.includes('сжать документ пдф'));
  assert.ok(dropped.includes('ворлд документ'));
});

test('fintech_loans negatives include document-tool tokens but not bare документ', () => {
  const negs = mergeNegatives([], 'fintech_loans');
  for (const n of DOCUMENT_TOOL_NEGATIVES.slice(0, 8)) {
    assert.ok(negs.includes(n), n);
  }
  assert.ok(!negs.includes('документ'));
  assert.match(junkLexiconForVertical('fintech_loans').note, /PDF|Word|office/i);
});

test('keywordsForAngle strips office junk from group', () => {
  const kws = keywordsForAngle(
    { id: 'passport' },
    {
      groups: {
        passport: ['займ по паспорту', 'минимум документов', 'сжать документ пдф', 'ворлд документ'],
      },
    },
    {},
  );
  assert.deepEqual(kws, ['займ по паспорту', 'минимум документов']);
});
