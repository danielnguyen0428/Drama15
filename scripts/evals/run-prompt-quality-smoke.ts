import outlineRequestExample from "../../examples/outline-request.json";
import { isAppError } from "../../src/lib/errors";
import { createAppServices } from "../../src/modules/runtime/create-app-services";
import {
  analyzeChapterQuality,
  needsChapterRetry,
  type ChapterQualityMetrics,
} from "../../src/modules/validators/chapter-quality";
import {
  normalizeOutlineRequest,
  resolveDraftControls,
} from "../../src/modules/validators/story-validator";

export type ChapterMetricsSummary = {
  wordCount: number;
  dialogueRatio: number;
  paragraphCount: number;
  maxShortParagraphStreak: number;
  retryNeeded: boolean;
};

export function summarizeChapterMetrics(metrics: ChapterQualityMetrics): ChapterMetricsSummary {
  return {
    wordCount: metrics.wordCount,
    dialogueRatio: Number(metrics.dialogueRatio.toFixed(3)),
    paragraphCount: metrics.paragraphCount,
    maxShortParagraphStreak: metrics.maxShortParagraphStreak,
    retryNeeded: needsChapterRetry(metrics),
  };
}

export async function runPromptQualitySmoke() {
  const { storyOrchestrator } = createAppServices();
  const request = normalizeOutlineRequest(outlineRequestExample);
  const draftControls = resolveDraftControls(undefined);
  const outline = await storyOrchestrator.generateOutline(request);

  try {
    const chapter = await storyOrchestrator.generateChapter(
      {
        storyTitle: outline.title,
        storyBible: outline.storyBible,
        chapterPlan: outline.chapterPlan,
        chapterNumber: 1,
        previousChapterSummaries: [],
        draftControls,
        outputLanguage: outline.request.outputLanguage,
      },
      outline.request.stylePreset,
      outline.request.inspiredByPreset,
      outline.continuityLite,
    );
    const metrics = analyzeChapterQuality(chapter.text, draftControls);
    const summary = {
      title: outline.title,
      chapter: chapter.chapterNumber,
      metrics: summarizeChapterMetrics(metrics),
    };

    console.log(JSON.stringify(summary));

    return summary;
  } catch (error: unknown) {
    const failedMetrics = getFailedChapterMetrics(error);
    if (!failedMetrics) {
      throw error;
    }

    const summary = {
      title: outline.title,
      chapter: 1,
      metrics: summarizeChapterMetrics(failedMetrics),
    };

    console.log(JSON.stringify(summary));
    throw error;
  }
}

if (require.main === module) {
  runPromptQualitySmoke().catch((error: unknown) => {
    if (isAppError(error)) {
      console.error(`Prompt-quality smoke eval failed: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Prompt-quality smoke eval failed: ${error.message}`);
    } else {
      console.error("Prompt-quality smoke eval failed.");
    }
    process.exitCode = 1;
  });
}

function getFailedChapterMetrics(error: unknown): ChapterQualityMetrics | undefined {
  if (!isAppError(error) || !error.details || typeof error.details !== "object") {
    return undefined;
  }

  const metrics = (error.details as { metrics?: unknown }).metrics;
  if (!metrics || typeof metrics !== "object") {
    return undefined;
  }

  const candidate = metrics as Partial<ChapterQualityMetrics>;
  if (
    typeof candidate.wordCount !== "number" ||
    typeof candidate.dialogueRatio !== "number" ||
    typeof candidate.paragraphCount !== "number" ||
    typeof candidate.maxShortParagraphStreak !== "number" ||
    !Array.isArray(candidate.failures)
  ) {
    return undefined;
  }

  return {
    wordCount: candidate.wordCount,
    dialogueRatio: candidate.dialogueRatio,
    paragraphCount: candidate.paragraphCount,
    maxShortParagraphStreak: candidate.maxShortParagraphStreak,
    failures: candidate.failures.filter((value): value is string => typeof value === "string"),
  };
}
