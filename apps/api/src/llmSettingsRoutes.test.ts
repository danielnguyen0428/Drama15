import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const managedProviders = {
  c: {
    baseUrl: 'https://api.xah.io/v1',
    apiKey: 'managed-c-secret',
    model: 'tanynguyen97/deepseek-v4-flash [cheap]',
  },
};

function createHandler(repository: LlmSettingsRepository) {
  return new LlmSettingsHandler(repository, cipher, { managedProviders });
}

test('public health response never exposes the server router base URL', () => {
  const startSource = readFileSync(new URL('./startDev.ts', import.meta.url), 'utf8');
  const healthRoute = startSource.match(/app\.get\('\/healthz'[\s\S]*?\n\}\)\);/)?.[0] ?? '';

  assert.notEqual(healthRoute, '');
  assert.doesNotMatch(healthRoute, /routerBaseUrl/);
});

test('provider catalog never exposes managed provider base URLs', async () => {
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler: createHandler(new MemoryRepository()),
    authenticate: async () => 'alice',
    testConnection: async () => ({ ok: true, detail: 'OK' }),
  });

  const response = await app.inject({ method: 'GET', url: '/llm/providers' });
  const catalog = response.json() as {
    presets: Array<{ provider: string; baseUrl?: string }>;
  };

  assert.equal(response.statusCode, 200);
  assert.equal(catalog.presets.find((preset) => preset.provider === 'c')?.baseUrl, undefined);
  assert.equal(catalog.presets.find((preset) => preset.provider === 's')?.baseUrl, undefined);
  assert.doesNotMatch(response.body, /api\.xah\.io|shopaikey\.com/);
  await app.close();
});

test('settings API never serializes a managed provider base URL', async () => {
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler: createHandler(new MemoryRepository()),
    authenticate: async () => 'alice',
    testConnection: async () => ({ ok: true, detail: 'OK' }),
  });

  const saved = await app.inject({
    method: 'PUT',
    url: '/llm/settings',
    payload: {
      provider: 'c',
      model: 'model-a',
      apiKey: 'provider-a-secret',
    },
  });
  const loaded = await app.inject({ method: 'GET', url: '/llm/settings' });

  assert.equal(saved.statusCode, 200);
  assert.equal(loaded.statusCode, 200);
  assert.equal('baseUrl' in saved.json(), false);
  assert.equal('baseUrl' in loaded.json(), false);
  assert.doesNotMatch(`${saved.body}${loaded.body}`, /api\.xah\.io|shopaikey\.com/);
  await app.close();
});

test('settings API exposes managed defaults without serializing the server API key', async () => {
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler: createHandler(new MemoryRepository()),
    authenticate: async () => 'alice',
    testConnection: async () => ({ ok: true, detail: 'OK' }),
  });

  const loaded = await app.inject({ method: 'GET', url: '/llm/settings' });

  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.json().provider, 'c');
  assert.equal(loaded.json().model, 'tanynguyen97/deepseek-v4-flash [cheap]');
  assert.equal(loaded.json().configured, true);
  assert.equal(loaded.json().apiKeySet, false);
  assert.doesNotMatch(loaded.body, /managed-c-secret|sk-/);
  await app.close();
});

test('settings API keeps two authenticated users isolated and never returns plaintext keys', async () => {
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler: createHandler(new MemoryRepository()),
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

test('connection test uses draft values for the probe itself', async () => {
  const repository = new MemoryRepository();
  const handler = createHandler(repository);
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

  assert.equal(response.statusCode, 200);
  assert.equal(testedModel, 'draft-model');
  assert.equal(testedKey, 'draft-secret');
  await app.close();
});

test('a successful connection test persists the draft so story generation reads the same key', async () => {
  const repository = new MemoryRepository();
  const handler = createHandler(repository);
  await handler.save('alice', {
    provider: 'other',
    baseUrl: 'https://api.openai.com/v1',
    model: 'saved-model',
    apiKey: 'saved-secret',
  });
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler,
    authenticate: async () => 'alice',
    testConnection: async () => ({ ok: true, detail: 'OK' }),
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
  assert.equal(response.json().ok, true);
  assert.equal(saved.success, true);
  // The tested draft is now the persisted settings — this is the fix: a user
  // who tests a new key and never presses the separate Save button no longer
  // has story generation silently fall back to the old saved key.
  if (saved.success) {
    assert.equal(saved.data.model, 'draft-model');
    assert.equal(saved.data.apiKey, 'draft-secret');
  }
  await app.close();
});

test('a failing connection test does not overwrite the previously saved working key', async () => {
  const repository = new MemoryRepository();
  const handler = createHandler(repository);
  await handler.save('alice', {
    provider: 'other',
    baseUrl: 'https://api.openai.com/v1',
    model: 'saved-model',
    apiKey: 'saved-secret',
  });
  const app = fastify();
  registerLlmSettingsRoutes(app, {
    handler,
    authenticate: async () => 'alice',
    testConnection: async () => ({ ok: false, detail: 'Router returned HTTP 401. API key không đúng.' }),
  });

  const response = await app.inject({
    method: 'POST',
    url: '/llm/settings/test',
    payload: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'bad-model',
      apiKey: 'bad-secret',
    },
  });
  const saved = await handler.resolve('alice');

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, false);
  assert.equal(saved.success, true);
  if (saved.success) assert.equal(saved.data.model, 'saved-model');
  await app.close();
});
