import type { Concept, StoryBible, ChapterPlanItem, OutputLanguage } from "../../types/story";
import type { FoundationReportSchema } from "../../schemas/story";
import type { z } from "zod";

/**
 * Foundation Gate — score the story's foundation (concept + bible + chapter
 * plan) before any chapter is written, and tell the orchestrator whether the
 * foundation is strong enough to build on (autonovel Phase 1 "loop until
 * foundation_score > 7.5").
 *
 * autonovel regenerates the whole foundation until it clears the bar. We do the
 * same but bounded and opt-in: the orchestrator regenerates the outline up to a
 * small number of attempts and keeps the highest-scoring one.
 *
 * Diagnostic + advisory only — fully fail-open. On any model/parse error it
 * returns `null`, which the orchestrator treats as "pass" (never blocks).
 */

export type FoundationReport = z.infer<typeof FoundationReportSchema>;

export type FoundationGateRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type FoundationGateInput = {
  concept: Concept;
  storyBible: StoryBible;
  chapterPlan: ChapterPlanItem[];
  outputLanguage: OutputLanguage;
  linePreset: string;
  routerClient: FoundationGateRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
};

const FOUNDATION_TEMPERATURE = 0.3;

// Dimensions a commercial short-drama foundation is judged on.
const DIMENSIONS = [
  "hook (móc câu mở truyện đủ mạnh để giữ người đọc)",
  "originality (độ mới, không sáo mòn, không trùng motif drama đại trà)",
  "coherence (logic 15 chương chặt: leo thang → phản bội → vực thẳm → phản công → cao trào)",
  "characters (nhân vật rõ động cơ, phản diện không một chiều)",
  "payoff (lời hứa thể loại được trả thoả mãn ở cao trào)",
] as const;

export async function evaluateFoundation(input: FoundationGateInput): Promise<FoundationReport | null> {
  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildFoundationSystemPrompt(),
      userPrompt: buildFoundationPrompt(input),
      temperature: FOUNDATION_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });
    return normalizeFoundationReport(result.data, result.modelUsed);
  } catch (error) {
    console.warn(`[foundation-gate] evaluation skipped (fail-open): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function buildFoundationSystemPrompt(): string {
  return [
    "Bạn là biên tập trưởng của một xưởng truyện drama ngắn thương mại.",
    "Chấm điểm phần nền của một bộ truyện (concept + hồ sơ + dàn ý 15 chương) TRƯỚC khi viết, thẳng thắn và khắt khe.",
    "Mục tiêu là chặn những nền truyện yếu/sáo mòn/lỏng logic ngay từ đầu.",
    "Chỉ trả về JSON hợp lệ.",
  ].join("\n");
}

export function buildFoundationPrompt(input: Omit<FoundationGateInput, "routerClient">): string {
  const planDigest = input.chapterPlan
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => `${c.chapterNumber}. ${c.title} — beat: ${c.mainBeat}; kết: ${c.endingBeat}`)
    .join("\n");

  return [
    `Dòng truyện (niche): ${input.linePreset}. Ngôn ngữ: ${input.outputLanguage}.`,
    "",
    "CONCEPT:",
    JSON.stringify(
      {
        title: input.concept.title,
        logline: input.concept.logline,
        promise: input.concept.promise,
        conflictEngine: input.concept.conflictEngine,
      },
      null,
      2,
    ),
    "",
    "HỒ SƠ (rút gọn):",
    JSON.stringify(
      {
        premise: input.storyBible.premise,
        heroine: input.storyBible.heroine?.name,
        betrayer: input.storyBible.betrayer?.name,
        rival: input.storyBible.rival?.name,
        betrayalEngine: input.storyBible.betrayalEngine,
        revengeEngine: input.storyBible.revengeEngine,
        endingMode: input.storyBible.endingMode,
      },
      null,
      2,
    ),
    "",
    "DÀN Ý 15 CHƯƠNG:",
    planDigest,
    "",
    `Chấm từng trục 0-10: ${DIMENSIONS.join("; ")}.`,
    "Trả về JSON đúng shape:",
    JSON.stringify(
      {
        overallScore: 0,
        dimensions: [{ name: "hook", score: 0, note: "" }],
        issues: ["..."],
        suggestions: ["..."],
      },
      null,
      2,
    ),
    "Quy tắc: overallScore là điểm tổng 0-10. issues nêu lỗi nền cụ thể (sáo mòn, lỗ hổng logic, phản diện mỏng). suggestions là cách sửa ngắn gọn. Viết tiếng Việt.",
  ].join("\n");
}

function normalizeFoundationReport(data: unknown, modelUsed: string): FoundationReport | null {
  const record = unwrap(data);
  if (!record) {
    return null;
  }

  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
        .map((entry) => {
          const d = entry as Record<string, unknown>;
          const score = clampScore(d.score);
          if (typeof d.name !== "string" || score === null) {
            return null;
          }
          return { name: d.name, score, note: typeof d.note === "string" ? d.note : "" };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    : [];

  const overallScore = clampScore(record.overallScore)
    ?? (dimensions.length > 0 ? dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length : null);
  if (overallScore === null) {
    return null;
  }

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    dimensions,
    issues: toStringArray(record.issues),
    suggestions: toStringArray(record.suggestions),
    model: modelUsed,
    generatedAt: new Date().toISOString(),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(10, value));
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.foundation && typeof record.foundation === "object") {
    return record.foundation as Record<string, unknown>;
  }
  return record;
}
