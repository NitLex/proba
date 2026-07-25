import test from 'node:test';
import assert from 'node:assert/strict';

test('wordstatConfig detects missing keys', async () => {
  const prevKey = process.env.YANDEX_CLOUD_API_KEY;
  const prevFolder = process.env.YANDEX_CLOUD_FOLDER_ID;
  delete process.env.YANDEX_CLOUD_API_KEY;
  delete process.env.WORDSTAT_API_KEY;
  delete process.env.WORDSTAT_TOKEN;
  delete process.env.YANDEX_CLOUD_FOLDER_ID;
  delete process.env.WORDSTAT_FOLDER_ID;

  const { wordstatConfig } = await import('../src/lib/wordstat.js');
  assert.equal(wordstatConfig().configured, false);

  if (prevKey) process.env.YANDEX_CLOUD_API_KEY = prevKey;
  if (prevFolder) process.env.YANDEX_CLOUD_FOLDER_ID = prevFolder;
});

test('expandSeeds live path with mocked fetch', async () => {
  process.env.YANDEX_CLOUD_API_KEY = 'test-key';
  process.env.YANDEX_CLOUD_FOLDER_ID = 'folder-1';
  process.env.WORDSTAT_DELAY_MS = '0';
  process.env.WORDSTAT_MAX_SEEDS = '2';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        totalCount: '1200',
        results: [
          { phrase: 'виртуальная карта', count: '800' },
          { phrase: 'карта для путешествий', count: '400' },
        ],
        associations: [{ phrase: 'оплата за границей', count: '300' }],
      });
    },
  });

  try {
    // fresh module state not required — functions read env each call
    const { expandSeeds } = await import('../src/lib/wordstat.js');
    const res = await expandSeeds(['карта для путешествий']);
    assert.equal(res.mode, 'live');
    assert.ok(res.keywords.length >= 2);
    assert.ok(res.keywords.some((k) => k.phrase.includes('карта')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('launchCursorAgent uses v1 then returns agent url', async () => {
  process.env.CURSOR_API_KEY = 'cursor-test-key';
  process.env.CURSOR_REPO_URL = 'https://github.com/NitLex/proba';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/v1\/agents$/);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          agent: {
            id: 'bc-test-123',
            url: 'https://cursor.com/agents/bc-test-123',
          },
          run: { id: 'run-1' },
        });
      },
    };
  };

  try {
    const { launchCursorAgent } = await import('../src/lib/cursorAgents.js');
    const res = await launchCursorAgent({ prompt: 'Do something useful', name: 'Test' });
    assert.equal(res.ok, true);
    assert.equal(res.api, 'v1');
    assert.equal(res.agent_id, 'bc-test-123');
    assert.match(res.url, /bc-test-123/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('spawnCursorForPipelineSteps launches allowed agents only', async () => {
  process.env.CURSOR_API_KEY = 'cursor-test-key';
  process.env.CURSOR_REPO_URL = 'https://github.com/NitLex/proba';

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          agent: { id: `bc-${calls}`, url: `https://cursor.com/agents/bc-${calls}` },
        });
      },
    };
  };

  try {
    const { spawnCursorForPipelineSteps } = await import('../src/lib/cursorAgents.js');
    const res = await spawnCursorForPipelineSteps(
      [
        {
          id: 1,
          agent: 'analyst',
          status: 'done',
          title: 'A',
          output: { cursor_prompt: 'analyst prompt' },
        },
        {
          id: 2,
          agent: 'creative',
          status: 'done',
          title: 'C',
          output: { cursor_prompt: 'creative prompt', summary: 'ok' },
        },
        {
          id: 3,
          agent: 'direct',
          status: 'done',
          title: 'D',
          output: { cursor_prompt: 'direct prompt' },
        },
      ],
      { agents: ['creative', 'direct'] },
    );
    assert.equal(res.launches.length, 2);
    assert.equal(calls, 2);
    assert.ok(res.launches.every((l) => l.ok));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
