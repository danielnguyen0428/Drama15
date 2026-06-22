import assert from 'node:assert/strict';
import test from 'node:test';

import { RouterClient } from '../../../src/modules/router/router-client.js';

test('user provider requests leave temperature and max tokens to the model defaults', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), { status: 200 });
  };

  try {
    const client = new RouterClient(() => ({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      source: 'user',
      temperature: 0.8,
      maxTokens: 8192,
    }));

    const result = await client.testConnection('gpt-4o-mini');

    assert.equal(result.ok, true);
    assert.equal('temperature' in requestBody, false);
    assert.equal('max_tokens' in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
