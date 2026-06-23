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
  provider: 'c' as const,
  baseUrl: 'https://api.xah.io/v1',
  model: 'mainnewnol/deepseek-v4-flash',
};

export type ManagedProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type LlmSettingsHandlerOptions = {
  additionalAllowedHosts?: string[];
  allowInsecureLocalhost?: boolean;
  managedProviders?: Partial<Record<'c' | 's', ManagedProviderConfig>>;
};

const MANAGED_PROVIDER_BASE_URLS = {
  c: 'https://api.xah.io/v1',
  s: 'https://api.shopaikey.com/v1',
} as const;

export class LlmSettingsHandler implements LlmSettingsSpec {
  private readonly managedProviders: Partial<Record<'c' | 's', ManagedProviderConfig>>;

  constructor(
    private readonly repository: LlmSettingsRepository,
    private readonly cipher: LlmSecretCipher,
    options: LlmSettingsHandlerOptions = {},
  ) {
    this.managedProviders = options.managedProviders ?? {};
    this.urlPolicyOptions = {
      additionalAllowedHosts: options.additionalAllowedHosts ?? [],
      allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
    };
  }

  private readonly urlPolicyOptions: {
    additionalAllowedHosts: string[];
    allowInsecureLocalhost: boolean;
  };

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
      const requestedBaseUrl = resolveBaseUrl(provider, value.baseUrl, current);
      const validatedUrl = validateLlmBaseUrl({
        provider,
        baseUrl: requestedBaseUrl,
        additionalHosts: this.urlPolicyOptions.additionalAllowedHosts,
        allowInsecureLocalhost: this.urlPolicyOptions.allowInsecureLocalhost,
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

    if (!row) {
      return this.resolveManagedDefault('c', DEFAULT_SETTINGS.model);
    }

    if (row.apiKeyCiphertext) {
      try {
        return {
          success: true,
          data: {
            provider: row.provider,
            baseUrl: row.baseUrl,
            model: row.model,
            apiKey: this.cipher.decrypt(row.apiKeyCiphertext),
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

    if (row.provider === 'c' || row.provider === 's') {
      return this.resolveManagedDefault(row.provider, row.model);
    }

    return {
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'Bạn chưa cấu hình LLM.',
        recoverable: true,
      },
    };
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
    const requestedBaseUrl = resolveBaseUrl(provider, value.baseUrl, current);
    const validatedUrl = validateLlmBaseUrl({
      provider,
      baseUrl: requestedBaseUrl,
      additionalHosts: this.urlPolicyOptions.additionalAllowedHosts,
      allowInsecureLocalhost: this.urlPolicyOptions.allowInsecureLocalhost,
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
    let apiKey = '';
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
      if (provider === 'c' || provider === 's') {
        return this.resolveManagedDefault(
          provider,
          value.model ?? current?.model ?? DEFAULT_SETTINGS.model,
        );
      }
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
        updatedAt: current?.updatedAt ?? '',
      },
    };
  }

  private toPublic(row: StoredLlmSettings): PublicLlmSettings {
    let apiKey = '';
    if (row.apiKeyCiphertext) apiKey = this.decryptPublicKey(row.apiKeyCiphertext);
    const managed = row.provider === 'c' || row.provider === 's'
      ? this.managedProviders[row.provider]
      : undefined;
    const configured = Boolean(
      apiKey
        || (managed && isManagedProviderReady(managed)),
    );
    return {
      provider: row.provider,
      model: row.model,
      updatedAt: row.updatedAt,
      apiKeySet: Boolean(apiKey),
      apiKeyFingerprint: fingerprint(apiKey),
      configured,
      ...(row.provider === 'other' ? { baseUrl: row.baseUrl } : {}),
    };
  }

  private resolveManagedDefault(
    provider: 'c' | 's',
    model: string,
  ): LlmSettingsResult<EffectiveLlmSettings> {
    const managed = this.managedProviders[provider];
    if (!managed || !isManagedProviderReady(managed)) {
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
        baseUrl: managed.baseUrl,
        model: model.trim() || managed.model,
        apiKey: managed.apiKey,
        updatedAt: '',
      },
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

function resolveBaseUrl(
  provider: StoredLlmSettings['provider'],
  requestedBaseUrl: string | undefined,
  current: StoredLlmSettings | null,
) {
  if (provider === 'c' || provider === 's') {
    return MANAGED_PROVIDER_BASE_URLS[provider];
  }
  if (requestedBaseUrl) return requestedBaseUrl;
  return current?.provider === 'other' ? current.baseUrl : DEFAULT_SETTINGS.baseUrl;
}

function isManagedProviderReady(config: ManagedProviderConfig) {
  const apiKey = config.apiKey.trim();
  return apiKey.length > 0 && apiKey !== 'dummy';
}
