import assert from 'node:assert/strict';
import test from 'node:test';

import { createAesGcmCipher } from './llm-settings/crypto.js';
import { LlmSettingsHandler } from './llm-settings/handler.js';
import { SupabaseLlmSettingsRepository } from './llm-settings/repository.js';
import { validateLlmBaseUrl } from './llm-settings/urlPolicy.js';
import type {
  LlmSecretCipher,
  LlmSettingsRepository,
  StoredLlmSettings,
} from './llm-settings/spec.js';

class MemorySettingsRepository implements LlmSettingsRepository {
  readonly rows = new Map<string, StoredLlmSettings>();

  async findByUserId(userId: string) {
    return this.rows.get(userId) ?? null;
  }

  async upsert(row: StoredLlmSettings) {
    this.rows.set(row.userId, row);
  }
}

const testCipher: LlmSecretCipher = {
  encrypt: (plaintext) => `encrypted:${plaintext}`,
  decrypt: (ciphertext) => ciphertext.replace(/^encrypted:/, ''),
};

test('LLM settings and secrets are isolated by authenticated user id', async () => {
  const repository = new MemorySettingsRepository();
  const handler = new LlmSettingsHandler(repository, testCipher);

  await handler.save('alice', {
    provider: 'other',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'alice-secret',
  });
  await handler.save('bob', {
    provider: 'other',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    apiKey: 'bob-secret',
  });

  const alice = await handler.resolve('alice');
  const bob = await handler.resolve('bob');

  assert.equal(alice.success, true);
  assert.equal(bob.success, true);
  if (!alice.success || !bob.success) return;
  assert.equal(alice.data.model, 'gpt-4o-mini');
  assert.equal(alice.data.apiKey, 'alice-secret');
  assert.equal(bob.data.model, 'anthropic/claude-sonnet-4');
  assert.equal(bob.data.apiKey, 'bob-secret');
});

test('API key is encrypted at rest and decrypts only with the server secret', () => {
  const cipher = createAesGcmCipher('server-secret-for-tests');
  const ciphertext = cipher.encrypt('sk-user-private-key');

  assert.doesNotMatch(ciphertext, /sk-user-private-key/);
  assert.equal(cipher.decrypt(ciphertext), 'sk-user-private-key');
  assert.throws(() => createAesGcmCipher('different-secret').decrypt(ciphertext));
});

test('URL policy blocks loopback provider endpoints', () => {
  const result = validateLlmBaseUrl({
    provider: 'other',
    baseUrl: 'http://127.0.0.1:11434/v1',
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, 'BASE_URL_NOT_ALLOWED');
});

test('changing provider scope without a new key clears the previous secret', async () => {
  const repository = new MemorySettingsRepository();
  const handler = new LlmSettingsHandler(repository, testCipher);
  await handler.save('alice', {
    provider: 'c',
    baseUrl: 'https://api.xah.io/v1',
    model: 'model-a',
    apiKey: 'provider-a-secret',
  });

  await handler.save('alice', {
    provider: 's',
    baseUrl: 'https://api.shopaikey.com/v1',
    model: 'model-b',
  });

  const resolved = await handler.resolve('alice');
  assert.equal(resolved.success, false);
  if (resolved.success) return;
  assert.equal(resolved.error.code, 'NOT_CONFIGURED');
});

test('public view reports decrypt failure instead of hiding a corrupt saved key', async () => {
  const repository = new MemorySettingsRepository();
  repository.rows.set('alice', {
    userId: 'alice',
    provider: 'other',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyCiphertext: 'broken-ciphertext',
    temperature: 0.8,
    maxTokens: 8192,
    updatedAt: '2026-06-22T00:00:00.000Z',
  });
  const handler = new LlmSettingsHandler(repository, {
    encrypt: testCipher.encrypt,
    decrypt: () => { throw new Error('bad ciphertext'); },
  });

  const result = await handler.getPublic('alice');

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, 'SECRET_DECRYPT_FAILED');
});

test('Supabase repository scopes reads and writes to the requested user id', async () => {
  let selectedUserId = '';
  let upsertedUserId = '';
  const storedRow = {
    user_id: 'alice',
    provider: 'other',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    api_key_ciphertext: 'encrypted:alice-secret',
    temperature: 0.8,
    max_tokens: 8192,
    updated_at: '2026-06-22T00:00:00.000Z',
  };
  const query = {
    select() { return this; },
    eq(_column: string, value: string) { selectedUserId = value; return this; },
    async maybeSingle() { return { data: storedRow, error: null }; },
    async upsert(row: { user_id: string }) { upsertedUserId = row.user_id; return { error: null }; },
  };
  const repository = new SupabaseLlmSettingsRepository({
    from: () => query,
  } as never);

  const row = await repository.findByUserId('alice');
  await repository.upsert({
    userId: 'bob',
    provider: 'other',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'model-b',
    apiKeyCiphertext: 'encrypted:bob-secret',
    temperature: 0.7,
    maxTokens: 4096,
    updatedAt: '2026-06-22T01:00:00.000Z',
  });

  assert.equal(selectedUserId, 'alice');
  assert.equal(row?.userId, 'alice');
  assert.equal(upsertedUserId, 'bob');
});
