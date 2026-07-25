import test from 'node:test';
import assert from 'node:assert/strict';
import { moscowStartDate, moscowDateString } from '../src/lib/directDate.js';

test('UTC late evening must not produce Moscow yesterday', () => {
  const samples = [
    ['2026-07-25T20:59:00.000Z', '2026-07-25'],
    ['2026-07-25T21:00:00.000Z', '2026-07-26'],
    ['2026-07-25T22:30:00.000Z', '2026-07-26'],
    ['2026-07-26T00:00:00.000Z', '2026-07-26'],
  ];
  for (const [iso, expected] of samples) {
    assert.equal(moscowDateString(new Date(iso)), expected, iso);
    assert.equal(moscowStartDate(new Date(iso)), expected, iso);
  }
});
