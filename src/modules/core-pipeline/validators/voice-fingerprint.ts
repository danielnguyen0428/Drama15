/**
 * Voice Fingerprint — mechanical voice-consistency lock (autonovel
 * `voice_fingerprint.py`, mechanical variant).
 *
 * After the first chapter(s) exist, we derive a compact, deterministic profile
 * of the story's prose voice (sentence rhythm, dialogue density, paragraph
 * shape, favourite sentence openers). That profile is injected into later
 * chapter prompts as a "voice lock" so the drafting model does not drift into a
 * different register midway through the book.
 *
 * Everything here is regex/statistics only — no LLM call, no cost, no failure
 * mode beyond returning an empty fingerprint for empty input.
 */

import { segmentSentences, countWords } from "./sentence-variance";

export type VoiceFingerprint = {
  sampleChapters: number;
  meanSentenceWords: number;
  sentenceLengthCv: number;
  dialogueRatio: number;
  meanParagraphWords: number;
  topOpeners: string[];
  emDashPer1000Words: number;
};

const QUOTED_DIALOGUE_PATTERN = /["\u201c\u300c\u300e]([^"\u201d\u300d\u300f\n]+)["\u201d\u300d\u300f]/gu;
const MAX_OPENERS = 5;

export function analyzeVoiceFingerprint(texts: string[]): VoiceFingerprint | null {
  const joined = texts.map((t) => t?.trim() ?? "").filter(Boolean);
  if (joined.length === 0) {
    return null;
  }

  const allText = joined.join("\n\n");
  const sentences = segmentSentences(allText);
  if (sentences.length === 0) {
    return null;
  }

  const lengths = sentences.map(countWords);
  const meanSentenceWords = mean(lengths);
  const sentenceLengthCv = meanSentenceWords === 0 ? 0 : stdev(lengths) / meanSentenceWords;

  const totalWords = countWords(allText);
  const quoted = [...allText.matchAll(QUOTED_DIALOGUE_PATTERN)].map((m) => m[1]).join(" ");
  const dialogueRatio = totalWords === 0 ? 0 : countWords(quoted) / totalWords;

  const paragraphs = allText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const meanParagraphWords = paragraphs.length === 0 ? 0 : mean(paragraphs.map(countWords));

  const emDashCount = (allText.match(/[—–]/g) ?? []).length + (allText.match(/(?<!-)--(?!-)/g) ?? []).length;
  const emDashPer1000Words = totalWords === 0 ? 0 : (emDashCount / totalWords) * 1000;

  return {
    sampleChapters: joined.length,
    meanSentenceWords: round1(meanSentenceWords),
    sentenceLengthCv: round2(sentenceLengthCv),
    dialogueRatio: round2(dialogueRatio),
    meanParagraphWords: round1(meanParagraphWords),
    topOpeners: computeTopOpeners(sentences),
    emDashPer1000Words: round1(emDashPer1000Words),
  };
}

export function buildVoiceLockInstruction(fingerprint: VoiceFingerprint): string {
  const lines = [
    "VOICE LOCK — the style blueprint above defines the voice. The stats below are mechanical measurements of the earlier chapters, for continuity only; if any of them conflicts with the blueprint's voice, follow the blueprint.",
    `- Mean sentence length around ${fingerprint.meanSentenceWords} words, with varied rhythm (length CV ≈ ${fingerprint.sentenceLengthCv}). Keep short punchy lines mixed with longer ones.`,
    `- Quoted-dialogue density around ${Math.round(fingerprint.dialogueRatio * 100)}% of words.`,
    `- Paragraphs around ${fingerprint.meanParagraphWords} words on average; do not turn into long essay blocks.`,
    `- Keep em dashes sparse (the book so far uses about ${fingerprint.emDashPer1000Words} per 1000 words).`,
  ];
  if (fingerprint.topOpeners.length > 0) {
    lines.push(`- Earlier chapters leaned on these sentence openers: ${fingerprint.topOpeners.join(", ")}. Vary your openings; do not reuse these or fall back on any single opener.`);
  }
  lines.push("Do not change names, plot facts, or continuity to fit the voice.");
  return lines.join("\n");
}

// ─── Internals ───────────────────────────────────────────────────────────────

function computeTopOpeners(sentences: string[]): string[] {
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    const first = sentence
      .replace(/^["'“”‘’«»\s\-–—]+/u, "")
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
    if (!first || first.length < 2) {
      continue;
    }
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_OPENERS)
    .filter(([, count]) => count >= 2)
    .map(([word]) => word);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
