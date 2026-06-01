export type UserTier = "free" | "pro" | "premium";

export const STORY_QUOTA_BY_TIER: Record<UserTier, number> = {
  free: 1,
  pro: 3,
  premium: 5,
};

// Daily setup-suggestion quota per tier. `null` means unlimited.
export const SETUP_SUGGESTION_QUOTA_BY_TIER: Record<UserTier, number | null> = {
  free: 10,
  pro: 10,
  premium: null,
};

// Backwards-compatible alias for the free-tier setup suggestion quota.
export const FREE_SETUP_SUGGESTION_QUOTA = SETUP_SUGGESTION_QUOTA_BY_TIER.free ?? 10;

export function resolveStoryQuotaLimit(tier: string | undefined): number {
  return STORY_QUOTA_BY_TIER[parseUserTier(tier)];
}

export function resolveSetupSuggestionQuotaLimit(tier: string | undefined): number | null {
  return SETUP_SUGGESTION_QUOTA_BY_TIER[parseUserTier(tier)];
}

export function parseUserTier(value: string | undefined): UserTier {
  if (value === "pro" || value === "premium") return value;
  return "free";
}

export function getVietnamUsageDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return now.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}
