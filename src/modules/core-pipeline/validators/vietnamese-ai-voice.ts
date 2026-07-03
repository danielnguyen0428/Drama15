/**
 * Vietnamese AI-voice detector (structural, not exact-phrase).
 *
 * The existing ai-tell-detector matches an exact cliché phrase bank. In practice
 * Drama15 prose already avoids those exact strings, so it scores ~0 while still
 * "reading AI". This detector measures the signals that survive that filter:
 *
 *   1. clichéVariant  — emotional clichés via loose regex (catches variants the
 *                       exact bank misses: "tim nàng như thắt lại", ...).
 *   2. adverbialMotCach — translated-adverb tic "một cách + adj" ("nói một cách lạnh lùng").
 *   3. transitionOpener — sentences opened with "Và rồi / Bỗng nhiên / Đột nhiên...".
 *   4. sameSubjectOpener — the "Cô ... Cô ... Cô ..." machine cadence: share of
 *                          sentences that open with the single most common subject word.
 *
 * Signals are reported raw (per 1000 words + shares) so callers can judge without
 * trusting one opaque composite. A composite score + needsRepair flag is provided
 * for convenience.
 *
 * Pure text analysis, no LLM. Reusable by measurement tooling and the pipeline.
 */

const CLICHE_VARIANT_PATTERNS: readonly RegExp[] = [
  /(tim|trái tim|lồng ngực)[^.?!…]{0,14}(thắt lại|thắt nghẹn|đau nhói|nhói lên|bóp nghẹt|nghẹn lại)/gi,
  /khóe mắt[^.?!…]{0,12}(cay|đỏ|rưng|nóng|ướt)/gi,
  /nước mắt[^.?!…]{0,16}(lăn|rơi|giàn giụa|trào|tuôn|chực trào)/gi,
  /(một luồng|cảm giác|luồng)[^.?!…]{0,12}(khí )?lạnh[^.?!…]{0,14}sống lưng/gi,
  /(cả )?(thế giới|mọi thứ|bầu trời)[^.?!…]{0,12}(như )?(sụp đổ|tan vỡ|vụn vỡ)/gi,
  /(giọng|âm thanh|giọng nói)[^.?!…]{0,10}(run run|run rẩy|nghẹn lại|lạc đi)/gi,
  /(ánh mắt|đôi mắt)[^.?!…]{0,14}(sâu thẳm|u buồn|vô hồn|phức tạp|khó hiểu|long lanh|ngấn lệ)/gi,
  /(siết chặt (nắm tay|bàn tay)|cắn (chặt )?(môi|môi dưới))/gi,
  /(không thốt nên lời|nghẹn (lại )?(nơi )?cổ họng|lặng người( đi)?|sững sờ|đứng hình)/gi,
  /(thời gian|không gian)[^.?!…]{0,10}(như )?(ngừng|ngưng|đông cứng|đông lại)/gi,
  /(hít (vào )?một hơi (thật )?sâu|thở dài (một hơi|não nề))/gi,
];

const TRANSITION_OPENERS = [
  "Và rồi",
  "Rồi thì",
  "Thế rồi",
  "Bỗng nhiên",
  "Bỗng",
  "Đột nhiên",
  "Bất chợt",
  "Bất giác",
  "Chợt",
  "Ngay lúc đó",
  "Ngay lúc này",
  "Lúc này",
];

// Subject words that, when repeated at sentence start, produce the machine cadence.
const SUBJECT_OPENERS = new Set([
  "cô", "anh", "nàng", "hắn", "tôi", "ông", "bà", "cậu", "em", "chị", "họ", "gã", "y",
]);

const ADVERBIAL_MOT_CACH = /một cách\s+[a-zà-ỹ]+/gi;
const FILLER = /\b(sự|việc|điều|rằng|khiến cho)\b/gi;

export type VietnameseAiVoiceReport = {
  words: number;
  sentences: number;
  clicheHits: number;
  clichePer1000: number;
  adverbialMotCach: number;
  motCachPer1000: number;
  fillerHits: number;
  fillerPer1000: number;
  transitionOpeners: number;
  transitionPer1000: number;
  topSubjectOpener: string | null;
  sameSubjectOpenerShare: number; // 0..1, share of sentences opening with the most common subject word
  maxSameSubjectStreak: number; // longest run of consecutive sentences opening with the same subject
  score: number; // 0..1 composite, higher = more AI-like
  needsRepair: boolean;
};

function countMatches(text: string, patterns: readonly RegExp[]): number {
  let total = 0;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) total += m.length;
  }
  return total;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstWord(sentence: string): string {
  const cleaned = sentence.replace(/^[\s"'“”‘’\-—(\[]+/, "");
  const match = cleaned.match(/^[A-Za-zÀ-ỹ]+/);
  return match ? match[0].toLowerCase() : "";
}

export function analyzeVietnameseAiVoice(text: string): VietnameseAiVoiceReport {
  const words = text.split(/\s+/).filter(Boolean).length;
  const per1000 = (n: number) => (words > 0 ? (n / words) * 1000 : 0);

  const clicheHits = countMatches(text, CLICHE_VARIANT_PATTERNS);
  const adverbialMotCach = (text.match(ADVERBIAL_MOT_CACH) || []).length;
  const fillerHits = (text.match(FILLER) || []).length;

  const sentences = splitSentences(text);
  const openers = sentences.map(firstWord);

  // transition openers
  let transitionOpeners = 0;
  const transitionLower = TRANSITION_OPENERS.map((t) => t.toLowerCase());
  for (const s of sentences) {
    const low = s.toLowerCase();
    if (transitionLower.some((t) => low.startsWith(t))) transitionOpeners += 1;
  }

  // same-subject opener share + longest streak
  const subjectCounts = new Map<string, number>();
  for (const w of openers) {
    if (SUBJECT_OPENERS.has(w)) subjectCounts.set(w, (subjectCounts.get(w) ?? 0) + 1);
  }
  let topSubjectOpener: string | null = null;
  let topCount = 0;
  for (const [w, c] of subjectCounts) {
    if (c > topCount) {
      topCount = c;
      topSubjectOpener = w;
    }
  }
  const sameSubjectOpenerShare = sentences.length > 0 ? topCount / sentences.length : 0;

  let maxSameSubjectStreak = 0;
  let streak = 0;
  let prev = "";
  for (const w of openers) {
    if (w && w === prev && SUBJECT_OPENERS.has(w)) {
      streak += 1;
    } else {
      streak = SUBJECT_OPENERS.has(w) ? 1 : 0;
    }
    maxSameSubjectStreak = Math.max(maxSameSubjectStreak, streak);
    prev = w;
  }

  // Composite: weight the signals that best separate AI cadence from human prose.
  const score = Math.min(
    1,
    per1000(clicheHits) * 0.18 +
      per1000(adverbialMotCach) * 0.12 +
      per1000(transitionOpeners) * 0.05 +
      Math.max(0, sameSubjectOpenerShare - 0.3) * 1.4 +
      Math.max(0, maxSameSubjectStreak - 2) * 0.12,
  );

  const needsRepair =
    clicheHits >= 2 ||
    sameSubjectOpenerShare >= 0.45 ||
    maxSameSubjectStreak >= 4 ||
    per1000(adverbialMotCach) >= 3 ||
    score >= 0.35;

  return {
    words,
    sentences: sentences.length,
    clicheHits,
    clichePer1000: per1000(clicheHits),
    adverbialMotCach,
    motCachPer1000: per1000(adverbialMotCach),
    fillerHits,
    fillerPer1000: per1000(fillerHits),
    transitionOpeners,
    transitionPer1000: per1000(transitionOpeners),
    topSubjectOpener,
    sameSubjectOpenerShare,
    maxSameSubjectStreak,
    score,
    needsRepair,
  };
}

// ─── Repair instruction ─────────────────────────────────────────────────────

export function buildVietnameseAiVoiceRepairInstruction(report: VietnameseAiVoiceReport): string {
  const lines: string[] = [
    "VIETNAMESE AI-VOICE REPAIR — this chapter reads machine-written in Vietnamese. Fix the specific tics below while keeping every plot fact, name, and line of dialogue identical:",
  ];
  if (report.clicheHits > 0) {
    lines.push(
      `- ${report.clicheHits} cliché cảm xúc kiểu dịch máy (vd "tim thắt lại", "khóe mắt cay", "nước mắt lăn dài", "ánh mắt sâu thẳm", "giọng run run"). Thay bằng hành vi và chi tiết cụ thể của riêng cảnh này.`,
    );
  }
  if (report.adverbialMotCach > 0) {
    lines.push(
      `- ${report.adverbialMotCach} lần "một cách + tính từ" (vd "nói một cách lạnh lùng"). Bỏ; thay bằng động từ mạnh và hành động cụ thể.`,
    );
  }
  if (report.transitionOpeners > 1) {
    lines.push(
      `- ${report.transitionOpeners} câu mở bằng "Và rồi / Bỗng nhiên / Đột nhiên / Ngay lúc đó". Vào thẳng hành động, bỏ rào đón.`,
    );
  }
  if (report.maxSameSubjectStreak >= 3 || report.sameSubjectOpenerShare >= 0.35) {
    lines.push(
      `- Nhiều câu liên tiếp mở đầu bằng cùng một chủ ngữ ("${report.topSubjectOpener ?? "cô"}..."). Đảo cấu trúc câu, gộp câu, hoặc đổi điểm vào — đừng để nhịp "Cô... Cô... Cô..." kiểu máy.`,
    );
  }
  lines.push(
    "Giữ giọng theo style blueprint và đa dạng nhịp câu. Không thêm tình tiết, nhân vật, hay đoạn kết mới.",
  );
  return lines.join("\n");
}
