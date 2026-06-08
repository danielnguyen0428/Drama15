import type { Concept, StoryBible, ChapterPlanItem, OutputLanguage } from "../../types/story";

/**
 * Canon Facts — lock the story's "hard facts" at outline time (autonovel
 * `gen_canon.py`). Before any chapter is drafted, distill the concept + bible +
 * plan into a short list of facts that MUST stay consistent across all 15
 * chapters (who betrayed whom, the core reveal, key names/objects, the ending
 * mode). These are injected into every chapter prompt as a canon block so the
 * drafting model cannot contradict them mid-book.
 *
 * Fail-open: any error returns an empty list and the pipeline runs as before.
 */

export type CanonFactsRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type CanonFactsInput = {
  concept: Concept;
  storyBible: StoryBible;
  chapterPlan: ChapterPlanItem[];
  outputLanguage: OutputLanguage;
  routerClient: CanonFactsRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
  maxFacts?: number;
};

const CANON_TEMPERATURE = 0.2;
const DEFAULT_MAX_FACTS = 14;

export async function generateCanonFacts(input: CanonFactsInput): Promise<string[]> {
  const maxFacts = input.maxFacts ?? DEFAULT_MAX_FACTS;
  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildCanonSystemPrompt(),
      userPrompt: buildCanonPrompt(input),
      temperature: CANON_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });
    return normalizeCanonFacts(result.data, maxFacts);
  } catch {
    return [];
  }
}

export function buildCanonSystemPrompt(): string {
  return [
    "Bạn là người giữ canon (bảng sự thật cứng) cho một bộ truyện drama 15 chương.",
    "Trích các sự thật BẮT BUỘC giữ nguyên xuyên suốt truyện để không chương nào mâu thuẫn.",
    "Chỉ trả về JSON hợp lệ.",
  ].join("\n");
}

export function buildCanonPrompt(input: Omit<CanonFactsInput, "routerClient">): string {
  return [
    `Ngôn ngữ: ${input.outputLanguage}.`,
    "",
    "CONCEPT:",
    JSON.stringify({ logline: input.concept.logline, conflictEngine: input.concept.conflictEngine }, null, 2),
    "HỒ SƠ:",
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
    `Trích tối đa ${input.maxFacts ?? DEFAULT_MAX_FACTS} sự thật cứng. Trả về JSON: { "facts": ["...", "..."] }`,
    "Quy tắc:",
    "- Mỗi fact là một câu khẳng định ngắn, cụ thể, không thể đổi (tên & vai trò nhân vật, ai phản bội ai, bí mật/đòn lật kèo cốt lõi, vật/mốc quan trọng, kiểu kết).",
    "- Không thêm tình tiết mới, không suy diễn ngoài concept/hồ sơ.",
    "- Viết bằng đúng ngôn ngữ truyện.",
  ].join("\n");
}

function normalizeCanonFacts(data: unknown, maxFacts: number): string[] {
  let list: unknown = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    list = record.facts ?? record.canon ?? record.canonFacts ?? [];
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const entry of list) {
    const text = typeof entry === "string" ? entry.trim() : "";
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    facts.push(text);
    if (facts.length >= maxFacts) {
      break;
    }
  }
  return facts;
}
