/**
 * Thread-Resolution Detector — Shared Core
 *
 * The story bible now declares `pressureThreads`: the distinct pressure lines a
 * story opens (e.g. a material/evidence line AND a social/dignity line). Earlier
 * drafts resolved only the strongest thread — usually the one backed by physical
 * evidence — and let the social/emotional thread evaporate, so the climax felt
 * lopsided and the final chapter absorbed an unresolved thread it had no room
 * for.
 *
 * This detector checks the last two chapters (climax + resolution) against each
 * declared thread label. It uses a language-light token-overlap heuristic (the
 * same style as the continuity tracker): a thread counts as "addressed" when its
 * distinctive words reappear in the closing chapters, and "resolved" when they
 * co-occur near resolution-signal vocabulary. It is deliberately lenient — it is
 * an informational / soft signal, never a hard block — so it flags a thread that
 * was clearly dropped without policing wording.
 *
 * Mirrors the sibling detectors: a report + `needsRepair` + repair builder.
 */

export type PressureThread = {
  label: string;
  resolutionBeat: string;
};

export type ThreadResolutionEntry = {
  label: string;
  addressed: boolean;
  resolved: boolean;
};

export type ThreadResolutionReport = {
  threads: ThreadResolutionEntry[];
  unresolvedLabels: string[];
  needsRepair: boolean;
};

// Words too common to distinguish one thread from another. Kept tiny and
// language-light (Vietnamese + English) because thread labels are short.
const STOP_TOKENS = new Set([
  // Vietnamese
  "và", "của", "các", "những", "một", "cho", "với", "trong", "là", "được",
  "the", "a", "an", "of", "and", "to", "in", "on", "for", "with", "her", "his",
  "she", "he", "that", "this", "by", "as", "at", "it", "is",
]);

// Resolution-signal vocabulary: presence near a thread's tokens suggests the
// thread is being closed, not merely mentioned again.
const RESOLUTION_SIGNALS = [
  // Vietnamese
  "kết thúc", "chấm dứt", "giải quyết", "khép lại", "công khai", "thừa nhận",
  "từ chối", "rời", "chọn", "trả", "phơi bày", "sự thật", "quyết định",
  "không còn", "cuối cùng", "đối mặt", "vạch trần", "buông",
  // English
  "resolve", "end", "expose", "admit", "confess", "reject", "choose", "leave",
  "truth", "final", "decide", "confront", "settle", "walk away", "no longer",
];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_TOKENS.has(token));
}

function distinctiveTokens(label: string): string[] {
  return Array.from(new Set(tokenize(label)));
}

// A chapter "addresses" a thread when a meaningful share of the thread label's
// distinctive tokens reappear in the chapter text.
const ADDRESSED_OVERLAP = 0.4;

export function detectThreadResolution(
  threads: PressureThread[],
  closingChaptersText: string,
): ThreadResolutionReport {
  const haystack = closingChaptersText.toLowerCase();
  const haystackTokens = new Set(tokenize(closingChaptersText));
  const hasResolutionSignal = RESOLUTION_SIGNALS.some((signal) => haystack.includes(signal));

  const entries: ThreadResolutionEntry[] = threads.map((thread) => {
    const tokens = distinctiveTokens(thread.label);
    if (tokens.length === 0) {
      // Nothing to measure — treat as addressed so we never flag on empty input.
      return { label: thread.label, addressed: true, resolved: true };
    }

    const hits = tokens.filter((token) => haystackTokens.has(token)).length;
    const overlap = hits / tokens.length;
    const addressed = overlap >= ADDRESSED_OVERLAP;
    // "Resolved" requires the thread to be addressed AND the closing chapters to
    // carry resolution-signal vocabulary somewhere. This is intentionally coarse:
    // it catches a thread that is never touched again, not subtle craft issues.
    const resolved = addressed && hasResolutionSignal;
    return { label: thread.label, addressed, resolved };
  });

  const unresolvedLabels = entries
    .filter((entry) => !entry.resolved)
    .map((entry) => entry.label);

  return {
    threads: entries,
    // Only flag when at least one declared thread is not addressed at all in the
    // closing chapters. If every thread is at least touched, we defer to the
    // prompt-level craft instructions rather than over-policing.
    needsRepair: entries.some((entry) => !entry.addressed),
    unresolvedLabels,
  };
}

export function buildThreadResolutionRepairInstructions(
  report: ThreadResolutionReport,
): string {
  if (!report.needsRepair) return "";

  return [
    "THREAD-RESOLUTION REPAIR INSTRUCTION",
    "",
    "The story bible declared these pressure threads, but the closing chapters do not clearly resolve all of them:",
    ...report.unresolvedLabels.map((label) => `- ${label}`),
    "",
    "In the public-reveal / climax chapter, add a concrete beat that closes EACH unresolved thread above — not only the thread with the strongest physical evidence. Every pressure line the story opened must be answered before the final equilibrium chapter.",
    "Do not open any new plot thread. Keep all existing facts, names, and dialogue meaning intact.",
  ].join("\n");
}
