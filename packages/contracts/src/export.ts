/**
 * Export contracts (Requirement 11).
 *
 * Both PDF and Markdown ZIP carry watermarks tying the file to its owner
 * (Requirements 11.3, 11.4). All download URLs are signed with TTL ≤ 60 min
 * (Requirement 11.2).
 */

export interface ExportPdfRequest {
  storyId: string;
}

export interface ExportPdfResponse {
  /** Signed URL to the generated PDF. TTL ≤ 60 minutes. */
  signedUrl: string;
  /** ISO-8601 UTC. */
  expiresAt: string;
}

export interface ExportMarkdownResponse {
  /** Signed URL to a `.zip` containing one `.md` per chapter. */
  signedUrl: string;
  /** ISO-8601 UTC. */
  expiresAt: string;
}
