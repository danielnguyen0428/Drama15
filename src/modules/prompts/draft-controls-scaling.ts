import type { DraftControls } from "../../types/story";
import { getDrama15ChapterArchitecture } from "./drama15-chapter-architecture";

/** Default slider values — architecture baselines are tuned to these. */
export const DEFAULT_USER_INTENSITY = 0.84;
export const DEFAULT_USER_DIALOGUE_RATIO = 0.56;

const INTENSITY_MIN = 0.5;
const INTENSITY_MAX = 0.97;
const DIALOGUE_RATIO_MIN = 0.2;
const DIALOGUE_RATIO_MAX = 0.85;

// The slider previously moved the per-chapter target 1:1 as an offset. Because
// the architecture baseline is the dominant term and the default sits high
// (0.84), pushing the slider toward "max intensity" barely moved the result
// (only ~+0.11 of headroom on low-baseline chapters). These gains amplify how
// far the user's deviation-from-default shifts every chapter, so the slider has
// real pull in both directions. Crucially the gain multiplies the DEVIATION, so
// at the default value the offset is 0 and the output is unchanged — stories
// left on the default keep their exact tuned behavior; only a moved slider bites
// harder.
const INTENSITY_GAIN = 1.7;
const DIALOGUE_RATIO_GAIN = 1.3;

export type UserDraftScalingInput = {
  userIntensity?: number;
  userDialogueRatio: number;
  hookDensity: DraftControls["hookDensity"];
};

export type EffectiveChapterDraftTargets = {
  intensity: number;
  dialogueRatio: number;
  hookDensity: DraftControls["hookDensity"];
  hookType: "curiosity" | "tension" | "revelation" | "irony";
};

export type HookDensityMetrics = {
  hookParagraphCount: number;
  paragraphCount: number;
  hookDensityScore: number;
  closingHook: boolean;
  meetsTarget: boolean;
};

export const HOOK_DENSITY_FAILURE = "hook density is materially below the requested target";

const HOOK_DENSITY_THRESHOLDS: Record<
  DraftControls["hookDensity"],
  { minHookParagraphs: number; minScore: number; requireClosingHook: boolean }
> = {
  low: { minHookParagraphs: 1, minScore: 0.06, requireClosingHook: true },
  medium: { minHookParagraphs: 2, minScore: 0.1, requireClosingHook: true },
  high: { minHookParagraphs: 3, minScore: 0.14, requireClosingHook: true },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildUserDraftScaling(
  draftControls: DraftControls,
  userIntensity?: number,
): UserDraftScalingInput {
  return {
    userIntensity: userIntensity ?? DEFAULT_USER_INTENSITY,
    userDialogueRatio: draftControls.dialogueRatio,
    hookDensity: draftControls.hookDensity,
  };
}

export function scaleChapterIntensity(architectureIntensity: number, userIntensity: number): number {
  const offset = (userIntensity - DEFAULT_USER_INTENSITY) * INTENSITY_GAIN;
  return round2(clamp(architectureIntensity + offset, INTENSITY_MIN, INTENSITY_MAX));
}

export function scaleChapterDialogueRatio(architectureRatio: number, userDialogueRatio: number): number {
  const offset = (userDialogueRatio - DEFAULT_USER_DIALOGUE_RATIO) * DIALOGUE_RATIO_GAIN;
  return round2(clamp(architectureRatio + offset, DIALOGUE_RATIO_MIN, DIALOGUE_RATIO_MAX));
}

export function resolveEffectiveChapterDraftTargets(
  chapterNumber: number,
  scaling: UserDraftScalingInput,
): EffectiveChapterDraftTargets {
  const architecture = getDrama15ChapterArchitecture(chapterNumber);
  const userIntensity = scaling.userIntensity ?? DEFAULT_USER_INTENSITY;

  if (!architecture) {
    return {
      intensity: userIntensity,
      dialogueRatio: scaling.userDialogueRatio,
      hookDensity: scaling.hookDensity,
      hookType: "tension",
    };
  }

  return {
    intensity: scaleChapterIntensity(architecture.intensity, userIntensity),
    dialogueRatio: scaleChapterDialogueRatio(architecture.dialogueRatio, scaling.userDialogueRatio),
    hookDensity: scaling.hookDensity,
    hookType: architecture.hookType,
  };
}

export function renderHookDensityInstruction(hookDensity: DraftControls["hookDensity"]) {
  switch (hookDensity) {
    case "low":
      return "Hook density low: end on one sharp unresolved beat; include at least one short tension paragraph.";
    case "medium":
      return "Hook density medium: include 2+ micro-hooks (short beats, interrupted moments, irony tails) plus a strong closing hook.";
    case "high":
      return "Hook density high: include 3+ micro-hooks across scenes and a closing beat that withholds resolution.";
  }
}

function isHookParagraph(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 12) {
    return true;
  }

  if (/[?!…]\s*$/.test(trimmed)) {
    return true;
  }

  if (/—\s*$/.test(trimmed)) {
    return true;
  }

  if (/\.\.\.\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function analyzeHookDensity(text: string, hookDensity: DraftControls["hookDensity"]): HookDensityMetrics {
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0);
  const hookParagraphs = paragraphs.filter(isHookParagraph);
  const closingHook = paragraphs.length > 0 && isHookParagraph(paragraphs[paragraphs.length - 1] ?? "");
  const hookDensityScore = paragraphs.length === 0 ? 0 : hookParagraphs.length / paragraphs.length;
  const threshold = HOOK_DENSITY_THRESHOLDS[hookDensity];
  const meetsTarget =
    hookParagraphs.length >= threshold.minHookParagraphs &&
    hookDensityScore >= threshold.minScore &&
    (!threshold.requireClosingHook || closingHook);

  return {
    hookParagraphCount: hookParagraphs.length,
    paragraphCount: paragraphs.length,
    hookDensityScore,
    closingHook,
    meetsTarget,
  };
}
