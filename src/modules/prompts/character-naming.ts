/**
 * Character naming policy — shared between desktop and web prompt builders.
 *
 * Goals:
 * 1. Widen the name bank well beyond the small overused given-name pool so the
 *    cast feels fresh across many generations.
 * 2. Support Sino-Vietnamese (Hán-Việt) transcribed names (e.g. Diệc Phi,
 *    Nhược Nam, Tử Hàn) as a first-class option alongside modern Vietnamese
 *    names, so romance/period/xianxia-leaning niches can read authentically.
 * 3. Enforce ONE consistent naming register per story: every named character
 *    must come from the same register. Do not mix modern-Vietnamese names with
 *    Sino-Vietnamese transcribed names inside a single story.
 */

/** Modern Vietnamese given names, deliberately wide to reduce collisions. */
export const VIETNAMESE_GIVEN_NAME_POOL = [
  "Tâm", "Khuê", "Diệp", "Trúc", "Quyên", "Bích", "Tuyền", "Diễm", "Như", "Quỳnh",
  "Hiền", "Bảo", "Châu", "Giang", "Hương", "Lâm", "Mỹ", "Ngân", "Nhung", "Uyên",
  "Vân", "Xuân", "Chi", "Đào", "Hà", "Huệ", "Loan", "Ly", "Nga", "Nhi",
  "Thư", "Thúy", "Tiên", "Trinh", "Tuyết", "Vy", "An", "Đan", "Hân", "Khánh",
  "Mai Anh", "Phương Nhi", "Thanh Trúc", "Bảo Hân", "Diệu", "Hạ", "Kim Chi", "Lệ",
];

/** Sino-Vietnamese (Hán-Việt) transcribed given names for a classical register. */
export const SINO_VIETNAMESE_GIVEN_NAME_POOL = [
  "Diệc Phi", "Nhược Nam", "Tử Hàn", "Mộ Dung", "Thanh Tuyết", "Lạc Hy", "Hàn Yên",
  "Tịch Nhan", "Vân Thư", "Lăng Nhi", "Yến Chi", "Thẩm Du", "Cẩm Tâm", "Bạch Lộ",
  "Tô Diệp", "Lục Ly", "Phù Dao", "Cố Niệm", "Mặc Lan", "Tuyết Kỳ", "Hạ Vũ",
  "Thiên Lam", "Vũ Yên", "Khương Tuyết", "Liễu Như", "Tần Xuyên", "Diệp Tử",
  "Hứa Thanh", "Đường Niệm", "Phượng Khanh", "Ngọc Trản", "Yên Nhiên",
];

/** Sino-Vietnamese family names that pair naturally with the classical register. */
export const SINO_VIETNAMESE_FAMILY_NAME_POOL = [
  "Mộ Dung", "Thẩm", "Tô", "Lục", "Cố", "Hứa", "Đường", "Tần", "Khương", "Liễu",
  "Bạch", "Tạ", "Lăng", "Phó", "Tiêu", "Hạ", "Vệ", "Lâm", "Hàn", "Tống",
];

export const BANNED_OVERUSED_GIVEN_NAMES = [
  "Linh", "Mai", "Lan", "Hoa", "Ngọc", "Anh", "Hằng", "Huyền", "Trang", "Phương", "Thảo", "Yến",
];

export const BANNED_OVERUSED_MIDDLE_NAMES = [
  "Minh", "Thị", "Văn", "Hồng", "Thanh", "Thu", "Kim",
];

/**
 * Render the full character naming policy block for a story bible prompt.
 *
 * @param recentCharacterNamesBlock Optional pre-rendered "recent names to
 *        avoid" block (from renderRecentCharacterNamesForPrompt). Included at
 *        the end when present.
 */
export function renderCharacterNamingPolicyForPrompt(recentCharacterNamesBlock?: string): string {
  const lines = [
    "CHARACTER NAMING POLICY (hard constraint for heroine, betrayer, rival, and EVERY supporting character with a name):",
    "1. NAMING REGISTER LOCK: Before naming anyone, silently choose ONE naming register for the whole story and apply it to the ENTIRE cast:",
    "   - Register A — modern Vietnamese names (e.g. Trần Diệp Khuê, Lê Bảo Hân, Nguyễn Tuệ Lâm).",
    "   - Register B — Sino-Vietnamese / Hán-Việt transcribed names (e.g. Mộ Dung Diệc Phi, Thẩm Nhược Nam, Cố Tử Hàn).",
    "   Pick the register that best fits the niche, setting, and style preset (period / xianxia / palace / elite-dynasty tones favor Register B; contemporary urban tones favor Register A).",
    "2. DO NOT MIX REGISTERS inside one story. If the heroine has a Sino-Vietnamese name, the betrayer, rival, family, and minor characters must also use Sino-Vietnamese names — never one modern-Vietnamese name beside a Hán-Việt name.",
    "3. Use a fresh, distinct full name for every named character; no two characters share a given name or sound confusingly similar.",
    "4. Diversify ALL name positions (family name, middle name, given name), not just the final given name.",
    `5. BANNED overused given names (avoid in either register): ${BANNED_OVERUSED_GIVEN_NAMES.join(", ")}.`,
    `6. BANNED overused middle-name tokens: ${BANNED_OVERUSED_MIDDLE_NAMES.join(", ")}.`,
    `7. PREFERRED modern Vietnamese given-name pool (Register A): ${VIETNAMESE_GIVEN_NAME_POOL.join(", ")}.`,
    `8. PREFERRED Sino-Vietnamese given-name pool (Register B): ${SINO_VIETNAMESE_GIVEN_NAME_POOL.join(", ")}.`,
    `9. PREFERRED Sino-Vietnamese family-name pool (Register B): ${SINO_VIETNAMESE_FAMILY_NAME_POOL.join(", ")}.`,
    "10. Keep the chosen register consistent across all chapters, the relationship graph, and any later rewrite.",
  ];

  if (recentCharacterNamesBlock && recentCharacterNamesBlock.trim()) {
    lines.push(recentCharacterNamesBlock.trim());
  }

  return lines.join("\n");
}
