/**
 * Rewrite contracts (Requirement 7).
 *
 * Rewrite is gated by its own daily counter (30/24h UTC) and never decrements
 * the chapter or story counters (Requirements 7.4, 7.5, 7.6).
 */

export type RewriteMode =
  | 'full_chapter'
  | 'opening_hook'
  | 'closing_beat'
  | 'dialogue_tone'
  | 'class_humiliation'
  | 'retaliation_sharpness';

export interface RewriteRequest {
  storyId: string;
  /** 1..10 */
  chapterIndex: number;
  mode: RewriteMode;
  /** Optional free-form instruction the user typed in the panel. */
  instruction?: string;
}

export interface RewriteResponse {
  storyId: string;
  chapterIndex: number;
  /** New chapter body. */
  content: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}
