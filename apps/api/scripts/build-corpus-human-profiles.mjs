#!/usr/bin/env node
/**
 * Build STRUCTURAL PROFILES from human-written reference texts in corpus-human/.
 *
 * IMPORTANT: this reads the source files but writes NONE of their wording. It only
 * emits abstract, machine-generated descriptions of structure (opening mode, rhythm
 * stats, dialogue density, ending shape, motif tags). Structure/technique is not
 * copyrightable; verbatim text is — so nothing verbatim is ever stored or shipped.
 * This lets us learn from great prose (incl. copyrighted works) without copying it.
 *
 * Output: corpus/human-profiles.jsonl  (source: "human")
 *
 * Usage:
 *   npx tsx scripts/build-corpus-human-profiles.mjs
 */

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitParagraphs, scoreDialogue, thematicTags } from './corpus-lib.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..');
process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;

const { analyzeSentenceVariance } = await import('../../../src/modules/core-pipeline/validators/sentence-variance.js');

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC_DIR = path.join(REPO_ROOT, 'corpus-human');
const OUT_DIR = path.join(REPO_ROOT, 'corpus');

function cvLabel(cv) {
  if (cv >= 0.65) return 'biến thiên cao (câu ngắn xen câu dài, rất người)';
  if (cv >= 0.5) return 'biến thiên vừa';
  return 'khá đều';
}
function hasDialogue(p) {
  return /[\u201C\u201D]/.test(p) || /"[^"]+"/.test(p);
}
function wordCount(p) {
  return p.split(/\s+/).filter(Boolean).length;
}

// Motif label map (Vietnamese, structural — no source wording).
const MOTIF_LABEL = {
  quan_he_ran_nut: 'quan hệ rạn nứt / chia ly',
  si_nhuc: 'sỉ nhục / mất mặt',
  giay_to_quyen_luc: 'giấy tờ & quyền lực',
  ha_minh_hoi_han: 'hạ mình / hối hận',
  than_phan_bi_mat: 'thân phận bí mật',
};
function motifPhrase(text) {
  const tags = thematicTags(text);
  if (tags.length === 0) return 'xung đột quan hệ đời thường';
  return tags.map((t) => MOTIF_LABEL[t] ?? t).join(', ');
}

function describeOpening(paras) {
  const head = paras.slice(0, 3);
  if (head.length === 0) return null;
  const first = head[0];
  const joined = head.join(' ');
  let mode;
  if (/^[\u201C"]/.test(first)) mode = 'mở truyện bằng một câu thoại trực diện gây chú ý';
  else if (/\b(năm|bảy năm|nhiều năm|hồi ấy|trước đây|năm ấy|\d+\s*tuổi|quá khứ)\b/i.test(joined)) mode = 'mở bằng cảnh hiện tại rồi hé lộ mâu thuẫn quá khứ';
  else mode = 'mở bằng một cảnh/hành động cụ thể, cắm người đọc vào tình huống ngay';
  const cv = analyzeSentenceVariance(joined).cv;
  const dlg = head.some(hasDialogue) ? 'có xen thoại sớm' : 'chưa dùng thoại ở đoạn mở';
  return `MẪU CẤU TRÚC MỞ ĐẦU (rút từ văn người thật — CÔNG THỨC để học, KHÔNG phải câu để chép): ${mode}; đoạn mở khoảng ${wordCount(first)} từ, nhịp câu ${cvLabel(cv)}, ${dlg}; mô-típ: ${motifPhrase(joined)}. Học cách vào truyện và cách rải thông tin nền, rồi tự viết bằng câu chữ của mình.`;
}

function describeDialogue(paras) {
  let best = null;
  let bestScore = 0;
  for (const p of paras) {
    const s = scoreDialogue(p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  if (!best || bestScore < 5) return null;
  const cv = analyzeSentenceVariance(best).cv;
  return `MẪU CẤU TRÚC ĐỐI THOẠI CAO TRÀO (rút từ văn người thật — CÔNG THỨC, KHÔNG phải câu để chép): trao đổi thoại ngắn và dứt khoát, áp lực dồn qua câu hỏi/phủ nhận/gần-thú-nhận; xen hành động hoặc quan sát ngắn giữa các lượt thoại thay vì tả cảm xúc trực tiếp; nhịp câu ${cvLabel(cv)}; mô-típ: ${motifPhrase(best)}. Mô phỏng cách để thoại tự gánh xung đột, KHÔNG chép lời.`;
}

function describeEnding(paras) {
  if (paras.length === 0) return null;
  const tail = paras.slice(-3).join(' ');
  const last = paras[paras.length - 1];
  let mode;
  if (/[?？]\s*[\u201D"]?\s*$/.test(last)) mode = 'dừng ở một câu hỏi treo lơ lửng';
  else if (/…\s*$|\.\.\.\s*$/.test(last)) mode = 'dừng lấp lửng, bỏ ngỏ điều chưa nói';
  else mode = 'dừng ở một hành động hoặc hình ảnh đọng lại, không giải thích thêm';
  return `MẪU CẤU TRÚC KẾT (rút từ văn người thật — CÔNG THỨC, KHÔNG phải câu để chép): ${mode}; 1-2 câu cuối chậm lại và cô đọng để tạo dư vị/hook đọc tiếp; mô-típ: ${motifPhrase(tail)}. Học cách chọn điểm dừng, tự viết câu của mình.`;
}

let files = [];
try {
  files = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.txt'));
} catch {
  console.error(`No ${SRC_DIR} directory. Create it and add .txt reference files.`);
  process.exit(1);
}

const profiles = [];
for (const file of files) {
  const raw = readFileSync(path.join(SRC_DIR, file), 'utf8');
  let paras = splitParagraphs(raw);
  // Drop a short title line if present.
  if (paras.length && paras[0].length < 40 && !/[.!?…”]$/.test(paras[0])) paras = paras.slice(1);
  if (paras.length < 3) continue;

  const srcId = 'H' + String(profiles.length + 1).padStart(2, '0');
  const add = (type, text) => {
    if (!text) return;
    profiles.push({
      excerpt_id: `${srcId}-${type}`,
      source: 'human',
      niche: 'human_general',
      excerpt_type: type,
      tags: ['human', type],
      text, // structural description ONLY — no source wording
    });
  };
  add('opening', describeOpening(paras));
  add('high_tension_dialogue', describeDialogue(paras));
  add('chapter_ending', describeEnding(paras));
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'human-profiles.jsonl'), profiles.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');

const byType = {};
for (const p of profiles) byType[p.excerpt_type] = (byType[p.excerpt_type] ?? 0) + 1;
console.log(`source files : ${files.length}`);
console.log(`profiles     : ${profiles.length} (structural descriptions only — no verbatim text)`);
console.log(`by type      : ${JSON.stringify(byType)}`);
console.log(`output       : ./corpus/human-profiles.jsonl`);
