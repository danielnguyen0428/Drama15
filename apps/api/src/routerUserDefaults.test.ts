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

test('connectivity probe never forces response_format json_object', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  };

  try {
    const client = new RouterClient(() => ({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      source: 'user',
    }));

    const result = await client.testConnection('gpt-4o-mini');

    assert.equal(result.ok, true);
    // The probe prompt never mentions "json", so forcing json_object mode makes
    // strict providers reject it with a 400. The probe must not request it.
    assert.equal('response_format' in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completion retries without response_format when the provider rejects it with a 400', async () => {
  const originalFetch = globalThis.fetch;
  const sentBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sentBodies.push(body);
    // First attempt carries response_format -> provider rejects with 400.
    if ('response_format' in body) {
      return new Response(
        JSON.stringify({ error: { message: 'Unsupported parameter: response_format', code: 'invalid_request_error' } }),
        { status: 400 },
      );
    }
    // Retry without response_format succeeds.
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  };

  try {
    const client = new RouterClient(() => ({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      source: 'user',
    }));

    const result = await client.generateJson<{ ok: boolean }>({
      model: 'gpt-4o-mini',
      systemPrompt: 'Return only valid JSON.',
      userPrompt: 'Return JSON: {"ok": true}',
      temperature: 0.2,
    });

    assert.deepEqual(result.data, { ok: true });
    // Two calls: the rejected json_object attempt, then the successful retry.
    assert.equal(sentBodies.length, 2);
    assert.equal('response_format' in sentBodies[0], true);
    assert.equal('response_format' in sentBodies[1], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
