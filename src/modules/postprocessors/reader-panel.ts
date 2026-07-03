import type { Chapter, Concept, OutputLanguage } from "../../types/story";
import type { ReaderPanelReportSchema } from "../../schemas/story";
import type { z } from "zod";

/**
 * Reader Panel — novel-level multi-persona evaluation (autonovel `reader_panel.py`).
 *
 * After all chapters are written, a single LLM call role-plays a panel of
 * target-audience readers and returns a structured verdict: a per-persona score,
 * what each persona liked / worried about, and a prioritized list of issues with
 * the chapters they touch. This catches story-level problems the per-chapter
 * mechanical checks cannot see (sagging middle, thin antagonist, unearned
 * ending, repeated beats).
 *
 * It is purely diagnostic: the report is attached to `meta.readerPanel` and
 * never blocks generation. Any failure returns `null` (fail-open).
 */

export type ReaderPanelReport = z.infer<typeof ReaderPanelReportSchema>;

export type ReaderPanelRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type ReaderPanelInput = {
  title: string;
  concept: Pick<Concept, "logline" | "promise">;
  chapters: Chapter[];
  outputLanguage: OutputLanguage;
  routerClient: ReaderPanelRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
  /** Cap on characters of manuscript sent to the model (token safety). */
  maxManuscriptChars?: number;
};

const READER_PANEL_TEMPERATURE = 0.4;
const DEFAULT_MAX_MANUSCRIPT_CHARS = 60_000;

// Personas tuned for serialized short-drama (the product), not literary fiction.
const PANEL_PERSONAS = [
  "Người đọc nghiện cày truyện drama ngắn (quan tâm hook, nhịp, cliffhanger)",
  "Fan ngôn tình / báo thù (quan tâm cảm xúc, thỏa mãn khi lật kèo)",
  "Người đọc khó tính (soi sạn logic, nhân vật phản diện mỏng, tình tiết tiện tay)",
  "Biên tập viên thương mại (soi câu khách, đoạn lê thê, lặp beat giữa các chương)",
];

export async function runReaderPanel(input: ReaderPanelInput): Promise<ReaderPanelReport | null> {
  if (input.chapters.length === 0) {
    return null;
  }

  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildReaderPanelSystemPrompt(),
      userPrompt: buildReaderPanelPrompt(input),
      temperature: READER_PANEL_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });

    return normalizeReaderPanelReport(result.data, result.modelUsed);
  } catch (error) {
    console.warn(`[reader-panel] evaluation skipped (fail-open): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function buildReaderPanelSystemPrompt(): string {
  return [
    "Bạn là hội đồng độc giả đánh giá một bộ truyện drama ngắn nhiều chương.",
    "Đọc toàn bộ bản thảo rồi chấm điểm thẳng thắn dưới góc nhìn từng kiểu độc giả.",
    "Chỉ trả về JSON hợp lệ, không kèm văn bản ngoài JSON.",
  ].join("\n");
}

export function buildReaderPanelPrompt(input: Omit<ReaderPanelInput, "routerClient">): string {
  const manuscript = buildManuscriptDigest(input.chapters, input.maxManuscriptChars ?? DEFAULT_MAX_MANUSCRIPT_CHARS);

  return [
    `Tiêu đề: ${input.title}`,
    `Logline: ${input.concept.logline}`,
    `Lời hứa với độc giả: ${input.concept.promise}`,
    `Ngôn ngữ bản thảo: ${input.outputLanguage}.`,
    "",
    "Hội đồng gồm các persona sau, mỗi persona chấm 1 điểm 0-10:",
    ...PANEL_PERSONAS.map((persona, index) => `${index + 1}. ${persona}`),
    "",
    "Trả về JSON đúng shape:",
    JSON.stringify(
      {
        overallScore: 0,
        personas: [{ persona: "", score: 0, liked: "", concern: "" }],
        topIssues: [{ issue: "", severity: "low|medium|high", chapters: [1] }],
      },
      null,
      2,
    ),
    "",
    "Quy tắc:",
    "- overallScore là trung bình có cân nhắc của các persona (0-10).",
    "- Mỗi persona phải có 'liked' và 'concern' cụ thể, không nói chung chung.",
    "- topIssues xếp theo mức nghiêm trọng, chỉ rõ số chương liên quan.",
    "- Nhận xét bằng tiếng Việt, ngắn gọn, thẳng thắn.",
    "",
    "Bản thảo:",
    manuscript,
  ].join("\n");
}

/** Build a length-capped digest of the manuscript so very long stories stay
 * within a safe token budget. Earlier chapters are kept whole; once the budget
 * is hit, remaining chapters are truncated with a marker. */
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

function normalizeReaderPanelReport(data: unknown, modelUsed: string): ReaderPanelReport | null {
  const record = unwrap(data);
  if (!record) {
    return null;
  }

  const personas = Array.isArray(record.personas)
    ? record.personas
        .map((entry) => {
          const p = entry as Record<string, unknown>;
          const score = clampScore(p.score);
          if (typeof p.persona !== "string" || score === null) {
            return null;
          }
          return {
            persona: p.persona,
            score,
            liked: typeof p.liked === "string" ? p.liked : "",
            concern: typeof p.concern === "string" ? p.concern : "",
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null)
    : [];

  const topIssues = Array.isArray(record.topIssues)
    ? record.topIssues
        .map((entry) => normalizeIssue(entry))
        .filter((value): value is NonNullable<typeof value> => value !== null)
    : [];

  const overallScore = clampScore(record.overallScore)
    ?? (personas.length > 0 ? personas.reduce((sum, p) => sum + p.score, 0) / personas.length : null);

  if (overallScore === null) {
    return null;
  }

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    personas,
    topIssues,
    model: modelUsed,
    generatedAt: new Date().toISOString(),
  };
}

export function normalizeIssue(entry: unknown): { issue: string; severity: "low" | "medium" | "high"; chapters: number[] } | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.issue !== "string" || record.issue.trim().length === 0) {
    return null;
  }
  const severity = record.severity === "low" || record.severity === "high" ? record.severity : "medium";
  const chapters = Array.isArray(record.chapters)
    ? record.chapters
        .map((value) => (typeof value === "number" ? Math.trunc(value) : Number.NaN))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 15)
    : [];
  return { issue: record.issue.trim(), severity, chapters };
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
  if (record.readerPanel && typeof record.readerPanel === "object") {
    return record.readerPanel as Record<string, unknown>;
  }
  return record;
}
