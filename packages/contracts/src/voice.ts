/**
 * Voice / OmniVoice contracts (Requirement 9).
 *
 * Paid_Plan only (Requirement 9.2). Voice_Job runs over the 10 chapters of a
 * completed story (9.4); quota is decremented when the job completes (9.5);
 * retry of a single chapter does not re-charge (9.9).
 */

export interface Voice {
  /** Upstream OmniVoice voice id. Web_Client never sees the upstream host (Req 9.10). */
  id: string;
  name: string;
  /** BCP-47 locale (e.g. `vi-VN`, `en-US`). */
  locale: string;
  gender?: 'male' | 'female' | 'neutral';
  /** Optional preview URL signed by API_Gateway. */
  previewUrl?: string;
}

export interface ListVoicesResponse {
  voices: Voice[];
}

export interface VoiceJobCreateRequest {
  storyId: string;
  voice_id: string;
  /** 0.5 .. 2.0; default 1.0 */
  speed?: number;
  /** -12 .. 12 (semitones); default 0 */
  pitch?: number;
  /** Hashed Device_Fingerprint. */
  fingerprint: string;
}

export type VoiceJobStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial';

export interface VoiceChapterArtifact {
  /** 1..10 */
  chapterIndex: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  /** Signed URL with TTL ≤ 60 minutes (Requirement 9.8). */
  signedUrl?: string;
  /** ISO-8601 UTC. */
  expiresAt?: string;
}

export interface VoiceJob {
  id: string;
  storyId: string;
  userId: string;
  status: VoiceJobStatus;
  voice_id: string;
  speed: number;
  pitch: number;
  chaptersCompleted: number;
  artifacts: VoiceChapterArtifact[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

export type VoiceControlAction = 'pause' | 'resume' | 'stop' | 'retry';

export interface VoiceControlRequest {
  action: VoiceControlAction;
  /** When `action === 'retry'`, the 1..10 chapter index to retry. */
  chapterIndex?: number;
}
