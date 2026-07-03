// Shared helpers for corpus building (pure JS, usable from node or tsx).

export const CONFLICT_WORDS = /(yêu|chết|cút|cưới|giết|ly hôn|hủy hôn|phản bội|đừng|dám|biến|xin lỗi|ghét|nhục|quỳ|tha|cầu xin|thề|hối hận|đuổi|phá sản)/i;

export function splitParagraphs(text) {
  if (!text) return [];
  let paras = String(text).split(/\n{2,}/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  if (paras.length < 2) {
    paras = String(text).split(/\n/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  }
  return paras;
}

export function scoreDialogue(paragraph) {
  let score = 0;
  const smartPairs = Math.min(
    (paragraph.match(/\u201C/g) || []).length,
    (paragraph.match(/\u201D/g) || []).length,
  );
  if (smartPairs > 0) score += 3;
  else if (/"[^"]+"/.test(paragraph)) score += 2;
  if (/[!?！？]/.test(paragraph)) score += 2;
  if (CONFLICT_WORDS.test(paragraph)) score += 2;
  const len = paragraph.length;
  if (len >= 20 && len <= 260) score += 1;
  return score;
}

export function thematicTags(text) {
  const tags = [];
  const add = (re, tag) => { if (re.test(text)) tags.push(tag); };
  add(/ly hôn|hủy hôn|phản bội|ngoại tình|tiểu tam/i, 'quan_he_ran_nut');
  add(/nhục|khinh|coi thường|sỉ nhục|đuổi/i, 'si_nhuc');
  add(/hợp đồng|thừa kế|cổ phần|kiểm toán|di chúc/i, 'giay_to_quyen_luc');
  add(/quỳ|cầu xin|hối hận|van xin/i, 'ha_minh_hoi_han');
  add(/bí mật|thân phận|giấu|hoá ra/i, 'than_phan_bi_mat');
  return tags;
}

/** Trim an excerpt to at most `maxChars`, cutting on a sentence boundary. */
export function trimToChars(text, maxChars) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('… '), slice.lastIndexOf('”'));
  return (lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak + 1) : slice).trim();
}

const NEUTRAL_NAMES = ['Linh', 'Khánh', 'Tú', 'Vy', 'Nam', 'Hân', 'Duy', 'Mai', 'Phong', 'An', 'Quân', 'Thảo'];

/**
 * Replace proper names with neutral ones.
 * - `knownNames`: exact character names (from a story bible) — replaced precisely.
 * - Then a frequency pass replaces capitalized multi-syllable sequences that recur
 *   often (>= minFreq), catching names the bible does not list (e.g. male lead).
 * Imperfect (may hit some place names) but good enough to de-identify a corpus.
 */
export function anonymizeText(text, knownNames = [], minFreq = 4) {
  let out = String(text);
  const map = new Map();
  let idx = 0;
  const assign = (name) => {
    if (!map.has(name)) {
      map.set(name, NEUTRAL_NAMES[idx % NEUTRAL_NAMES.length]);
      idx += 1;
    }
    return map.get(name);
  };

  const known = [...new Set(knownNames)].filter((n) => n && n.length >= 2).sort((a, b) => b.length - a.length);
  for (const n of known) {
    out = out.split(n).join(assign(n));
  }

  const re = /[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s[A-ZÀ-Ỹ][a-zà-ỹ]+){1,2}/g;
  const counts = new Map();
  for (const m of out.match(re) || []) counts.set(m, (counts.get(m) || 0) + 1);
  const frequent = [...counts.entries()].filter(([, c]) => c >= minFreq).sort((a, b) => b[1] - a[1]);
  for (const [name] of frequent) {
    if (map.has(name)) continue;
    out = out.split(name).join(assign(name));
  }
  return out;
}
