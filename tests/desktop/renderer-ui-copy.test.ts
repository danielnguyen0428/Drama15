import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..");

function readProjectFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

test("desktop shell uses the requested Vietnamese title hierarchy", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const mainTs = readProjectFile("src", "electron", "main.ts");

  assert.match(indexHtml, /<title>SÁNG TÁC DRAMA<\/title>/);
  assert.match(indexHtml, /<p class="eyebrow">SÁNG TÁC DRAMA<\/p>/);
  assert.match(indexHtml, /<h1>Drama15 Lite Studio<\/h1>/);
  assert.match(mainTs, /title:\s*"SÁNG TÁC DRAMA"/);
});

test("dropdowns display Vietnamese labels while keeping backend values stable", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.match(indexHtml, /<option value="english">Tiếng Anh<\/option>/);
  assert.match(indexHtml, /<option value="japanese">Tiếng Nhật<\/option>/);
  assert.match(indexHtml, /<option value="korean">Tiếng Hàn<\/option>/);
  assert.match(indexHtml, /<option value="portuguese">Tiếng Bồ Đào Nha<\/option>/);
  assert.match(indexHtml, /<option value="spanish">Tiếng Tây Ban Nha<\/option>/);

  assert.match(rendererJs, /english:\s*"Tiếng Anh"/);
  assert.match(rendererJs, /billionaire_rich_poor_romance:\s*"Niche 1: T\\u1ef7 ph\\u00fa \/ Gi\\u00e0u ngh\\u00e8o \/ T\\u00ecnh y\\u00eau v\\u01b0\\u1ee3t giai c\\u1ea5p"/);
  assert.match(rendererJs, /social_injustice_discrimination_drama:\s*"Niche 7: B\\u1ea5t c\\u00f4ng x\\u00e3 h\\u1ed9i \/ Ph\\u00e2n bi\\u1ec7t \\u0111\\u1ed1i x\\u1eed"/);
  assert.match(rendererJs, /workplace_ceo_power_struggle:\s*"Niche 8: C\\u00f4ng s\\u1edf \/ CEO \/ Tranh quy\\u1ec1n ngh\\u1ec1 nghi\\u1ec7p"/);
  assert.match(rendererJs, /medical_hidden_doctor_life_care:\s*"Niche 9: Y t\\u1ebf \/ B\\u00e1c s\\u0129 \\u1ea9n danh \/ Sinh t\\u1eed v\\u00e0 ch\\u0103m s\\u00f3c"/);
  assert.match(rendererJs, /school_campus_bullying_identity:\s*"Niche 10: H\\u1ecdc \\u0111\\u01b0\\u1eddng \/ Campus \/ B\\u1eaft n\\u1ea1t v\\u00e0 th\\u00e2n ph\\u1eadn"/);
  assert.doesNotMatch(indexHtml, /Preset Văn Phong|style-preset|custom-style-preset/);
  assert.match(rendererJs, /value="\$\{escapeHtml\(option\)\}"/);
});

test("left sidebar sample settings use the default niche title pattern", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const sampleRequest = JSON.parse(readProjectFile("examples", "outline-request.json")) as {
    titleHint?: string;
    settingSeed?: string;
  };
  const fullRequest = JSON.parse(readProjectFile("examples", "full-request.json")) as {
    titleHint?: string;
    linePreset?: string;
    stylePreset?: string;
  };

  assert.match(indexHtml, /placeholder="Poor Girl Marries A Billionaire"/);
  assert.match(indexHtml, /placeholder="Startup xa xỉ và các vòng tròn gia đình thượng lưu"/);

  const visibleValues = [
    sampleRequest.titleHint,
    fullRequest.titleHint,
    sampleRequest.settingSeed,
  ].join("\n");

  assert.match(visibleValues, /Poor Girl Marries A Billionaire/);
  assert.doesNotMatch(
    visibleValues,
    /Cô gái anh chưa từng gọi tên|The Girl He Never Named|luxury startup|hidden_relationship|polite_class|strategic_withdrawal|bittersweet_dignity|quiet, intelligent|polished founder|investor's daughter/i,
  );
  assert.equal(fullRequest.linePreset, "billionaire_rich_poor_romance");
  assert.equal(fullRequest.stylePreset, "billionaire_rich_poor_romance__tiktok_hook_pacing");
});

test("setting seed supports random trending drama generation option", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.match(indexHtml, /<select id="setting-seed-mode">/);
  assert.match(indexHtml, /<option value="custom">Tự nhập bối cảnh<\/option>/);
  assert.match(indexHtml, /<option value="__random_setting_seed__">Ngẫu nhiên - tự sinh theo trending truyện drama hiện nay<\/option>/);
  assert.match(indexHtml, /<textarea id="setting-seed"/);

  assert.match(rendererJs, /const RANDOM_SETTING_SEED_VALUE = "__random_setting_seed__"/);
  assert.match(rendererJs, /function resolveSettingSeedValue/);
  assert.match(rendererJs, /settingSeed: resolveSettingSeedValue/);
});

test("left sidebar removes deprecated inspiration and character seed controls", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.match(indexHtml, /<span>Niche<\/span>/);
  assert.doesNotMatch(indexHtml, /Preset Cảm Hứng|inspired-by-preset/);
  assert.doesNotMatch(indexHtml, /Phác Thảo Nữ Chính|heroine-seed/);
  assert.doesNotMatch(indexHtml, /Phác Thảo Kẻ Phản Bội|betrayer-seed/);
  assert.doesNotMatch(indexHtml, /Phác Thảo Tình Địch|rival-seed/);
  assert.doesNotMatch(rendererJs, /inspiredByPreset|characterSeed|heroineSeed|betrayerSeed|rivalSeed/);
});

test("desktop layout widens settings sidebar and makes dropdown options readable", () => {
  const stylesCss = readProjectFile("desktop", "renderer", "styles.css");

  assert.match(stylesCss, /grid-template-columns:\s*720px minmax\(0, 1fr\) 340px;/);
  assert.match(stylesCss, /\.field select option\s*\{/);
  assert.match(stylesCss, /background:\s*#121214;/);
  assert.match(stylesCss, /color:\s*#f5f1e8;/);
});

test("desktop removes manual chapter word target setting", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.doesNotMatch(indexHtml, /Số Từ Mục Tiêu \/ Chương/);
  assert.doesNotMatch(indexHtml, /id="target-words"/);
  assert.doesNotMatch(rendererJs, /targetWords:\s*byId\("target-words"\)/);
  assert.doesNotMatch(rendererJs, /targetWordsPerChapter:\s*Number\(elements\.targetWords\.value\)/);
  assert.doesNotMatch(rendererJs, /targetWords:\s*elements\.targetWords\.value/);
});

test("chapter result list is compact and uses two columns on desktop", () => {
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const stylesCss = readProjectFile("desktop", "renderer", "styles.css");

  assert.match(rendererJs, /chapter-list compact-chapter-list/);
  assert.match(stylesCss, /\.compact-chapter-list\s*\{/);
  assert.match(stylesCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
});

test("chapter reader does not show internal summary metadata before chapter prose", () => {
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.doesNotMatch(rendererJs, /<strong>Tóm tắt:<\/strong>/);
  assert.doesNotMatch(rendererJs, /selectedChapter\.summary/);
});

test("story result tabs only expose overview plan and chapters", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.match(indexHtml, /data-view="overview"[^>]*>Tổng Quan<\/button>/);
  assert.match(indexHtml, /data-view="plan"[^>]*>Kế Hoạch<\/button>/);
  assert.match(indexHtml, /data-view="chapters"[^>]*>Chương<\/button>/);
  assert.doesNotMatch(indexHtml, /data-view="json"|data-view="markdown"|json-view|markdown-view/);
  assert.doesNotMatch(rendererJs, /renderJson|renderMarkdown|jsonView|markdownView/);
});

test("export panel exposes chapter markdown and full story PDF actions", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");

  assert.match(indexHtml, /id="save-chapters-markdown-button"/);
  assert.match(indexHtml, /Lưu Từng Chương \.md/);
  assert.match(indexHtml, /id="save-story-pdf-button"/);
  assert.match(indexHtml, /Xuất PDF Cả Truyện/);
  assert.doesNotMatch(indexHtml, /preview-markdown-button|save-markdown-button|Xem Trước Markdown|Lưu File Markdown/);
  assert.doesNotMatch(rendererJs, /previewMarkdownButton|saveMarkdownButton|exportMarkdown\(/);
  assert.match(rendererJs, /saveChaptersMarkdown/);
  assert.match(rendererJs, /saveStoryPdf/);
  assert.match(preloadTs, /saveChaptersMarkdown/);
  assert.match(preloadTs, /saveStoryPdf/);
});

test("desktop exposes story history and OmniVoice TTS IPC", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");
  const servicesTs = readProjectFile("src", "modules", "runtime", "create-app-services.ts");

  assert.match(indexHtml, /id="history-list"/);

  assert.match(preloadTs, /getTtsConfig/);
  assert.match(preloadTs, /saveTtsConfig/);
  assert.match(preloadTs, /listTtsVoices/);
  assert.match(preloadTs, /generateStoryVoice/);
  assert.match(preloadTs, /TTS_PROGRESS_CHANNEL/);

  assert.match(mainTs, /tts:get-config/);
  assert.match(mainTs, /tts:save-config/);
  assert.match(mainTs, /tts:list-voices/);
  assert.match(mainTs, /tts:generate-story/);
  assert.match(mainTs, /createTtsProgressForwarder/);

  assert.match(servicesTs, /ttsConfigStore/);
  assert.match(servicesTs, /omniVoiceApiClientFactory/);
  assert.match(servicesTs, /storyTtsService/);
});

test("chapter reader does not expose voice generation actions", () => {
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.doesNotMatch(rendererJs, /data-generate-chapter-voice|data-play-chapter-voice|data-voice-status|Gen Voice|Play Voice|chapterNumbers:\s*\[chapterNumber\]|function getChapterVoiceFile|function toFileUrl/);
  assert.match(rendererJs, /storyBusy:\s*false/);
  assert.doesNotMatch(rendererJs, /data-generate-chapter-voice|data-play-chapter-voice|function getChapterVoiceFile|function toFileUrl/);
});

test("desktop exposes a single full-story generation button", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.doesNotMatch(indexHtml, /id="generate-outline-button"|Tạo Outline/);
  assert.doesNotMatch(rendererJs, /generateOutlineButton|generateOutline\(buildOutlinePayload/);
  assert.match(indexHtml, /id="generate-full-button"[^>]*title="Dựng outline rồi viết đủ 15 chương; tự kiểm tra và sửa chất lượng từng chương\."/);
  assert.match(indexHtml, /Tạo Toàn Bộ Truyện/);
  assert.match(indexHtml, /Tạo đủ Tổng Quan, Kế Hoạch và Chương/);
});

test("desktop exposes automation controls for batch story generation", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");

  assert.match(indexHtml, /id="automation-story-count"/);
  assert.match(indexHtml, /min="1"/);
  assert.match(indexHtml, /max="50"/);
  assert.match(indexHtml, /id="automation-pdf-directory"/);
  assert.match(indexHtml, /id="automation-pdf-browse-button"/);
  assert.match(indexHtml, /id="automation-pdf-save-button"/);
  assert.match(indexHtml, /id="automation-button"/);
  assert.match(indexHtml, />Automation<\/button>/);
  assert.match(rendererJs, /automationStoryCount:\s*byId\("automation-story-count"\)/);
  assert.match(rendererJs, /automationPdfDirectory:\s*byId\("automation-pdf-directory"\)/);
  assert.match(rendererJs, /automationPdfBrowseButton:\s*byId\("automation-pdf-browse-button"\)/);
  assert.match(rendererJs, /automationPdfSaveButton:\s*byId\("automation-pdf-save-button"\)/);
  assert.match(rendererJs, /automationButton:\s*byId\("automation-button"\)/);
  assert.match(rendererJs, /async function runAutomationBatch/);
  assert.match(rendererJs, /async function saveGeneratedStoryPdf/);
  assert.match(rendererJs, /autoSaveStoryPdf/);
  assert.match(rendererJs, /saveAutomationConfig/);
  assert.match(preloadTs, /autoSaveStoryPdf/);
  assert.match(preloadTs, /chooseAutomationPdfDirectory/);
  assert.match(preloadTs, /saveAutomationConfig/);
  assert.match(mainTs, /automation:choose-pdf-directory/);
  assert.match(mainTs, /automation:save-config/);
  assert.match(mainTs, /story:auto-save-story-pdf/);
  assert.match(rendererJs, /function buildAutomationSeedPayload/);
  assert.match(rendererJs, /function buildAutomationFullPayload/);
  assert.match(rendererJs, /pickAutoFillLinePreset/);
});

test("desktop can continue drafting from the first missing chapter after a failed full run", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");

  assert.match(indexHtml, /id="continue-missing-chapters-button"/);
  assert.match(rendererJs, /continueMissingChaptersButton/);
  assert.match(rendererJs, /function getFirstMissingChapterNumber/);
  assert.match(rendererJs, /function buildContinueChapterPayload/);
  assert.match(rendererJs, /function mergeGeneratedChapter/);
  assert.match(rendererJs, /window\.dramaStudio\.generateChapter\(buildContinueChapterPayload/);
  assert.match(preloadTs, /generateChapter/);
  assert.match(mainTs, /request\.stylePreset/);
  assert.match(mainTs, /request\.continuityLite/);
});

test("desktop exposes a compact 9router settings control without rendering API keys", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");

  assert.match(indexHtml, /id="router-settings-button"/);
  assert.match(indexHtml, /aria-label="Cấu hình 9router"/);
  assert.match(indexHtml, /id="router-settings-modal"/);
  assert.match(indexHtml, /id="nine-router-path"/);
  assert.match(indexHtml, /id="nine-router-browse-button"/);
  assert.match(indexHtml, /id="nine-router-save-button"/);

  assert.match(rendererJs, /routerSettingsButton/);
  assert.match(rendererJs, /chooseNineRouterDirectory/);
  assert.match(rendererJs, /saveNineRouterDirectory/);
  assert.match(rendererJs, /renderRouterSettings/);
  assert.doesNotMatch(rendererJs, /apiKey|secret-9router-key/);

  assert.match(preloadTs, /getRouterSettings/);
  assert.match(preloadTs, /chooseNineRouterDirectory/);
  assert.match(preloadTs, /saveNineRouterDirectory/);
  assert.match(mainTs, /router:get-settings/);
  assert.match(mainTs, /router:choose-nine-router-directory/);
  assert.match(mainTs, /router:save-nine-router-directory/);
});

test("story control dropdowns are removed and randomized from the selected niche", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.doesNotMatch(indexHtml, /Kiểu Phản Bội|Kiểu Nhục Mạ|Cách Trả Đũa|Kiểu Kết Thúc/);
  assert.doesNotMatch(indexHtml, /betrayal-type|shame-type|revenge-mode|ending-mode/);
  assert.match(rendererJs, /const NICHE_STORY_CONTROLS = \{/);
  assert.match(rendererJs, /function buildAutoStoryControls/);
  assert.match(rendererJs, /storyControls: buildAutoStoryControls\(linePreset\)/);
});

test("setting seed can be generated by AI and filled back into the form", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");

  assert.doesNotMatch(indexHtml, /id="generate-seed-button"/);
  assert.match(indexHtml, /id="auto-fill-settings-button"/);
  assert.match(indexHtml, /<span>T\u1EF1 t\u1EA1o<\/span>/);
  assert.doesNotMatch(indexHtml, /Nạp Mẫu/);
  assert.doesNotMatch(rendererJs, /loadSampleButton/);
  assert.doesNotMatch(rendererJs, /generateSeedButton/);
  assert.match(rendererJs, /autoFillSettingsButton/);
  assert.match(indexHtml, /class="button-icon"[^>]*>/);
  assert.match(indexHtml, /class="generate-icon"/);
  assert.doesNotMatch(indexHtml, />AI<\/span>/);
  assert.match(rendererJs, /const seedPayload = buildSeedPayload\(\)/);
  assert.match(rendererJs, /const requestedCustomLinePreset = seedPayload\.customCreativeInputs\?\.dramaBranch \|\| ""/);
  assert.match(rendererJs, /generateSettingSeed\(seedPayload\)/);
  assert.match(rendererJs, /function pickAutoFillLinePreset/);
  assert.match(rendererJs, /function resolveAutoFillLinePreset/);
  assert.match(rendererJs, /const seedLinePreset = resolveAutoFillLinePreset\(\)/);
  assert.match(rendererJs, /delete seedPayload\.titleHint/);
  assert.match(rendererJs, /function applyGeneratedSeedPackage/);
  assert.match(rendererJs, /elements\.titleHint\.value = seedPackage\.titleHint \|\| ""/);
  assert.match(rendererJs, /const linePresetForForm = requestedCustomLinePreset \|\| seedPackage\.linePreset/);
  assert.match(rendererJs, /applySelectOrCustom\(elements\.linePreset, elements\.customLinePreset, linePresetForForm/);
  assert.match(rendererJs, /state\.generatedStoryControls = seedPackage\.storyControls/);
  assert.match(rendererJs, /elements\.dialogueRatio\.value = String\(seedPackage\.draftControls\?\.dialogueRatio/);
  assert.match(rendererJs, /elements\.hookDensity\.value = seedPackage\.draftControls\?\.hookDensity/);
  assert.match(preloadTs, /generateSettingSeed/);
  assert.match(mainTs, /story:generate-setting-seed/);
});

test("core creative dropdowns expose manual custom input fields", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  [
    "custom-line-preset",
  ].forEach((id) => {
    assert.match(indexHtml, new RegExp(`id="${id}"`));
  });
  ["custom-style-preset", "custom-betrayal-type", "custom-shame-type", "custom-revenge-mode", "custom-ending-mode"].forEach((id) => {
    assert.doesNotMatch(indexHtml, new RegExp(`id="${id}"`));
  });

  assert.match(rendererJs, /const CUSTOM_OPTION_VALUE = "__custom__"/);
  assert.match(rendererJs, /const CUSTOM_OPTION_LABEL = "T\\u1ef1 nh\\u1eadp tay"/);
  assert.match(rendererJs, /function collectCustomCreativeInputs/);
  assert.match(rendererJs, /customCreativeInputs: collectCustomCreativeInputs\(\)/);
});

test("desktop session can be paused, saved, and restored on next launch", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");
  const createServicesTs = readProjectFile("src", "modules", "runtime", "create-app-services.ts");

  assert.match(indexHtml, /id="pause-remember-button"/);
  assert.match(rendererJs, /function buildSessionSnapshot/);
  assert.match(rendererJs, /function restoreSavedSession/);
  assert.match(rendererJs, /saveSession/);
  assert.match(preloadTs, /saveSession/);
  assert.match(mainTs, /session:save/);
  assert.match(mainTs, /savedSession/);
  assert.match(createServicesTs, /new SessionStore\(\)/);
});

test("niche branch drives hidden randomized story-control config", () => {
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");

  assert.match(rendererJs, /const NICHE_STORY_CONTROLS = \{/);
  assert.match(rendererJs, /billionaire_rich_poor_romance:\s*\{/);
  assert.match(rendererJs, /secret_identity_hidden_heiress:\s*\{/);
  assert.match(rendererJs, /social_injustice_discrimination_drama:\s*\{/);
  assert.match(rendererJs, /workplace_ceo_power_struggle:\s*\{/);
  assert.match(rendererJs, /medical_hidden_doctor_life_care:\s*\{/);
  assert.match(rendererJs, /school_campus_bullying_identity:\s*\{/);
  assert.match(rendererJs, /contract marriage/i);
  assert.match(rendererJs, /hidden heiress/i);
  assert.match(rendererJs, /restaurant humiliation/i);
  assert.match(rendererJs, /startup pitch/i);
  assert.match(rendererJs, /triage/i);
  assert.match(rendererJs, /scholarship/i);
  assert.match(rendererJs, /elements\.linePreset\.addEventListener\("change", \(\) => \{/);
});

test("desktop renders OmniVoice story TTS voice panel", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const stylesCss = readProjectFile("desktop", "renderer", "styles.css");

  assert.match(indexHtml, /id="tts-api-base"/);
  assert.match(indexHtml, /id="voice-id-select"/);
  assert.match(indexHtml, /id="generate-story-voice-button"/);
  assert.match(indexHtml, /Gen Voice 15/);

  assert.match(rendererJs, /ttsConfig/);
  assert.match(rendererJs, /loadOmniVoiceVoices/);
  assert.match(rendererJs, /generateStoryVoice/);
  assert.match(rendererJs, /handleTtsProgressEvent/);

  assert.match(stylesCss, /\.voice-progress/);
  assert.match(stylesCss, /\.mini-status/);
});
