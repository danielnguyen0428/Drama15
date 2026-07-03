import type { ProsePolishTarget, LocalProsePolishConfig } from "../presets/prose-polish-config";
import { shouldRunProsePostProcess } from "../presets/prose-polish-config";

export type ProseHumanizerRouterPort = {
  generateJson<T>(params: {
    model: string;
    fallbackModel?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    timeoutMs?: number;
  }): Promise<{ data: T; modelUsed: string }>;
};

export type ProseHumanizerPostProcessInput = {
  text: string;
  target: ProsePolishTarget;
  outputLanguage: string;
  config?: LocalProsePolishConfig;
  routerClient: ProseHumanizerRouterPort;
  model: string;
  fallbackModel?: string;
  timeoutMs?: number;
  contextLabel?: string;
};

const POST_PROCESS_TEMPERATURE = 0.32;
const MIN_WORD_RATIO = 0.7;
const MAX_WORD_RATIO = 1.35;

export async function postProcessProseHumanizer(input: ProseHumanizerPostProcessInput) {
  const originalText = input.text.trim();
  if (!originalText || !shouldRunProsePostProcess(input.config, input.target)) {
    return input.text;
  }

  try {
    const result = await input.routerClient.generateJson<unknown>({
      model: input.model,
      fallbackModel: input.fallbackModel,
      systemPrompt: buildPostProcessHumanizerSystemPrompt(),
      userPrompt: buildPostProcessHumanizerPrompt(input),
      temperature: POST_PROCESS_TEMPERATURE,
      timeoutMs: input.timeoutMs,
    });
    const candidate = extractPostProcessedText(result.data).trim();
    if (!isAcceptablePostProcessedText(originalText, candidate)) {
      return input.text;
    }

    return candidate;
  } catch (error) {
    console.warn(`[prose-humanizer] pass skipped (fail-open): ${error instanceof Error ? error.message : String(error)}`);
    return input.text;
  }
}

export function buildPostProcessHumanizerSystemPrompt() {
  return [
    "You are a post-process humanizer for serialized short-drama prose.",
    "Rewrite only the supplied text field after the drafting model has already produced it.",
    "Preserve story facts, names, chronology, chapter number, reveal timing, and JSON shape.",
    "Return only valid JSON.",
  ].join("\n");
}

export function buildPostProcessHumanizerPrompt(input: Omit<ProseHumanizerPostProcessInput, "routerClient">) {
  const rules = input.config?.rules;
  return [
    "Post-process humanizer pass.",
    `Target: ${input.target}. Output language: ${input.outputLanguage}.`,
    input.contextLabel ? `Context: ${input.contextLabel}.` : "",
    "Return JSON with exactly one key: text.",
    "Rewrite the supplied text so it reads less like model output and more like human-written commercial drama prose.",
    "Keep every plot fact, character name, relationship, object, order of events, and continuity detail unchanged.",
    "Do not add new scenes, new plot beats, new backstory, moral commentary, or extra aftermath.",
    "Keep the result within roughly the same length band as the original text.",
    "Use varied sentence rhythm, concrete behavior, specific social detail, and emotion shown through action or silence.",
    rules ? `Remove common AI tells: ${rules.removeAiTells.join("; ")}.` : "",
    rules ? `Add human texture: ${rules.addHumanTexture.join("; ")}.` : "",
    "Keep dialogue punctuation stable and readable; use smart quotes for spoken dialogue when the surrounding prose already uses them.",
    "Original text:",
    originalTextBlock(input.text),
  ].filter(Boolean).join("\n\n");
}

function extractPostProcessedText(value: unknown): string {
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
    return extractPostProcessedText(record.chapter);
  }

  return "";
}

function isAcceptablePostProcessedText(originalText: string, candidate: string) {
  if (!candidate) {
    return false;
  }

  const originalWords = countWords(originalText);
  const candidateWords = countWords(candidate);
  if (originalWords < 80) {
    return candidateWords > 0;
  }

  const ratio = candidateWords / originalWords;
  return ratio >= MIN_WORD_RATIO && ratio <= MAX_WORD_RATIO;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function originalTextBlock(text: string) {
  return JSON.stringify({ text }, null, 2);
}
