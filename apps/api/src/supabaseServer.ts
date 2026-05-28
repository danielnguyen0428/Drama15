import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../../src/lib/env.js';
import { getVietnamUsageDate, parseUserTier, resolveStoryQuotaLimit, type UserTier } from '../../../src/modules/auth/quota.js';

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  tier: UserTier;
};

export type QuotaSnapshot = {
  usageDate: string;
  used: number;
  limit: number;
  remaining: number;
};

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (cachedAdminClient) return cachedAdminClient;
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Supabase server credentials are not configured.');
  }

  cachedAdminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdminClient;
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedUser | null> {
  const token = readBearerToken(request.headers.authorization) || readQueryAccessToken(request.query);
  if (!token) {
    void reply.code(401).send({ error: { code: 'unauthorized', message: 'Vui lòng đăng nhập bằng Google để tiếp tục.' } });
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      void reply.code(401).send({ error: { code: 'unauthorized', message: 'Phiên đăng nhập không hợp lệ.' } });
      return null;
    }

    return await syncUserProfile(data.user);
  } catch (error) {
    request.log.error({ error }, 'auth failed');
    void reply.code(500).send({ error: { code: 'auth_unavailable', message: 'Không thể xác thực phiên đăng nhập.' } });
    return null;
  }
}

export async function syncUserProfile(user: User): Promise<AuthenticatedUser> {
  const supabase = getSupabaseAdmin();
  const email = user.email ?? '';
  const displayName = readMetadataString(user, 'full_name') || readMetadataString(user, 'name') || email;
  const avatarUrl = readMetadataString(user, 'avatar_url') || readMetadataString(user, 'picture') || undefined;

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      id: user.id,
      email,
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id,email,display_name,avatar_url,tier')
    .single();

  if (error || !data) {
    throw error ?? new Error('Profile sync failed.');
  }

  return {
    id: String(data.id),
    email: String(data.email ?? email),
    displayName: String(data.display_name ?? displayName),
    avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
    tier: parseUserTier(String(data.tier ?? 'free')),
  };
}

export async function getQuotaSnapshot(user: AuthenticatedUser): Promise<QuotaSnapshot> {
  const supabase = getSupabaseAdmin();
  const usageDate = getVietnamUsageDate();
  const limit = resolveStoryQuotaLimit(user.tier);
  const { data, error } = await supabase
    .from('story_usage_days')
    .select('created_count')
    .eq('user_id', user.id)
    .eq('usage_date', usageDate)
    .maybeSingle();

  if (error) throw error;

  const used = Number(data?.created_count ?? 0);
  return { usageDate, used, limit, remaining: Math.max(limit - used, 0) };
}

export async function consumeStoryQuota(user: AuthenticatedUser): Promise<QuotaSnapshot & { allowed: boolean }> {
  const supabase = getSupabaseAdmin();
  const usageDate = getVietnamUsageDate();
  const limit = resolveStoryQuotaLimit(user.tier);
  const { data, error } = await supabase.rpc('consume_story_quota', {
    p_user_id: user.id,
    p_usage_date: usageDate,
    p_quota_limit: limit,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const used = Number(row?.created_count ?? 0);
  const allowed = Boolean(row?.allowed);
  return { usageDate, used, limit, remaining: Math.max(limit - used, 0), allowed };
}

export function isAdminRequest(request: FastifyRequest) {
  const apiKey = request.headers['x-admin-api-key'];
  return Boolean(env.adminApiKey && typeof apiKey === 'string' && apiKey === env.adminApiKey);
}

function readBearerToken(value: string | undefined) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function readQueryAccessToken(query: unknown) {
  if (!query || typeof query !== 'object') return '';
  const value = (query as Record<string, unknown>).access_token;
  return typeof value === 'string' ? value.trim() : '';
}

function readMetadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' ? value : '';
}
