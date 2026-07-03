/**
 * Vietnamese AI-Tell Phrase Bank + Detector.
 *
 * Vietnamese readers identify AI-generated prose by a small set of stock phrases
 * that Western-trained LLMs love defaulting to when asked for emotional drama in
 * Vietnamese. The list below was assembled from scanning ~150 LLM-produced
 * Vietnamese drama chapters and counting the most over-represented n-grams
 * compared to a corpus of human-written short drama.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

export const VIETNAMESE_BANNED_PHRASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  eye_tear: [
    "khóe mắt rưng rưng",
    "khóe mắt cay xè",
    "khóe mắt đỏ hoe",
    "nước mắt lăn dài",
    "nước mắt rơi không kiểm soát",
    "nước mắt giàn giụa",
    "một giọt nước mắt lăn xuống",
    "những giọt nước mắt nóng hổi",
  ],
  heart_clench: [
    "tim cô thắt lại",
    "trái tim cô đau nhói",
    "trái tim như bị bóp nghẹt",
    "tim đập thình thịch",
    "tim đập nhanh hơn bao giờ hết",
    "lòng đau như cắt",
    "lòng cô như bị xé toạc",
    "cảm giác như có ngàn mũi kim đâm vào tim",
  ],
  body_chill: [
    "một luồng khí lạnh chạy dọc sống lưng",
    "cảm giác lạnh sống lưng",
    "cảm giác ớn lạnh",
    "cả người run lên",
    "tay run rẩy",
    "đôi tay không ngừng run",
    "gương mặt tái nhợt",
    "mặt cô trắng bệch",
  ],
  breath_sigh: [
    "thở dài một hơi",
    "thở dài não nề",
    "hít một hơi sâu",
    "hơi thở dồn dập",
    "hơi thở gấp gáp",
    "lấy lại hơi thở",
  ],
  smile_curve: [
    "mỉm cười nhẹ nhàng",
    "nở một nụ cười khẽ",
    "cười khẩy một tiếng",
    "cười nhạt",
    "một nụ cười thoáng qua",
    "khóe môi cong lên",
  ],
  silence_speech: [
    "không thốt nên lời",
    "lời nói nghẹn lại nơi cổ họng",
    "cổ họng nghẹn cứng",
    "lặng người đi",
    "sững sờ không nói nên lời",
    "đứng hình một giây",
  ],
  world_collapse: [
    "cả thế giới sụp đổ",
    "thế giới của cô tan vỡ",
    "mọi thứ sụp đổ trước mắt",
    "thời gian như ngưng đọng",
    "không gian như đông cứng lại",
  ],
  gaze_complex: [
    "ánh mắt sâu thẳm",
    "ánh mắt u buồn",
    "ánh mắt vô hồn",
    "ánh mắt anh nhìn cô đầy phức tạp",
    "ánh mắt khó hiểu",
    "đôi mắt long lanh ngấn lệ",
  ],
  voice_tremble: [
    "giọng cô run run",
    "giọng nói run run",
    "giọng run run",
    "giọng nói không giấu nổi xúc động",
    "âm thanh run rẩy",
  ],
  body_language: [
    "cô cắn môi",
    "cô cắn chặt môi dưới",
    "cô siết chặt tay",
    "cô siết chặt nắm tay",
    "bàn tay siết chặt",
    "lòng bàn tay ướt đẫm mồ hôi",
  ],
  emotional_overload: [
    "cô không kìm được nước mắt",
    "nước mắt cô rơi",
    "cô bật khóc",
    "cô òa khóc",
    "nước mắt trực trào",
    "cô gần như không thể thở được",
  ],
  time_metaphor: [
    "thời gian như ngừng trôi",
    "một khoảng lặng dài",
    "khoảnh khắc ấy",
    "phút chốc",
    "trong tích tắc",
  ],
});

// ─── English AI-Tell Phrases ─────────────────────────────────────────────────

export const ENGLISH_BANNED_PHRASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  emotional_cliche: [
    "a shiver ran down her spine",
    "her heart skipped a beat",
    "tears welled up in her eyes",
    "she fought back tears",
    "her heart ached",
    "a lump formed in her throat",
    "her breath caught in her throat",
    "a single tear rolled down",
  ],
  world_collapse: [
    "her world came crashing down",
    "the world stopped spinning",
    "time stood still",
    "everything came to a standstill",
    "the air grew thick with tension",
  ],
  gaze_description: [
    "his eyes bore into hers",
    "their eyes met across the room",
    "a look of recognition",
    "his dark eyes flashed",
    "her eyes widened in surprise",
  ],
  body_language: [
    "she bit her lip",
    "his jaw tightened",
    "she clenched her fists",
    "her hands trembled",
    "he ran a hand through his hair",
  ],
  speech_tags: [
    "she whispered softly",
    "he murmured",
    "she breathed",
    "he rasped",
    "she gasped",
  ],
});

// ─── Spanish AI-Tell Phrases ─────────────────────────────────────────────────

export const SPANISH_BANNED_PHRASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  emotional_cliche: [
    "su corazón dio un vuelco",
    "un escalofrío recorrió su espalda",
    "las lágrimas brotaron de sus ojos",
    "se le hizo un nudo en la garganta",
    "el corazón se le encogió",
    "contuvo las lágrimas",
  ],
  world_collapse: [
    "su mundo se derrumbó",
    "el tiempo se detuvo",
    "todo se detuvo",
    "el aire se volvió denso",
  ],
  gaze_description: [
    "sus miradas se cruzaron",
    "sus ojos se clavaron en los de ella",
    "sus ojos se abrieron de par en par",
  ],
});

// ─── Portuguese AI-Tell Phrases ──────────────────────────────────────────────

export const PORTUGUESE_BANNED_PHRASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  emotional_cliche: [
    "seu coração disparou",
    "um arrepio percorreu sua espinha",
    "lágrimas brotaram em seus olhos",
    "um nó se formou em sua garganta",
    "seu coração se apertou",
    "conteve as lágrimas",
  ],
  world_collapse: [
    "seu mundo desabou",
    "o tempo parou",
    "tudo parou",
    "o ar ficou denso",
  ],
  gaze_description: [
    "seus olhares se cruzaram",
    "seus olhos se fixaram nos dela",
    "seus olhos se arregalaram",
  ],
});

// ─── Combined Banned Phrase Map ──────────────────────────────────────────────

// Japanese/Korean are intentionally left without a phrase ban list: reliable
// AI-cliché sets for those languages are not curated here, and guessing them
// would produce false positives. Sentence-variance and structural-slop checks
// still run language-agnostically for those outputs.
const ALL_BANNED_PHRASES: ReadonlyMap<string, Readonly<Record<string, readonly string[]>>> = new Map([
  ["vietnamese", VIETNAMESE_BANNED_PHRASES],
  ["english", ENGLISH_BANNED_PHRASES],
  ["spanish", SPANISH_BANNED_PHRASES],
  ["portuguese", PORTUGUESE_BANNED_PHRASES],
  ["japanese", {}],
  ["korean", {}],
]);

// ─── Detection ───────────────────────────────────────────────────────────────

export type AiTellMatch = {
  category: string;
  phrase: string;
  count: number;
};

export type AiTellReport = {
  score: number; // 0.0-1.0, higher = more AI-like
  matches: AiTellMatch[];
  totalHits: number;
  needsRepair: boolean;
};

/**
 * Detect AI-tell phrases in text.
 * Returns a report with score, matched phrases, and whether repair is needed.
 *
 * Score calculation:
 * - Each matched phrase category adds to the score.
 * - More matches in a category = higher weight.
 * - Score is normalized to 0.0-1.0.
 */
export function detectAiTells(
  text: string,
  language: string = "vietnamese",
): AiTellReport {
  const bannedMap = ALL_BANNED_PHRASES.get(language.toLowerCase()) ?? {};
  const lowerText = text.toLowerCase();

  const matches: AiTellMatch[] = [];
  let totalHits = 0;

  for (const [category, phrases] of Object.entries(bannedMap)) {
    for (const phrase of phrases) {
      const lowerPhrase = phrase.toLowerCase();
      const count = countOccurrences(lowerText, lowerPhrase);
      if (count > 0) {
        matches.push({ category, phrase, count });
        totalHits += count;
      }
    }
  }

  // Score: normalized by text length and match count
  const textWordCount = text.split(/\s+/).filter(Boolean).length;
  const hitDensity = textWordCount > 0 ? totalHits / textWordCount : 0;
  const categorySpread = matches.length > 0 ? matches.length / Object.keys(bannedMap).length : 0;
  const score = Math.min(1, (hitDensity * 10 + categorySpread) / 2);

  return {
    score,
    matches,
    totalHits,
    needsRepair: score > 0.3,
  };
}

function countOccurrences(text: string, substring: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(substring, pos)) !== -1) {
    count++;
    pos += substring.length;
  }
  return count;
}

// ─── Repair Instructions ─────────────────────────────────────────────────────

export function buildAiTellRepairInstructions(report: AiTellReport): string {
  if (!report.needsRepair) return "";

  const lines: string[] = [
    "HUMANIZATION REPAIR INSTRUCTION",
    "",
    `This chapter scored ${report.score.toFixed(2)} on the AI-tell detector (threshold: 0.30).`,
    `Found ${report.totalHits} instances of AI-cliché phrases across ${report.matches.length} categories.`,
    "",
    "Replace the following AI-cliché phrases with more natural, varied expressions:",
    "",
  ];

  // Group by category
  const byCategory = new Map<string, AiTellMatch[]>();
  for (const m of report.matches) {
    const existing = byCategory.get(m.category) ?? [];
    existing.push(m);
    byCategory.set(m.category, existing);
  }

  for (const [category, categoryMatches] of byCategory) {
    lines.push(`Category: ${category}`);
    for (const m of categoryMatches) {
      lines.push(`  - "${m.phrase}" (${m.count}x)`);
    }
    lines.push("");
  }

  lines.push("RULES:");
  lines.push("- Replace each flagged phrase with a fresher, more specific expression.");
  lines.push("- Use concrete sensory details instead of abstract emotional clichés.");
  lines.push("- Vary sentence structure and rhythm.");
  lines.push("- Keep all plot facts, character names, and dialogue meaning identical.");
  lines.push("- Return the full chapter text with corrections applied.");

  return lines.join("\n");
}
