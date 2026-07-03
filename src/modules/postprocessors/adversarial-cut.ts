import type { OutputLanguage } from "../../types/story";

/**
 * Adversarial Cut — "cut N words" tightening pass (autonovel `adversarial_edit.py`).
 *
 * Asks the model to remove a target fraction of flab (throat-clearing,
 * redundant beats, filler adverbs, repeated emotional summary) WITHOUT losing
 * any plot fact, line of dialogue, name, or continuity detail. Short serialized
 * drama benefits a lot from this: it kills the lethargic middle that the
 * drafting model pads out.
 *
 * Fail-open and self-guarding: if the model returns something too short (it
 * deleted real content) or barely changed, the original text is kept.
 */

export type AdversarialCutRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type AdversarialCutInput = {
  text: string;
  outputLanguage: OutputLanguage;
  routerClient: AdversarialCutRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
  /** Fraction of words to aim to cut. Default 0.12 (12%). */
  targetCutRatio?: number;
  /** Minimum words a chapter must keep; below this the cut is skipped. */
  minWordsToConsider?: number;
  contextLabel?: string;
};

const CUT_TEMPERATURE = 0.25;
const DEFAULT_TARGET_CUT_RATIO = 0.12;
const DEFAULT_MIN_WORDS = 250;
// Never accept a result that dropped more than this fraction — that means the
// model cut plot, not flab.
const MAX_ACCEPTABLE_CUT_RATIO = 0.35;

export async function tightenChapterText(input: AdversarialCutInput): Promise<string> {
  const original = input.text?.trim() ?? "";
  const minWords = input.minWordsToConsider ?? DEFAULT_MIN_WORDS;
  const originalWords = countWords(original);

  if (!original || originalWords < minWords) {
    return input.text;
  }

  const targetCutRatio = clampRatio(input.targetCutRatio ?? DEFAULT_TARGET_CUT_RATIO);

  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildAdversarialCutSystemPrompt(),
      userPrompt: buildAdversarialCutPrompt({
        text: original,
        outputLanguage: input.outputLanguage,
        targetCutRatio,
        contextLabel: input.contextLabel,
      }),
      temperature: CUT_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });

    const candidate = extractText(result.data).trim();
    if (!isAcceptableCut(originalWords, candidate)) {
      return input.text;
    }
    return candidate;
  } catch (error) {
    console.warn(`[adversarial-cut] pass skipped (fail-open): ${error instanceof Error ? error.message : String(error)}`);
    return input.text;
  }
}

export function buildAdversarialCutSystemPrompt(): string {
  return [
    "Bạn là biên tập viên siết chữ cho truyện drama ngắn thương mại.",
    "Cắt chữ thừa để văn gọn và sắc hơn, nhưng giữ nguyên 100% tình tiết, lời thoại, tên riêng và mạch logic.",
    "Giữ nguyên giọng văn và nhịp câu của tác giả: giữ sự đa dạng độ dài câu, không biến câu phức có mệnh đề phụ thành câu đơn, không làm văn thành chuỗi câu ngắn đều đều.",
    "Chỉ trả về JSON hợp lệ với đúng một khóa: text.",
  ].join("\n");
}

export function buildAdversarialCutPrompt(input: {
  text: string;
  outputLanguage: OutputLanguage;
  targetCutRatio: number;
  contextLabel?: string;
}): string {
  const percent = Math.round(input.targetCutRatio * 100);
  return [
    "Lượt siết chữ (adversarial cut).",
    input.contextLabel ? `Ngữ cảnh: ${input.contextLabel}.` : "",
    `Ngôn ngữ: ${input.outputLanguage}.`,
    `Mục tiêu: cắt khoảng ${percent}% số chữ.`,
    "",
    "Ưu tiên cắt:",
    "- Câu mở màn rào đón, tóm tắt cảm xúc lặp lại.",
    "- Trạng từ/ tính từ thừa, ẩn dụ sáo mòn.",
    "- Đoạn miêu tả nội tâm dài dòng nhắc lại điều đã rõ.",
    "- Beat trùng lặp với đoạn trước trong cùng chương.",
    "",
    "TUYỆT ĐỐI giữ nguyên:",
    "- Mọi tình tiết, sự kiện, thứ tự diễn biến.",
    "- Mọi câu thoại có nội dung (có thể gọn lại nhưng không đổi nghĩa).",
    "- Tên nhân vật, quan hệ, mốc thời gian, chi tiết nối tiếp (continuity).",
    "- Nhịp và giọng văn: giữ sự đa dạng độ dài câu (câu ngắn xen câu dài có mệnh đề phụ). Chỉ cắt chữ thừa; không gộp hay chẻ làm mất câu dài có nhịp, không biến văn thành câu ngắn đều đều.",
    "",
    "Trả về JSON: { \"text\": \"...\" }",
    "",
    "Văn bản gốc:",
    JSON.stringify({ text: input.text }, null, 2),
  ].filter(Boolean).join("\n");
}

function isAcceptableCut(originalWords: number, candidate: string): boolean {
  if (!candidate) {
    return false;
  }
  const candidateWords = countWords(candidate);
  if (candidateWords === 0) {
    return false;
  }
  // Must actually be shorter (allow a tiny tolerance) ...
  if (candidateWords >= originalWords) {
    return false;
  }
  // ... but not so much shorter that real content was removed.
  const cutRatio = (originalWords - candidateWords) / originalWords;
  return cutRatio <= MAX_ACCEPTABLE_CUT_RATIO;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function clampRatio(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_TARGET_CUT_RATIO;
  }
  return Math.max(0.05, Math.min(0.3, value));
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (record.chapter && typeof record.chapter === "object") {
    return extractText(record.chapter);
  }
  return "";
}
