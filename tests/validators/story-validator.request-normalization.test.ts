import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFullGenerateRequest, normalizeOutlineRequest, validateChapterDraft } from "../../src/modules/validators/story-validator";

test("normalizeOutlineRequest defaults outputLanguage to english", () => {
  const normalized = normalizeOutlineRequest({
    titleHint: "The Girl He Never Named",
  });

  assert.equal(normalized.outputLanguage, "english");
});

test("normalizeOutlineRequest defaults to the first niche and internal viral style", () => {
  const normalized = normalizeOutlineRequest({
    titleHint: "The Girl He Never Named",
  });

  assert.equal(normalized.linePreset, "billionaire_rich_poor_romance");
  assert.equal(normalized.stylePreset, "billionaire_rich_poor_romance__tiktok_hook_pacing");
});

test("normalizeOutlineRequest migrates removed legacy branch preset ids", () => {
  const normalized = normalizeOutlineRequest({
    titleHint: "The Girl He Never Named",
    linePreset: "betrayal_romance_revenge_class_shame",
    stylePreset: "betrayal_romance_revenge_class_shame__polite_social_knife",
  });

  assert.equal(normalized.linePreset, "billionaire_rich_poor_romance");
  assert.equal(normalized.stylePreset, "billionaire_rich_poor_romance__polite_social_knife");
});

test("normalizeFullGenerateRequest migrates old full-story payloads before preset loading", () => {
  const normalized = normalizeFullGenerateRequest({
    titleHint: "The Girl He Never Named",
    linePreset: "betrayal_romance_revenge_class_shame",
    stylePreset: "betrayal_romance_revenge_class_shame__slow_burn_suppressed_confession",
    draftControls: {
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
  });

  assert.equal(normalized.linePreset, "billionaire_rich_poor_romance");
  assert.equal(normalized.stylePreset, "billionaire_rich_poor_romance__slow_burn_suppressed_confession");
});

test("normalizeOutlineRequest drops removed inspiration and character seed fields", () => {
  const legacyInput = {
    titleHint: "The Girl He Never Named",
    inspiredByPreset: "commercial_emotional_damage_romance",
    characterSeed: {
      heroine: "Mina",
      betrayer: "Evan",
      rival: "Celeste",
    },
  } as Record<string, unknown>;
  const normalized = normalizeOutlineRequest(legacyInput as never);

  assert.equal(Object.hasOwn(normalized, "inspiredByPreset"), false);
  assert.equal(Object.hasOwn(normalized, "characterSeed"), false);
});

test("normalizeOutlineRequest accepts a detailed world and character brief as settingSeed", () => {
  const detailedSeed = [
    'Thế giới: Ngành phục chế đồ cổ và thẩm định nghệ thuật cao cấp - nơi "đẳng cấp" được đo bằng dòng máu và sự tinh tế truyền đời, chứ không phải số dư tài khoản.',
    'Nhân vật chính (An): Một chuyên gia phục chế thiên tài, người có khả năng "ngửi" thấy lịch sử của đồ vật. An luôn che giấu quá khứ là con gái của một người thu mua phế liệu.',
    'Kẻ phản bội (Duy): Công tử của một gia tộc nghệ thuật đang lụi bại. Duy yêu An, nhưng thực chất là "yêu" đôi bàn tay và khối óc của cô để cứu vãn danh tiếng gia đình mình.',
    'Yếu tố "Class Shame": mẹ chồng tương lai dùng khăn lụa lau tay sau khi chạm vào An, và Duy yêu cầu An không được nói giọng địa phương khi gặp đối tác.',
  ].join("\n\n");

  assert.ok(detailedSeed.length > 240);

  const normalized = normalizeOutlineRequest({
    titleHint: "Mùi Hương Của Cổ Vật",
    settingSeed: detailedSeed,
  });

  assert.equal(normalized.settingSeed, detailedSeed);
});

test("normalizeFullGenerateRequest preserves explicit outputLanguage", () => {
  const normalized = normalizeFullGenerateRequest({
    titleHint: "The Girl He Never Named",
    outputLanguage: "spanish",
    draftControls: {
      targetWordsPerChapter: 1200,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
  });

  assert.equal(normalized.outputLanguage, "spanish");
});

test("normalizeFullGenerateRequest does not add a manual chapter word target", () => {
  const normalized = normalizeFullGenerateRequest({
    titleHint: "The Girl He Never Named",
  });

  assert.equal("targetWordsPerChapter" in normalized.draftControls, false);
  assert.equal(normalized.draftControls.dialogueRatio, 0.55);
  assert.equal(normalized.draftControls.hookDensity, "high");
});

test("validateChapterDraft accepts template-style chapter_id and content aliases", () => {
  const chapter = validateChapterDraft(
    {
      chapter_id: 6,
      title: "The Cold Receipt",
      summary: "FORESHADOW_CH2_ACTIVATED: the receipt returns with a new meaning.",
      content: Array.from({ length: 45 }, () => "Mina folded the receipt once and placed it under the empty glass.").join(" "),
    },
    6,
  );

  assert.equal(chapter.chapterNumber, 6);
  assert.equal(chapter.title, "The Cold Receipt");
  assert.match(chapter.text, /empty glass/);
});

test("validateChapterDraft strips internal architecture labels from chapter summaries", () => {
  const chapter = validateChapterDraft(
    {
      chapter_id: 10,
      title: "The First Win",
      summary: "FIRST_WIN, PRESSURE_RELEASE: Mina makes the board need her before she forgives anyone.",
      content: Array.from({ length: 45 }, () => "Mina let the boardroom sit in silence before she opened the second envelope.").join(" "),
    },
    10,
  );

  assert.equal(chapter.summary, "Mina makes the board need her before she forgives anyone.");
  assert.doesNotMatch(chapter.summary, /FIRST_WIN|PRESSURE_RELEASE|PROTAGONIST_STATE_END|CLOSING_LINE/);
});
