import type { SupabaseClient } from '@supabase/supabase-js';

import type { RelationshipGraph, StoryPayload } from '../../../src/types/story.js';
import type { AuthenticatedUser } from './supabaseServer.js';

export type StoredStoryStatus = 'queued' | 'running' | 'completed' | 'failed';

export type StoredStorySummary = {
  id: string;
  title: string;
  status: StoredStoryStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  chapterCount: number;
  error?: string;
};

export type StoredStoryDetail = StoredStorySummary & {
  config: unknown;
  storyPayload?: StoryPayload;
  relationshipGraph?: RelationshipGraph;
};

export class StoryStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async markStaleRunningStoriesFailed() {
    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();
    await this.supabase
      .from('stories')
      .update({
        status: 'failed',
        error: 'Phiên viết trước đó bị gián đoạn khi API khởi động lại.',
        updated_at: new Date().toISOString(),
      })
      .in('status', ['queued', 'running'])
      .lt('updated_at', cutoff);
  }

  async createQueuedStory(params: {
    id: string;
    user: AuthenticatedUser;
    title: string;
    config: unknown;
    request: unknown;
  }) {
    const { error } = await this.supabase.from('stories').insert({
      id: params.id,
      user_id: params.user.id,
      title: params.title,
      status: 'queued',
      config: params.config,
      request: params.request,
    });

    if (error) throw error;
  }

  async listStories(user: AuthenticatedUser): Promise<StoredStorySummary[]> {
    const { data, error } = await this.supabase
      .from('stories')
      .select('id,title,status,created_at,updated_at,completed_at,error,story_payload')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toSummary);
  }

  async getStory(user: AuthenticatedUser, id: string): Promise<StoredStoryDetail | null> {
    const { data, error } = await this.supabase
      .from('stories')
      .select('id,title,status,created_at,updated_at,completed_at,error,config,story_payload,relationship_graph')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? toDetail(data) : null;
  }

  async updateStatus(userId: string, id: string, status: StoredStoryStatus, errorMessage?: string) {
    const { error } = await this.supabase
      .from('stories')
      .update({ status, error: errorMessage ?? null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throw error;
  }

  async saveStoryPayload(userId: string, id: string, storyPayload: StoryPayload, status: StoredStoryStatus) {
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    const { error } = await this.supabase
      .from('stories')
      .update({
        title: storyPayload.title,
        status,
        story_payload: storyPayload,
        relationship_graph: storyPayload.relationshipGraph ?? null,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throw error;
  }

  async renameStory(user: AuthenticatedUser, id: string, title: string) {
    const { data, error } = await this.supabase
      .from('stories')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('id', id)
      .select('id,title,status,created_at,updated_at,completed_at,error,story_payload')
      .maybeSingle();

    if (error) throw error;
    return data ? toSummary(data) : null;
  }

  async deleteStory(user: AuthenticatedUser, id: string) {
    const { error } = await this.supabase
      .from('stories')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id);

    if (error) throw error;
  }

  async updateUserTier(userId: string, tier: 'free' | 'pro' | 'premium') {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id,email,display_name,avatar_url,tier')
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

function toSummary(row: Record<string, unknown>): StoredStorySummary {
  const payload = row.story_payload as StoryPayload | null | undefined;
  return {
    id: String(row.id),
    title: String(row.title),
    status: row.status as StoredStoryStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : undefined,
    chapterCount: payload?.chapters?.length ?? 0,
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}

function toDetail(row: Record<string, unknown>): StoredStoryDetail {
  return {
    ...toSummary(row),
    config: row.config,
    storyPayload: row.story_payload as StoryPayload | undefined,
    relationshipGraph: row.relationship_graph as RelationshipGraph | undefined,
  };
}
