import test from 'node:test';
import assert from 'node:assert/strict';
import { moscowDateString, directStartDate } from '../src/lib/directDate.js';

test('moscowDateString uses Europe/Moscow calendar, not UTC', () => {
  // 2026-07-24 22:30 UTC = 2026-07-25 01:30 MSK
  const utcEvening = new Date('2026-07-24T22:30:00.000Z');
  assert.equal(utcEvening.toISOString().slice(0, 10), '2026-07-24');
  assert.equal(moscowDateString(utcEvening), '2026-07-25');
  assert.equal(directStartDate(utcEvening), '2026-07-25');
});

test('directStartDate matches Moscow when same civil day', () => {
  const noonUtc = new Date('2026-07-25T11:00:00.000Z');
  assert.equal(directStartDate(noonUtc), '2026-07-25');
});
