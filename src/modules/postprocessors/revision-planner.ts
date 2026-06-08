import type { ReaderPanelReport } from "./reader-panel";
import type { ManuscriptReviewReport } from "./manuscript-review";

/**
 * Revision Planner — turns reader-panel + manuscript-review reports into a
 * bounded, prioritized list of per-chapter revision briefs (autonovel
 * `gen_brief.py`). Pure and deterministic so it can be unit-tested without an
 * LLM; the orchestrator consumes the briefs and runs the actual rewrites.
 */

export type ChapterRevisionBrief = {
  chapterNumber: number;
  issues: string[];
  /** Highest severity weight among the issues touching this chapter. */
  priority: number;
};

export type RevisionPlanOptions = {
  /** Minimum severity to act on. Default "high". */
  minSeverity?: "low" | "medium" | "high";
  /** Max number of chapters to revise in one pass. Default 3. */
  maxChapters?: number;
};

const SEVERITY_WEIGHT: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };

export function planChapterRevisions(
  readerPanel: ReaderPanelReport | null | undefined,
  manuscriptReview: ManuscriptReviewReport | null | undefined,
  options: RevisionPlanOptions = {},
): ChapterRevisionBrief[] {
  const minWeight = SEVERITY_WEIGHT[options.minSeverity ?? "high"];
  const maxChapters = Math.max(1, options.maxChapters ?? 3);

  const byChapter = new Map<number, { issues: string[]; priority: number }>();

  const ingest = (issue: string, severity: "low" | "medium" | "high", chapters: number[]) => {
    const weight = SEVERITY_WEIGHT[severity];
    if (weight < minWeight || chapters.length === 0) {
      return;
    }
    const trimmed = issue.trim();
    if (!trimmed) {
      return;
    }
    for (const chapterNumber of chapters) {
      const existing = byChapter.get(chapterNumber) ?? { issues: [], priority: 0 };
      if (!existing.issues.includes(trimmed)) {
        existing.issues.push(trimmed);
      }
      existing.priority = Math.max(existing.priority, weight);
      byChapter.set(chapterNumber, existing);
    }
  };

  for (const issue of readerPanel?.topIssues ?? []) {
    ingest(issue.issue, issue.severity, issue.chapters);
  }
  for (const item of manuscriptReview?.items ?? []) {
    ingest(item.issue, item.severity, item.chapters);
  }

  return [...byChapter.entries()]
    .map(([chapterNumber, value]) => ({ chapterNumber, issues: value.issues, priority: value.priority }))
    .sort((a, b) => b.priority - a.priority || b.issues.length - a.issues.length || a.chapterNumber - b.chapterNumber)
    .slice(0, maxChapters);
}

export function buildRevisionInstruction(brief: ChapterRevisionBrief): string {
  return [
    "Sửa chương này theo phản hồi của hội đồng độc giả và ban biên tập.",
    "Chỉ xử lý đúng các vấn đề bên dưới, giữ nguyên mọi tình tiết, tên riêng, mạch logic và chức năng của chương trong tổng thể 15 chương:",
    ...brief.issues.map((issue, index) => `${index + 1}. ${issue}`),
    "Không thêm nhân vật mới, không đổi kết, không phá liên tục với các chương khác.",
  ].join("\n");
}
