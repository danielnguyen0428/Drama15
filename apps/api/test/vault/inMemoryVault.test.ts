import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryVault,
  SCRUB_SENTINEL,
  VaultError,
  type SecretMaterial
} from '../../src/vault/index.js';

function freshApiKey(value = 'sk-live-12345'): SecretMaterial {
  return { kind: 'apiKey', value };
}

describe('InMemoryVault.useSecret', () => {
  it('invokes the registered factory exactly once per call', async () => {
    const vault = new InMemoryVault();
    const factory = vi.fn(freshApiKey);
    vault.register('router-llm', factory);

    await vault.useSecret('router-llm', async (secret) => {
      expect(secret.kind).toBe('apiKey');
      return null;
    });

    expect(factory).toHaveBeenCalledTimes(1);

    await vault.useSecret('router-llm', async () => null);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('passes a fresh per-call copy that does not share identity with the factory output and does not poison the factory on scrub', async () => {
    const vault = new InMemoryVault();
    const factoryOutputs: SecretMaterial[] = [];

    vault.register('omnivoice-tts', () => {
      const out: SecretMaterial = {
        kind: 'oauthClient',
        clientId: 'client-abc',
        clientSecret: 'shh-secret'
      };
      factoryOutputs.push(out);
      return out;
    });

    let identityCheck: { distinct: boolean; clientIdInside: string; secretInside: string } | undefined;

    await vault.useSecret('omnivoice-tts', async (secret) => {
      const factoryOutput = factoryOutputs[0]!;
      // Distinct object identity so scrubbing the closure copy does not
      // poison the registered factory's captured value.
      identityCheck = {
        distinct: secret !== factoryOutput,
        clientIdInside: secret.kind === 'oauthClient' ? secret.clientId : '',
        secretInside: secret.kind === 'oauthClient' ? secret.clientSecret : ''
      };
      return null;
    });

    expect(identityCheck).toBeDefined();
    expect(identityCheck!.distinct).toBe(true);
    expect(identityCheck!.clientIdInside).toBe('client-abc');
    expect(identityCheck!.secretInside).toBe('shh-secret');

    // The factory's captured object MUST still hold the original
    // credential — only the per-call copy is scrubbed.
    const factoryOutput = factoryOutputs[0];
    expect(factoryOutput).toBeDefined();
    if (factoryOutput?.kind === 'oauthClient') {
      expect(factoryOutput.clientId).toBe('client-abc');
      expect(factoryOutput.clientSecret).toBe('shh-secret');
    }
  });

  it('scrubs every string field on the per-call copy after the closure resolves', async () => {
    const vault = new InMemoryVault();
    vault.register('jwt-signing', () => ({
      kind: 'pem',
      key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
      passphrase: 'hunter2'
    }));

    let leaked: SecretMaterial | undefined;
    await vault.useSecret('jwt-signing', async (secret) => {
      leaked = secret;
      // While inside the closure the credential is still valid.
      expect(secret.kind).toBe('pem');
      if (secret.kind === 'pem') {
        expect(secret.key).toContain('BEGIN PRIVATE KEY');
        expect(secret.passphrase).toBe('hunter2');
      }
      return null;
    });

    expect(leaked).toBeDefined();
    if (leaked?.kind === 'pem') {
      expect(leaked.key).toBe(SCRUB_SENTINEL);
      expect(leaked.passphrase).toBe(SCRUB_SENTINEL);
    } else {
      throw new Error('expected pem material');
    }
  });

  it('scrubs apiKey material', async () => {
    const vault = new InMemoryVault();
    vault.register('router-llm', () => freshApiKey('sk-live-shh'));

    let leaked: SecretMaterial | undefined;
    await vault.useSecret('router-llm', async (secret) => {
      leaked = secret;
      return null;
    });

    expect(leaked?.kind).toBe('apiKey');
    if (leaked?.kind === 'apiKey') {
      expect(leaked.value).toBe(SCRUB_SENTINEL);
    }
  });

  it('re-throws errors from the closure and still scrubs the material', async () => {
    const vault = new InMemoryVault();
    vault.register('router-llm', () => freshApiKey());

    let leaked: SecretMaterial | undefined;
    const boom = new Error('boom');

    await expect(
      vault.useSecret('router-llm', async (secret) => {
        leaked = secret;
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(leaked?.kind).toBe('apiKey');
    if (leaked?.kind === 'apiKey') {
      expect(leaked.value).toBe(SCRUB_SENTINEL);
    }
  });

  it('throws VaultError(not_found) for unregistered ids', async () => {
    const vault = new InMemoryVault();
    await expect(
      vault.useSecret('router-llm', async () => null)
    ).rejects.toBeInstanceOf(VaultError);

    try {
      await vault.useSecret('router-llm', async () => null);
    } catch (err) {
      expect((err as VaultError).code).toBe('not_found');
    }
  });

  it('returns the value the closure resolved with', async () => {
    const vault = new InMemoryVault();
    vault.register('router-llm', () => freshApiKey());
    const result = await vault.useSecret('router-llm', async (secret) => {
      return secret.kind === 'apiKey' ? secret.value.length : -1;
    });
    expect(result).toBe('sk-live-12345'.length);
  });

  it('unregister removes the factory', async () => {
    const vault = new InMemoryVault();
    vault.register('router-llm', () => freshApiKey());
    expect(vault.unregister('router-llm')).toBe(true);
    await expect(
      vault.useSecret('router-llm', async () => null)
    ).rejects.toBeInstanceOf(VaultError);
    expect(vault.unregister('router-llm')).toBe(false);
  });
});
