import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import type { LlmSecretCipher } from './spec.js';

export function createAesGcmCipher(serverSecret: string): LlmSecretCipher {
  const secret = serverSecret.trim();
  if (!secret) {
    throw new Error('LLM_SETTINGS_ENCRYPTION_KEY is required.');
  }
  const key = createHash('sha256').update(secret, 'utf8').digest();

  return {
    encrypt(plaintext: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      return [
        'v1',
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    },
    decrypt(ciphertext: string) {
      const [version, ivValue, tagValue, encryptedValue] = ciphertext.split('.');
      if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
        throw new Error('Unsupported encrypted API key format.');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
