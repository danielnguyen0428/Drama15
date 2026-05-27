import assert from "node:assert/strict";
import test from "node:test";

import {
  renderChapterMarkdownFiles,
  renderStoryMarkdown,
  renderStoryPdfHtml,
} from "../../src/modules/exporters/markdown-exporter";
import type { StoryPayload } from "../../src/types/story";

function makeStoryPayload(): StoryPayload {
  const chapterPlan = Array.from({ length: 10 }, (_, index) => ({
    chapterNumber: index + 1,
    title: `Chương ${index + 1}`,
    hook: `Hook ${index + 1}`,
    mainBeat: `Nhịp ${index + 1}`,
    humiliationProgression: `Nhục mạ ${index + 1}`,
    revengeProgression: `Trả đũa ${index + 1}`,
    endingBeat: `Kết ${index + 1}`,
  }));

  return {
    title: "Cô Gái Trong Căn Nhà Kính",
    request: {
      titleHint: "Cô Gái Trong Căn Nhà Kính",
      linePreset: "cheating_ex_wedding_drama",
      stylePreset: "cheating_ex_wedding_drama__tiktok_hook_pacing",
      outputLanguage: "vietnamese",
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: {
        betrayalType: "bị yêu trong bí mật",
        shameType: "nhục mạ giai cấp lịch sự",
        revengeMode: "rút tay khỏi hệ thống vận hành",
        endingMode: "phẩm giá trước tình yêu",
        intensity: 0.84,
      },
      settingSeed: "gia đình giàu và văn phòng đầu tư",
      chapterCount: 10,
      draftControls: {
        targetWordsPerChapter: 2500,
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    concept: {
      title: "Cô Gái Trong Căn Nhà Kính",
      titleCandidates: ["Cô Gái Trong Căn Nhà Kính"],
      logline: "Một cô gái bị giấu trong bóng tối học cách rút khỏi người đã dùng cô.",
      promise: "Đau tình yêu chuyển thành phục hồi phẩm giá.",
      conflictEngine: "Anh ta cần cô nhưng không dám chọn cô ngoài sáng.",
    },
    storyBible: {
      premise: "Cô gái bị loại khỏi tương lai mình đã xây.",
      heroine: {
        name: "Linh",
        wound: "quá ham được chọn",
        strengths: ["bền", "giỏi", "tỉnh"],
        blindSpots: ["nhẫn quá lâu"],
      },
      betrayer: {
        name: "Minh",
        wound: "sợ mất vị thế",
        cowardiceVector: "không cứu cô ở nơi công khai",
      },
      rival: {
        name: "An",
        socialPower: "tiểu thư đúng chuẩn",
        demeanor: "lịch sự nhưng khinh tinh tế",
      },
      classHierarchy: ["nhà giàu", "nhân viên vô hình"],
      betrayalEngine: "giấu tình yêu và công khai người khác",
      classShameEngine: "lịch sự loại trừ",
      revengeEngine: "rút khỏi hệ thống vận hành",
      endingMode: "dignity_first",
    },
    chapterPlan,
    chapters: [
      {
        chapterNumber: 1,
        title: "Chiếc váy không dành cho tôi",
        summary: "Linh chọn váy cưới cho người từng hứa cưới cô.",
        text: "Tôi là người chọn váy cưới cho cô dâu của người từng hứa sẽ cưới tôi.",
      },
      {
        chapterNumber: 2,
        title: "Căn phòng không gọi tên",
        summary: "Linh nhận ra mình chỉ được giữ lại khi hữu ích.",
        text: "Không ai đuổi tôi ra khỏi căn phòng đó. Họ chỉ quên đặt ghế cho tôi.",
      },
    ],
    continuityLite: {
      heroineName: "Linh",
      betrayerName: "Minh",
      rivalName: "An",
      coreReveal: "Minh cần Linh nhưng không chọn cô.",
      endingMode: "dignity_first",
      chapterState: [],
    },
    meta: {
      generatedAt: "2026-04-24T00:00:00.000Z",
      modelAliases: {
        planner: "planner",
        bible: "bible",
        drafter: "drafter",
        rewriter: "rewriter",
        fallback: "fallback",
      },
    },
  };
}

test("renderStoryMarkdown omits removed inspiration metadata", () => {
  const markdown = renderStoryMarkdown(makeStoryPayload());

  assert.match(markdown, /- Niche: cheating_ex_wedding_drama/);
  assert.doesNotMatch(markdown, /Văn phong/);
  assert.doesNotMatch(markdown, /Inspired by|Cảm hứng/i);
});

test("renderChapterMarkdownFiles creates one standalone markdown file per drafted chapter", () => {
  const files = renderChapterMarkdownFiles(makeStoryPayload());

  assert.equal(files.length, 2);
  assert.equal(files[0]?.filename, "01-chiec-vay-khong-danh-cho-toi.md");
  assert.match(files[0]?.markdown ?? "", /^# Chương 1 - Chiếc váy không dành cho tôi/m);
  assert.match(files[0]?.markdown ?? "", /Truyện: Cô Gái Trong Căn Nhà Kính/);
  assert.match(files[1]?.markdown ?? "", /^# Chương 2 - Căn phòng không gọi tên/m);
});

test("chapter markdown exports only the chapter prose without internal summary metadata", () => {
  const story = makeStoryPayload();
  story.chapters[0].summary = "FIRST_WIN, PRESSURE_RELEASE: Linh takes the room back.";
  const [file] = renderChapterMarkdownFiles(story);

  assert.doesNotMatch(file?.markdown ?? "", /## Tóm tắt|FIRST_WIN|PRESSURE_RELEASE|PROTAGONIST_STATE_END|CLOSING_LINE/);
  assert.match(file?.markdown ?? "", /## Nội dung/);
});

test("renderStoryPdfHtml returns a complete printable HTML document for the full story", () => {
  const html = renderStoryPdfHtml(makeStoryPayload());

  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Cô Gái Trong Căn Nhà Kính<\/title>/);
  assert.match(html, /<h1>Cô Gái Trong Căn Nhà Kính<\/h1>/);
  assert.match(html, /<h2>Chương 1 - Chiếc váy không dành cho tôi<\/h2>/);
  assert.match(html, /<h2>Chương 2 - Căn phòng không gọi tên<\/h2>/);
  assert.doesNotMatch(html, /<script/i);
});

test("story PDF export does not print chapter summary metadata", () => {
  const story = makeStoryPayload();
  story.chapters[0].summary = "PROTAGONIST_STATE_END: Linh is finally steady.";
  const html = renderStoryPdfHtml(story);

  assert.doesNotMatch(html, /class="summary"|PROTAGONIST_STATE_END|FIRST_WIN|PRESSURE_RELEASE|CLOSING_LINE/);
});
