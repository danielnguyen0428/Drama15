import type { SupabaseClient } from '@supabase/supabase-js';

import { hasResumableStoryPayload } from '../../../src/modules/orchestrator/story-resume.js';
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
  canResume?: boolean;
  error?: string;
};

export type StoredStoryDetail = StoredStorySummary & {
  config: unknown;
  storyPayload?: StoryPayload;
  relationshipGraph?: RelationshipGraph;
};

// Read-only shape exposed to partner sites through the public API. It never
// leaks the owner's user_id, config, or LLM settings — only the finished,
// reader-facing story surface.
export type PublicStorySummary = {
  id: string;
  title: string;
  logline?: string;
  outputLanguage?: string;
  chapterCount: number;
  completedAt?: string;
  updatedAt: string;
};

export type PublicStoryChapter = {
  index: number;
  title: string;
  content: string;
};

export type PublicStoryDetail = PublicStorySummary & {
  premise?: string;
  promise?: string;
  chapters: PublicStoryChapter[];
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

  // ─── Public (partner-facing) reads ──────────────────────────────────────
  // These deliberately ignore user ownership and return only completed stories
  // across all users. They select a narrow column set and never expose user_id,
  // config, request, or LLM settings.

  async listPublicStories(params: { limit: number; offset: number }): Promise<{
    stories: PublicStorySummary[];
    total: number;
  }> {
    const from = params.offset;
    const to = params.offset + params.limit - 1;
    const { data, error, count } = await this.supabase
      .from('stories')
      .select('id,title,completed_at,updated_at,story_payload', { count: 'exact' })
      .eq('status', 'completed')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) throw error;
    return {
      stories: (data ?? []).map(toPublicSummary),
      total: count ?? 0,
    };
  }

  async getPublicStory(id: string): Promise<PublicStoryDetail | null> {
    const { data, error } = await this.supabase
      .from('stories')
      .select('id,title,completed_at,updated_at,status,story_payload,relationship_graph')
      .eq('id', id)
      .eq('status', 'completed')
      .maybeSingle();

    if (error) throw error;
    return data ? toPublicDetail(data) : null;
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
    canResume: Boolean(payload) && hasResumableStoryPayload(payload),
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

function toPublicSummary(row: Record<string, unknown>): PublicStorySummary {
  const payload = row.story_payload as StoryPayload | null | undefined;
  return {
    id: String(row.id),
    title: String(payload?.title ?? row.title),
    logline: payload?.concept?.logline,
    outputLanguage: payload?.request?.outputLanguage,
    chapterCount: payload?.chapters?.length ?? 0,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : undefined,
    updatedAt: String(row.updated_at),
  };
}

function toPublicDetail(row: Record<string, unknown>): PublicStoryDetail {
  const payload = row.story_payload as StoryPayload | null | undefined;
  const chapters: PublicStoryChapter[] = (payload?.chapters ?? [])
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter) => ({
      index: chapter.chapterNumber,
      title: chapter.title,
      content: chapter.text,
    }));

  return {
    ...toPublicSummary(row),
    premise: payload?.storyBible?.premise,
    promise: payload?.concept?.promise,
    chapters,
    relationshipGraph: row.relationship_graph as RelationshipGraph | undefined,
  };
}
