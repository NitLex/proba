import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBriefCopy } from '../src/routes/pipelineIngest.js';

test('mergeBriefCopy patches titles/texts by angle_id', () => {
  const existing = [
    {
      angle_id: 'generic',
      titles: ['Pipeline Live'],
      texts: ['Pipeline Live. Оформление заявки онлайн.'],
      callouts: ['Выпуск зарубежной карты'],
    },
  ];
  const patched = mergeBriefCopy(existing, [
    {
      angle_id: 'generic',
      titles: ['Выпуск зарубежной карты', 'Зарубежная карта онлайн'],
      texts: [
        'Выпуск зарубежной карты онлайн. Оформление онлайн. Пополнение по СБП.',
        'Зарубежная карта: быстрый старт. Оформление онлайн.',
      ],
    },
  ]);
  assert.equal(patched.length, 1);
  assert.equal(patched[0].titles[0], 'Выпуск зарубежной карты');
  assert.match(patched[0].texts[0], /зарубежной карты/);
  assert.equal(patched[0].callouts[0], 'Выпуск зарубежной карты');
});

test('mergeBriefCopy truncates Title≤56 Text≤81', () => {
  const patched = mergeBriefCopy(
    [{ angle_id: 'generic', titles: ['a'], texts: ['b'] }],
    [
      {
        angle_id: 'generic',
        titles: ['x'.repeat(80)],
        texts: ['y'.repeat(120)],
      },
    ],
  );
  assert.equal(patched[0].titles[0].length, 56);
  assert.equal(patched[0].texts[0].length, 81);
});
