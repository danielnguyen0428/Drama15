import { z } from 'zod';

export const LlmProviderSchema = z.enum(['c', 's', 'other']);

export const SaveLlmSettingsInputSchema = z.object({
  provider: LlmProviderSchema.optional(),
  baseUrl: z.string().trim().url().max(512).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  apiKey: z.string().trim().min(1).optional(),
  clearApiKey: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32_768).optional(),
});

export type SaveLlmSettingsInput = z.input<typeof SaveLlmSettingsInputSchema>;

export type StoredLlmSettings = {
  userId: string;
  provider: z.infer<typeof LlmProviderSchema>;
  baseUrl: string;
  model: string;
  apiKeyCiphertext: string | null;
  temperature: number;
  maxTokens: number;
  updatedAt: string;
};

export type PublicLlmSettings = Omit<StoredLlmSettings, 'userId' | 'apiKeyCiphertext'> & {
  apiKeySet: boolean;
  apiKeyFingerprint: string;
  configured: boolean;
};

export type EffectiveLlmSettings = {
  provider: z.infer<typeof LlmProviderSchema>;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  updatedAt: string;
};

export type LlmSettingsErrorCode =
  | 'INVALID_INPUT'
  | 'BASE_URL_NOT_ALLOWED'
  | 'NOT_CONFIGURED'
  | 'SECRET_DECRYPT_FAILED'
  | 'STORAGE_ERROR';

export type LlmSettingsFailure = {
  success: false;
  error: {
    code: LlmSettingsErrorCode;
    message: string;
    recoverable: boolean;
  };
};

export type LlmSettingsResult<T> = { success: true; data: T } | LlmSettingsFailure;

export interface LlmSettingsRepository {
  findByUserId(userId: string): Promise<StoredLlmSettings | null>;
  upsert(row: StoredLlmSettings): Promise<void>;
}

export interface LlmSecretCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface LlmSettingsSpec {
  getPublic(userId: string): Promise<LlmSettingsResult<PublicLlmSettings>>;
  save(userId: string, input: SaveLlmSettingsInput): Promise<LlmSettingsResult<PublicLlmSettings>>;
  resolveDraft(userId: string, input: SaveLlmSettingsInput): Promise<LlmSettingsResult<EffectiveLlmSettings>>;
  resolve(userId: string): Promise<LlmSettingsResult<EffectiveLlmSettings>>;
}
