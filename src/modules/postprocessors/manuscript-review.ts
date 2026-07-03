import type { Chapter, Concept, OutputLanguage } from "../../types/story";
import type { ManuscriptReviewReportSchema } from "../../schemas/story";
import type { z } from "zod";
import { normalizeIssue } from "./reader-panel";

/**
 * Manuscript Review — expert dual-persona review (autonovel Opus review loop).
 *
 * A single LLM call reviews the full manuscript first as a literary critic and
 * then as a professor of fiction, returning a verdict plus a prioritized list
 * of concrete, actionable items tagged by persona and the chapters they touch.
 * This complements the audience-facing reader panel with a craft-facing pass.
 *
 * Diagnostic only: the report is attached to `meta.manuscriptReview` and never
 * blocks generation. Any failure returns `null` (fail-open).
 */

export type ManuscriptReviewReport = z.infer<typeof ManuscriptReviewReportSchema>;

export type ManuscriptReviewRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type ManuscriptReviewInput = {
  title: string;
  concept: Pick<Concept, "logline" | "promise">;
  chapters: Chapter[];
  outputLanguage: OutputLanguage;
  routerClient: ManuscriptReviewRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
  maxManuscriptChars?: number;
};

const REVIEW_TEMPERATURE = 0.35;
const DEFAULT_MAX_MANUSCRIPT_CHARS = 60_000;

export async function reviewManuscript(input: ManuscriptReviewInput): Promise<ManuscriptReviewReport | null> {
  if (input.chapters.length === 0) {
    return null;
  }

  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildManuscriptReviewSystemPrompt(),
      userPrompt: buildManuscriptReviewPrompt(input),
      temperature: REVIEW_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });

    return normalizeReviewReport(result.data, result.modelUsed);
  } catch (error) {
    console.warn(`[manuscript-review] evaluation skipped (fail-open): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function buildManuscriptReviewSystemPrompt(): string {
  return [
    "Bạn đọc nguyên bản thảo và phê bình hai lượt: trước là nhà phê bình văn học, sau là giáo sư dạy viết.",
    "Đưa ra nhận xét cụ thể, có thể hành động được; công bằng nhưng thẳng. Không cần bới lỗi nếu thật sự không có.",
    "Chỉ trả về JSON hợp lệ, không kèm văn bản ngoài JSON.",
  ].join("\n");
}

export function buildManuscriptReviewPrompt(input: Omit<ManuscriptReviewInput, "routerClient">): string {
  const manuscript = buildManuscriptDigest(input.chapters, input.maxManuscriptChars ?? DEFAULT_MAX_MANUSCRIPT_CHARS);

  return [
    `Tiêu đề: ${input.title}`,
    `Logline: ${input.concept.logline}`,
    `Lời hứa với độc giả: ${input.concept.promise}`,
    `Ngôn ngữ bản thảo: ${input.outputLanguage}.`,
    "",
    "Trả về JSON đúng shape:",
    JSON.stringify(
      {
        verdict: "",
        items: [{ item: "", severity: "low|medium|high", persona: "critic|professor", chapters: [1] }],
      },
      null,
      2,
    ),
    "",
    "Quy tắc:",
    "- verdict: 1-3 câu tổng kết chất lượng tổng thể.",
    "- items: mỗi mục là một vấn đề cụ thể + cách sửa gợi ý, gắn persona (critic/professor) và số chương.",
    "- Xếp items theo mức nghiêm trọng giảm dần. Tối đa khoảng 8 mục quan trọng nhất.",
    "- Viết bằng tiếng Việt, ngắn gọn.",
    "",
    "Bản thảo:",
    manuscript,
  ].join("\n");
}

function buildManuscriptDigest(chapters: Chapter[], maxChars: number): string {
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const parts: string[] = [];
  let used = 0;

  for (const chapter of ordered) {
    const header = `\n=== Chương ${chapter.chapterNumber}: ${chapter.title} ===\n`;
    const remaining = maxChars - used - header.length;
    if (remaining <= 0) {
      parts.push(`\n=== Chương ${chapter.chapterNumber}: ${chapter.title} === [đã lược do giới hạn độ dài]\n`);
      continue;
    }
    const body = chapter.text.length > remaining
      ? `${chapter.text.slice(0, remaining)}…[lược]`
      : chapter.text;
    parts.push(header + body);
    used += header.length + body.length;
  }

  return parts.join("\n");
}

function normalizeReviewReport(data: unknown, modelUsed: string): ManuscriptReviewReport | null {
  const record = unwrap(data);
  if (!record) {
    return null;
  }

  const items = Array.isArray(record.items)
    ? record.items
        .map((entry) => normalizeReviewItem(entry))
        .filter((value): value is NonNullable<typeof value> => value !== null)
    : [];

  const verdict = typeof record.verdict === "string" ? record.verdict.trim() : "";

  if (!verdict && items.length === 0) {
    return null;
  }

  return {
    verdict,
    items,
    model: modelUsed,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeReviewItem(entry: unknown) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  // Reviewers may emit "item" or "issue"; normalize to the shared issue shape.
  const issueText = typeof record.item === "string" ? record.item : record.issue;
  const base = normalizeIssue({ ...record, issue: issueText });
  if (!base) {
    return null;
  }
  const persona = record.persona === "professor" ? "professor" : "critic";
  return { ...base, persona } as const;
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.manuscriptReview && typeof record.manuscriptReview === "object") {
    return record.manuscriptReview as Record<string, unknown>;
  }
  if (record.review && typeof record.review === "object") {
    return record.review as Record<string, unknown>;
  }
  return record;
}
