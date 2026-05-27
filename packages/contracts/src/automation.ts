/**
 * Automation contracts (Requirement 8).
 *
 * Paid_Plan only (Requirement 8.2). Each Automation_Job is capped at 2 stories
 * (Requirement 8.3). Quota is decremented per story upon completion (8.5);
 * retrying a single failed story does NOT re-charge (8.7).
 */

import type { StorySetupConfig } from './stories.js';

export type AutomationStatus = 'running' | 'paused' | 'completed' | 'failed';

export type AutomationControlAction = 'pause' | 'resume' | 'stop' | 'retry';

export interface AutomationCreateRequest {
  /** Per Requirement 8.3, Automation_Job creates at most 2 stories. */
  target_count: 1 | 2;
  /** Either one shared config applied to every story, or one config per story. */
  configs: StorySetupConfig[];
  /** Hashed Device_Fingerprint of the requesting session. */
  fingerprint: string;
}

export interface AutomationStoryProgress {
  /** 0-based slot inside the Automation_Job. */
  slot: number;
  storyId?: string;
  chaptersCompleted: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorCode?: string;
}

export interface AutomationJob {
  id: string;
  userId: string;
  status: AutomationStatus;
  target_count: 1 | 2;
  /** Per-story progress, length === `target_count`. */
  progress: AutomationStoryProgress[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

export interface AutomationControlRequest {
  action: AutomationControlAction;
  /** When `action === 'retry'`, the slot of the story to retry. */
  storyIndex?: number;
}
