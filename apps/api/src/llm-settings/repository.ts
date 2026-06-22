import type { SupabaseClient } from '@supabase/supabase-js';

import type { LlmSettingsRepository, StoredLlmSettings } from './spec.js';

type SettingsRow = {
  user_id: string;
  provider: StoredLlmSettings['provider'];
  base_url: string;
  model: string;
  api_key_ciphertext: string | null;
  temperature: number;
  max_tokens: number;
  updated_at: string;
};

const SETTINGS_COLUMNS = [
  'user_id',
  'provider',
  'base_url',
  'model',
  'api_key_ciphertext',
  'temperature',
  'max_tokens',
  'updated_at',
].join(',');

export class SupabaseLlmSettingsRepository implements LlmSettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByUserId(userId: string): Promise<StoredLlmSettings | null> {
    const { data, error } = await this.supabase
      .from('user_llm_settings')
      .select(SETTINGS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as unknown as SettingsRow) : null;
  }

  async upsert(row: StoredLlmSettings): Promise<void> {
    const { error } = await this.supabase
      .from('user_llm_settings')
      .upsert(toRow(row), { onConflict: 'user_id' });
    if (error) throw error;
  }
}

function fromRow(row: SettingsRow): StoredLlmSettings {
  return {
    userId: row.user_id,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    apiKeyCiphertext: row.api_key_ciphertext,
    temperature: Number(row.temperature),
    maxTokens: Number(row.max_tokens),
    updatedAt: row.updated_at,
  };
}

function toRow(row: StoredLlmSettings): SettingsRow {
  return {
    user_id: row.userId,
    provider: row.provider,
    base_url: row.baseUrl,
    model: row.model,
    api_key_ciphertext: row.apiKeyCiphertext,
    temperature: row.temperature,
    max_tokens: row.maxTokens,
    updated_at: row.updatedAt,
  };
}
