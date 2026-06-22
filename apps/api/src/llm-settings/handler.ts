import {
  SaveLlmSettingsInputSchema,
  type EffectiveLlmSettings,
  type LlmSecretCipher,
  type LlmSettingsFailure,
  type LlmSettingsRepository,
  type LlmSettingsResult,
  type LlmSettingsSpec,
  type PublicLlmSettings,
  type SaveLlmSettingsInput,
  type StoredLlmSettings,
} from './spec.js';
import { validateLlmBaseUrl } from './urlPolicy.js';

const DEFAULT_SETTINGS = {
  provider: 'other' as const,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.8,
  maxTokens: 8192,
};

type LlmSettingsHandlerOptions = {
  additionalAllowedHosts?: readonly string[];
  allowInsecureLocalhost?: boolean;
};

export class LlmSettingsHandler implements LlmSettingsSpec {
  constructor(
    private readonly repository: LlmSettingsRepository,
    private readonly cipher: LlmSecretCipher,
    private readonly options: LlmSettingsHandlerOptions = {},
  ) {}

  async getPublic(userId: string): Promise<LlmSettingsResult<PublicLlmSettings>> {
    try {
      const row = await this.repository.findByUserId(userId);
      if (!row) {
        return {
          success: true,
          data: this.toPublic({
            userId,
            ...DEFAULT_SETTINGS,
            apiKeyCiphertext: null,
            updatedAt: '',
          }),
        };
      }
      return { success: true, data: this.toPublic(row) };
    } catch (error) {
      if (error instanceof SecretDecryptError) return secretDecryptFailure();
      return storageFailure();
    }
  }

  async save(
    userId: string,
    input: SaveLlmSettingsInput,
  ): Promise<LlmSettingsResult<PublicLlmSettings>> {
    const parsed = SaveLlmSettingsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Cấu hình LLM không hợp lệ.',
          recoverable: true,
        },
      };
    }

    try {
      const current = await this.repository.findByUserId(userId);
      const value = parsed.data;
      const provider = value.provider ?? current?.provider ?? DEFAULT_SETTINGS.provider;
      const requestedBaseUrl = value.baseUrl ?? current?.baseUrl ?? DEFAULT_SETTINGS.baseUrl;
      const validatedUrl = validateLlmBaseUrl({
        provider,
        baseUrl: requestedBaseUrl,
        additionalHosts: this.options.additionalAllowedHosts,
        allowInsecureLocalhost: this.options.allowInsecureLocalhost,
      });
      if (validatedUrl.success === false) {
        return {
          success: false,
          error: {
            code: validatedUrl.error.code,
            message: validatedUrl.error.message,
            recoverable: true,
          },
        };
      }
      const scopeChanged = Boolean(
        current
          && (provider !== current.provider
            || new URL(validatedUrl.baseUrl).hostname !== new URL(current.baseUrl).hostname),
      );
      const row: StoredLlmSettings = {
        userId,
        provider,
        baseUrl: validatedUrl.baseUrl,
        model: value.model ?? current?.model ?? DEFAULT_SETTINGS.model,
        apiKeyCiphertext: value.clearApiKey || (scopeChanged && !value.apiKey)
          ? null
          : value.apiKey
            ? this.cipher.encrypt(value.apiKey)
            : current?.apiKeyCiphertext ?? null,
        temperature: value.temperature ?? current?.temperature ?? DEFAULT_SETTINGS.temperature,
        maxTokens: value.maxTokens ?? current?.maxTokens ?? DEFAULT_SETTINGS.maxTokens,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.upsert(row);
      return { success: true, data: this.toPublic(row) };
    } catch {
      return storageFailure();
    }
  }

  async resolve(userId: string): Promise<LlmSettingsResult<EffectiveLlmSettings>> {
    let row: StoredLlmSettings | null;
    try {
      row = await this.repository.findByUserId(userId);
    } catch {
      return storageFailure();
    }
    if (!row?.apiKeyCiphertext) {
      return {
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Bạn chưa cấu hình LLM.',
          recoverable: true,
        },
      };
    }

    try {
      return {
        success: true,
        data: {
          provider: row.provider,
          baseUrl: row.baseUrl,
          model: row.model,
          apiKey: this.cipher.decrypt(row.apiKeyCiphertext),
          temperature: row.temperature,
          maxTokens: row.maxTokens,
          updatedAt: row.updatedAt,
        },
      };
    } catch {
      return {
        success: false,
        error: {
          code: 'SECRET_DECRYPT_FAILED',
          message: 'Không thể đọc API key đã mã hóa.',
          recoverable: false,
        },
      };
    }
  }

  async resolveDraft(
    userId: string,
    input: SaveLlmSettingsInput,
  ): Promise<LlmSettingsResult<EffectiveLlmSettings>> {
    const parsed = SaveLlmSettingsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Cấu hình LLM không hợp lệ.',
          recoverable: true,
        },
      };
    }

    let current: StoredLlmSettings | null;
    try {
      current = await this.repository.findByUserId(userId);
    } catch {
      return storageFailure();
    }

    const value = parsed.data;
    const provider = value.provider ?? current?.provider ?? DEFAULT_SETTINGS.provider;
    const requestedBaseUrl = value.baseUrl ?? current?.baseUrl ?? DEFAULT_SETTINGS.baseUrl;
    const validatedUrl = validateLlmBaseUrl({
      provider,
      baseUrl: requestedBaseUrl,
      additionalHosts: this.options.additionalAllowedHosts,
      allowInsecureLocalhost: this.options.allowInsecureLocalhost,
    });
    if (validatedUrl.success === false) {
      return {
        success: false,
        error: {
          code: validatedUrl.error.code,
          message: validatedUrl.error.message,
          recoverable: true,
        },
      };
    }

    const scopeChanged = Boolean(
      current
        && (provider !== current.provider
          || new URL(validatedUrl.baseUrl).hostname !== new URL(current.baseUrl).hostname),
    );
    let apiKey = value.clearApiKey || scopeChanged ? '' : '';
    if (value.apiKey) {
      apiKey = value.apiKey;
    } else if (!value.clearApiKey && !scopeChanged && current?.apiKeyCiphertext) {
      try {
        apiKey = this.cipher.decrypt(current.apiKeyCiphertext);
      } catch {
        return {
          success: false,
          error: {
            code: 'SECRET_DECRYPT_FAILED',
            message: 'Không thể đọc API key đã mã hóa.',
            recoverable: false,
          },
        };
      }
    }
    if (!apiKey) {
      return {
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Bạn chưa cấu hình LLM.',
          recoverable: true,
        },
      };
    }

    return {
      success: true,
      data: {
        provider,
        baseUrl: validatedUrl.baseUrl,
        model: value.model ?? current?.model ?? DEFAULT_SETTINGS.model,
        apiKey,
        temperature: value.temperature ?? current?.temperature ?? DEFAULT_SETTINGS.temperature,
        maxTokens: value.maxTokens ?? current?.maxTokens ?? DEFAULT_SETTINGS.maxTokens,
        updatedAt: current?.updatedAt ?? '',
      },
    };
  }

  private toPublic(row: StoredLlmSettings): PublicLlmSettings {
    let apiKey = '';
    if (row.apiKeyCiphertext) apiKey = this.decryptPublicKey(row.apiKeyCiphertext);
    return {
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      updatedAt: row.updatedAt,
      apiKeySet: Boolean(apiKey),
      apiKeyFingerprint: fingerprint(apiKey),
      configured: Boolean(apiKey && row.baseUrl && row.model),
    };
  }

  private decryptPublicKey(ciphertext: string): string {
    try {
      return this.cipher.decrypt(ciphertext);
    } catch {
      throw new SecretDecryptError();
    }
  }
}

function fingerprint(apiKey: string) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return 'set';
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

function storageFailure(): LlmSettingsFailure {
  return {
    success: false,
    error: {
      code: 'STORAGE_ERROR',
      message: 'Không thể lưu hoặc tải cấu hình LLM.',
      recoverable: false,
    },
  };
}

function secretDecryptFailure(): LlmSettingsFailure {
  return {
    success: false,
    error: {
      code: 'SECRET_DECRYPT_FAILED',
      message: 'Không thể đọc API key đã mã hóa.',
      recoverable: false,
    },
  };
}

class SecretDecryptError extends Error {}
