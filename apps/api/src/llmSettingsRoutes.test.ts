import assert from 'node:assert/strict';
import test from 'node:test';

import fastify from 'fastify';

import { LlmSettingsHandler } from './llm-settings/handler.js';
import { registerLlmSettingsRoutes } from './llm-settings/routes.js';
import type {
  LlmSecretCipher,
  LlmSettingsRepository,
  StoredLlmSettings,
} from './llm-settings/spec.js';

class MemoryRepository implements LlmSettingsRepository {
  readonly rows = new Map<string, StoredLlmSettings>();
  async findByUserId(userId: string) { return this.rows.get(userId) ?? null; }
  async upsert(row: StoredLlmSettings) { this.rows.set(row.userId, row); }
}

const cipher: LlmSecretCipher = {
  encrypt: (value) => `encrypted:${value}`,
  decrypt: (value) => value.replace(/^encrypted:/, ''),
};

test('settings API keeps two authenticated users isolated and never returns plaintext keys', async () => {
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler: new LlmSettingsHandler(new MemoryRepository(), cipher),
    authenticate: async (request, reply) => {
      const userId = request.headers['x-test-user'];
      if (typeof userId === 'string') return userId;
      await reply.code(401).send({ error: { code: 'unauthorized' } });
      return null;
    },
    testConnection: async () => ({ ok: true, detail: 'OK' }),
  });

  await app.inject({
    method: 'PUT',
    url: '/llm/settings',
    headers: { 'x-test-user': 'alice' },
    payload: {
      provider: 'other',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'alice-secret',
    },
  });
  await app.inject({
    method: 'PUT',
    url: '/llm/settings',
    headers: { 'x-test-user': 'bob' },
    payload: {
      provider: 'other',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'bob-secret',
    },
  });

  const alice = await app.inject({
    method: 'GET', url: '/llm/settings', headers: { 'x-test-user': 'alice' },
  });
  const bob = await app.inject({
    method: 'GET', url: '/llm/settings', headers: { 'x-test-user': 'bob' },
  });

  assert.equal(alice.statusCode, 200);
  assert.equal(bob.statusCode, 200);
  assert.equal(alice.json().model, 'gpt-4o-mini');
  assert.equal(bob.json().model, 'anthropic/claude-sonnet-4');
  assert.doesNotMatch(alice.body, /alice-secret|bob-secret|apiKeyCiphertext|temperature|maxTokens/);
  assert.doesNotMatch(bob.body, /alice-secret|bob-secret|apiKeyCiphertext|temperature|maxTokens/);
  await app.close();
});

test('connection test uses draft values without persisting them', async () => {
  const repository = new MemoryRepository();
  const handler = new LlmSettingsHandler(repository, cipher);
  await handler.save('alice', {
    provider: 'other',
    baseUrl: 'https://api.openai.com/v1',
    model: 'saved-model',
    apiKey: 'saved-secret',
  });
  let testedModel = '';
  let testedKey = '';
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler,
    authenticate: async () => 'alice',
    testConnection: async (settings) => {
      testedModel = settings.model;
      testedKey = settings.apiKey;
      return { ok: true, detail: 'OK' };
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/llm/settings/test',
    payload: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'draft-model',
      apiKey: 'draft-secret',
    },
  });
  const saved = await handler.resolve('alice');

  assert.equal(response.statusCode, 200);
  assert.equal(testedModel, 'draft-model');
  assert.equal(testedKey, 'draft-secret');
  assert.equal(saved.success, true);
  if (saved.success) assert.equal(saved.data.model, 'saved-model');
  await app.close();
});
