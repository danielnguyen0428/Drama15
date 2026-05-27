/**
 * Story creation contracts (Requirements 6, 7, 10).
 *
 * UI locale is independent from the output language passed to the upstream
 * generator (Requirement 6.12, 19.3). Field names follow the conventions used
 * by the upstream `Existing_Generation_Server`.
 */

/** Output language for the generated story. ISO-639-1 by convention; `vi` and `en` are first-class. */
export type OutputLanguage = 'vi' | 'en' | (string & {});

/**
 * Configuration for a setup-suggest run or for an actual story generation.
 * Mirrors the desktop form (Requirement 6.1, 6.2).
 */
export interface StorySetupConfig {
  /** One of the curated niches; if `customNiche` is provided this is ignored. */
  niche?: string;
  /** User-defined niche when `niche` is missing (Requirement 6.11). */
  customNiche?: string;
  outputLanguage: OutputLanguage;
  /** Free-form world / character seed text fed to the generator. */
  seed?: string;
  /** Generated story title; auto-suggested when missing. */
  title?: string;
  /** 0..1, drama intensity. */
  intensity?: number;
  /** 0..1, target ratio of dialogue to narration. */
  dialogueRatio?: number;
  /** 0..1, hook density at chapter boundaries. */
  hookDensity?: number;
  /** Optional preset key, e.g. `billionaire_rich_poor_romance`. */
  presetLine?: string;
  /** Optional style preset key, e.g. `austen_social_knife`. */
  presetStyle?: string;
}

/** Single chapter or full 10-chapter run. */
export type StoryCreateMode = 'single_chapter' | 'full';

export interface CreateStoryRequest {
  mode: StoryCreateMode;
  config: StorySetupConfig;
  /** Hashed Device_Fingerprint (Requirement 4.1). */
  fingerprint: string;
  /** When `mode === 'single_chapter'`, the 1-based chapter index to generate. */
  chapterIndex?: number;
}

export interface CreateStoryResponse {
  storyId: string;
  /** Whether streaming has begun for this job. */
  streaming: boolean;
}

export type ChapterStatus = 'pending' | 'streaming' | 'done' | 'failed';

export interface Chapter {
  storyId: string;
  /** 1..10 */
  index: number;
  status: ChapterStatus;
  /** Plain-text body. Absent for `pending` / `streaming` stages. */
  content?: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

export type StoryStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial';

export interface StoryDetail {
  id: string;
  userId: string;
  status: StoryStatus;
  config: StorySetupConfig;
  /** Top-level synopsis shown in the `Tổng Quan` tab. */
  overview?: string;
  /** Plan / outline shown in the `Kế Hoạch` tab. */
  plan?: unknown;
  chapters: Chapter[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  /** Set when the 10-chapter run finishes (Requirement 6.5). */
  completedAt?: string;
  automationJobId?: string;
}

/** Lightweight projection used by the history list (Requirement 10.1). */
export interface StoryListItem {
  id: string;
  status: StoryStatus;
  title?: string;
  niche?: string;
  outputLanguage: OutputLanguage;
  /** ISO-8601 UTC. */
  createdAt: string;
  chaptersCompleted: number;
}

export interface ListStoriesResponse {
  /** Sorted by `createdAt` desc (Requirement 10.1). */
  stories: StoryListItem[];
}

/**
 * Resume a Story_Job from the first missing chapter (Requirement 6.9, 7.7).
 * Quota is NOT charged on resume; only the original completion commits.
 */
export interface ResumeStoryRequest {
  storyId: string;
}

export interface ResumeStoryResponse {
  storyId: string;
  /** Indices of chapters the upstream will (re)generate. */
  resumingIndices: number[];
}
