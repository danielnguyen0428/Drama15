/**
 * Web story generation engine — mirrors the desktop StoryOrchestrator pipeline.
 *
 * Imports the SAME prompt construction, chapter architecture, seed engine,
 * system prompt, and quality validation used by the desktop app.
 */
import path from 'node:path';
// Set DRAMA15_ASSET_ROOT so the desktop's runtime.ts resolves presets/ correctly
// (it defaults to process.cwd() which would be apps/api/ instead of project root)
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
if (!process.env.DRAMA15_ASSET_ROOT) {
    process.env.DRAMA15_ASSET_ROOT = PROJECT_ROOT;
}
if (!process.env.DRAMA15_APP_ROOT) {
    process.env.DRAMA15_APP_ROOT = PROJECT_ROOT;
}
import { createSeedBlueprint, renderSeedBlueprintForPrompt, renderRecentSeedHistoryForPrompt, renderRecentCharacterNamesForPrompt, } from '../../../src/modules/prompts/seed-blueprint.js';
import { renderTrendAwareSeedEngineForPrompt, renderOutputLanguageViralTitleGrammarForPrompt, renderNicheAwareTitleGrammarForPrompt, } from '../../../src/modules/prompts/drama15-seed-engine.js';
import { DRAMA15_FIXED_CHAPTER_COUNT, DRAMA15_INVARIANT_RULES, getDrama15ChapterArchitecture, renderDrama15ArchitectureOverview, renderChapterArchitectureForPrompt, renderChapterPlanArchitectureForPrompt, } from '../../../src/modules/prompts/drama15-chapter-architecture.js';
import { loadDrama15SystemPrompt } from '../../../src/modules/prompts/system-prompt-loader.js';
import { JSON_OUTPUT_GUARD, CONCEPT_SYSTEM_PROMPT_SUPPLEMENT, STORY_BIBLE_SYSTEM_PROMPT_SUPPLEMENT, CHAPTER_PLAN_SYSTEM_PROMPT_SUPPLEMENT, CHAPTER_DRAFT_SYSTEM_PROMPT_SUPPLEMENT, } from '../../../src/modules/prompts/stage-system-instructions.js';
import { renderFictionMeReferenceForPrompt } from '../../../src/modules/prompts/fictionme-reference.js';
import fsSync from 'node:fs';
import { resolveStyle } from './stories/styleResolver.js';
import { renderVietnameseAiTellsForPrompt } from './stories/vietnameseAiTells.js';
// Re-export for startDev.ts — consolidated single block
export {
    // Imported from src/modules/
    createSeedBlueprint, renderSeedBlueprintForPrompt, renderRecentSeedHistoryForPrompt,
    renderRecentCharacterNamesForPrompt, renderTrendAwareSeedEngineForPrompt,
    renderOutputLanguageViralTitleGrammarForPrompt, renderNicheAwareTitleGrammarForPrompt,
    DRAMA15_FIXED_CHAPTER_COUNT, DRAMA15_INVARIANT_RULES, getDrama15ChapterArchitecture,
    renderDrama15ArchitectureOverview, renderChapterArchitectureForPrompt,
    renderChapterPlanArchitectureForPrompt, loadDrama15SystemPrompt, renderFictionMeReferenceForPrompt,
    // Local exports
    resolveStyle, loadGuManStyleGuide, loadLinePreset, renderLinePresetForPrompt,
    TEMPERATURE_SEED, TEMPERATURE_CONCEPT, TEMPERATURE_BIBLE, TEMPERATURE_PLAN,
    TEMPERATURE_CHAPTER_DRAFT, TEMPERATURE_CHAPTER_REPAIR, MAX_CHAPTER_REPAIR_ATTEMPTS,
    buildConceptSystemPrompt, buildConceptUserPrompt,
    buildStoryBibleSystemPrompt, buildStoryBibleUserPrompt,
    buildChapterPlanSystemPrompt, buildChapterPlanUserPrompt,
    buildChapterDraftSystemPrompt, buildChapterDraftUserPrompt,
    buildChapterRepairUserPrompt, analyzeChapterQuality, needsChapterRetry, summarizeChapter,
    TEMPERATURE_FACT_EXTRACTION, TEMPERATURE_FACT_EXTRACTION_RETRY,
    buildFactExtractionSystemPrompt, buildFactExtractionUserPrompt,
    validateCharacterFactSheet, extractCharacterNamesFallback, extractBibleCharacterNames,
    buildContinuityLiteFromBible, renderContinuityLiteForPrompt,
    renderChapterPlanItemForPrompt, getPlannedChapterTitle, alignChapterTitle,
    validateChapterDraftShape, MAX_CHAPTER_REPAIR_ATTEMPTS_WITH_DRIFT,
    buildChapterRepairUserPromptWithDrift, needsRepair,
    renderVietnameseAiTellsForPrompt,
};
// --- Cố Mạn (Gu Man) style guide loader ---
let cachedGuManStyleGuide = null;
function loadGuManStyleGuide() {
    if (cachedGuManStyleGuide)
        return cachedGuManStyleGuide;
    try {
        const guidePath = path.resolve(PROJECT_ROOT, 'presets', 'prompts', 'gu_man_style_guide.md');
        const raw = fsSync.readFileSync(guidePath, 'utf8');
        // Extract content after "## STYLE INSTRUCTIONS"
        const headingIdx = raw.indexOf('## STYLE INSTRUCTIONS');
        cachedGuManStyleGuide = headingIdx !== -1
            ? raw.slice(headingIdx + '## STYLE INSTRUCTIONS'.length).trim()
            : raw.trim();
        return cachedGuManStyleGuide;
    }
    catch {
        return '';
    }
}
const linePresetCache = new Map();
/**
 * Load a LinePreset JSON from `presets/lines/{niche}.json`. Returns null
 * if the file doesn't exist (e.g., custom niche with no matching preset).
 * Results are cached for the process lifetime.
 *
 * The first time a niche misses we emit a single `console.warn` so a typo
 * in `customNiche` (or a missing preset file) surfaces in dev logs instead
 * of silently degrading the prompt. Subsequent lookups return the cached
 * `null` without re-warning.
 */
function loadLinePreset(niche) {
    if (linePresetCache.has(niche))
        return linePresetCache.get(niche) ?? null;
    try {
        const presetPath = path.resolve(PROJECT_ROOT, 'presets', 'lines', `${niche}.json`);
        const raw = fsSync.readFileSync(presetPath, 'utf8');
        const parsed = JSON.parse(raw);
        linePresetCache.set(niche, parsed);
        return parsed;
    }
    catch (err) {
        const code = err?.code;
        if (code === 'ENOENT') {
            console.warn(`[storyEngine] no LinePreset for niche "${niche}" — falling back to generic prompt without genre rules.`);
        }
        else if (err instanceof SyntaxError) {
            console.warn(`[storyEngine] LinePreset for "${niche}" is malformed JSON: ${err.message}`);
        }
        else if (err instanceof Error) {
            console.warn(`[storyEngine] LinePreset load for "${niche}" failed: ${err.message}`);
        }
        linePresetCache.set(niche, null);
        return null;
    }
}
/**
 * Render a LinePreset into a compact prompt block that gives the LLM
 * genre-specific structural guidance. Only includes the fields that
 * directly influence story generation (omits metadata like displayName).
 */
function renderLinePresetForPrompt(preset) {
    const lines = [
        `Genre: ${preset.description}`,
        `Emotional axis: ${preset.emotionalAxis}`,
        `Hook style: ${preset.chapterArcDefaults.hookStyle}`,
        `Shame escalation starts: chapter ${preset.chapterArcDefaults.shameEscalationStart}`,
        `Revenge activation: chapter ${preset.chapterArcDefaults.revengeActivationChapter}`,
        `Dignity recovery: chapter ${preset.chapterArcDefaults.dignityRecoveryChapter}`,
        `Dignity recovery timing: ${preset.dignityRecoveryTiming}`,
        '',
        'Trope weights (higher = more central to this genre):',
        ...Object.entries(preset.tropeWeights)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([trope, weight]) => `  - ${trope.replace(/_/g, ' ')}: ${weight}`),
        '',
        'Genre-specific humiliation pacing (use these patterns, not generic drama):',
        ...preset.humiliationPacing.map(p => `  - ${p}`),
        '',
        'Genre-specific revenge activation (use these patterns):',
        ...preset.revengeActivation.map(r => `  - ${r}`),
        '',
        `Reference series: ${preset.seriesExamples.slice(0, 5).join('; ')}`,
    ];
    return lines.join('\n');
}
// --- Temperature constants (matching desktop) ---
const TEMPERATURE_SEED = 0.92;
const TEMPERATURE_CONCEPT = 0.88;
const TEMPERATURE_BIBLE = 0.82;
const TEMPERATURE_PLAN = 0.78;
const TEMPERATURE_CHAPTER_DRAFT = 0.58;
const TEMPERATURE_CHAPTER_REPAIR = 0.28;
const MAX_CHAPTER_REPAIR_ATTEMPTS = 2;
// --- System prompt composition ---
function composeSystemPrompt(...parts) {
    return parts.filter((p) => p.trim().length > 0).join('\n\n');
}
function block(label, value) {
    return `${label}:\n${JSON.stringify(value, null, 2)}`;
}
// --- Prompt builders (mirrors desktop story-prompts.ts) ---
function buildConceptSystemPrompt() {
    return composeSystemPrompt(loadDrama15SystemPrompt(), JSON_OUTPUT_GUARD, CONCEPT_SYSTEM_PROMPT_SUPPLEMENT, '--- GU MAN STYLE OVERLAY ---', loadGuManStyleGuide());
}
function buildConceptUserPrompt(params) {
    const { niche, outputLanguage, title, seed, seedBlueprint, recentTitles = [] } = params;
    const fictionMeRef = renderFictionMeReferenceForPrompt(niche);
    const linePreset = loadLinePreset(niche);
    return [
        `Create the concept package for a 10-chapter short drama.`,
        `Output language: ${outputLanguage}. All text fields MUST be in ${outputLanguage}.`,
        'Return JSON with exactly these keys: title, titleCandidates, logline, promise, conflictEngine.',
        renderNicheAwareTitleGrammarForPrompt(niche),
        'Design the concept so it can sustain the fixed 10-chapter architecture: fast setup, escalation, break, pivot, public reveal, and short new equilibrium.',
        'The concept must support a concrete foreshadow detail in chapter 2 that can return naturally in chapter 5.',
        "The heroine's core strength must be visible enough to power the chapter 7 internal pivot.",
        'Do not repeat any title, premise shape, or conflict engine from recent stories.',
        // Keep concept role-only so character naming is fully decided in the
        // Story_Bible step (which has the recent-name avoidance list). Otherwise
        // the LLM tends to lock in "Minh Châu" / "Khải Minh" defaults here.
        'Do NOT name any characters in this stage. Refer to roles only — "the heroine", "the betrayer/CEO/husband", "the rival/fiancée". Concrete names are assigned later in the Story_Bible.',
        recentTitles.length > 0 ? block('Recent story titles — generate something completely different', recentTitles.slice(0, 20)) : '',
        block('Request', { niche, outputLanguage, titleHint: title || undefined, settingSeed: seed }),
        block('Seed blueprint (plot DNA)', seedBlueprint),
        block('Drama 10-chapter architecture', renderDrama15ArchitectureOverview()),
        linePreset ? block('Line preset (genre-specific rules — follow these trope weights and pacing)', renderLinePresetForPrompt(linePreset)) : '',
        fictionMeRef ? block('FictionMe reference (market patterns only)', fictionMeRef) : '',
    ].filter(Boolean).join('\n\n');
}
function buildStoryBibleSystemPrompt() {
    return composeSystemPrompt(loadDrama15SystemPrompt(), JSON_OUTPUT_GUARD, STORY_BIBLE_SYSTEM_PROMPT_SUPPLEMENT, '--- GU MAN STYLE OVERLAY ---', loadGuManStyleGuide());
}
function buildStoryBibleUserPrompt(params) {
    const { niche, outputLanguage, concept, seedBlueprint, recentCharacterNamesBlock = '' } = params;
    return [
        'Create a story bible for the given short drama concept.',
        `Output language: ${outputLanguage}. All text fields MUST be in ${outputLanguage}.`,
        'Return JSON with exactly these keys:',
        'premise, heroine, betrayer, rival, classHierarchy, betrayalEngine, classShameEngine, revengeEngine, endingMode.',
        'Heroine must include: name, wound, strengths, blindSpots.',
        'Betrayer must include: name, wound, cowardiceVector.',
        'Rival must include: name, socialPower, demeanor.',
        // ──────────────────────────────────────────────────────────────────
        // CHARACTER NAME DIVERSITY — hardened rule, applies to ALL named
        // roles (heroine, betrayer, rival, supporting cast). The previous
        // rule only constrained the protagonist and let the LLM default to
        // "Minh ___" / "___ Linh" patterns. This version bans the overused
        // tokens at every position of the full name.
        // ──────────────────────────────────────────────────────────────────
        'CHARACTER NAME DIVERSITY RULE (hard constraint, applies to heroine, betrayer, rival, AND every supporting character with a name):',
        '1. Use a fresh full name for EVERY named character. No two stories may share a heroine name, a betrayer name, or a rival name.',
        '2. Vietnamese full names are 2 or 3 syllables, e.g. "Họ Tên đệm Tên". You MUST diversify ALL positions, not just the given (last) name.',
        '3. BANNED overused given names (do NOT pick any of these as the last token of any character\'s full name): Linh, Mai, Lan, Hoa, Ngọc, Anh, Hằng, Huyền, Trang, Phương, Thảo, Yến.',
        '4. BANNED overused middle-name tokens (do NOT pick any of these as the second-to-last token): Minh, Thị, Văn, Hồng, Thanh, Thu, Kim. In particular, "Minh Khải", "Minh Châu", "Minh Anh", "Minh Hà", "Thị Linh" and similar Minh-/Thị- compounds are FORBIDDEN unless explicitly required by the seed.',
        '5. PREFERRED diverse given-name pool (rotate across these and beyond): Tâm, Khuê, Diệp, Trúc, Quyên, Bích, Tuyền, Diễm, Như, Quỳnh, Hiền, Bảo, Châu, Giang, Hương, Lâm, Mỹ, Ngân, Nhung, Phan, Uyên, Vân, Xuân, Chi, Đào, Hà, Huệ, Loan, Ly, Nga, Nhi, Nụ, Quyên, Tâm, Thư, Thúy, Tiên, Trinh, Tươi, Tuyết, Vy.',
        '6. PREFERRED diverse middle-name tokens: Bảo, Diệu, Khánh, Mỹ, Ngọc, Phương, Thiên, Thúy, Tuệ, Tường, Vân, Xuân, Yên, Hải, Tiểu, Hữu, Đông, Quang, Trung, Tuấn.',
        '7. Male character names (betrayer, supporting men) follow the same rules. BANNED male given names: Khải, Hoàng, Tuấn, Anh, Quân, Hùng, Long, Phúc when paired with "Minh" middle. Prefer: Trí, Đăng, Nguyên, Lâm, Khoa, Khôi, Hạo, Bách, Sơn, Tài, Đạt, Khang, Vũ, Phong, Bằng, Thịnh, Cường paired with non-banned middle tokens.',
        '8. Pick names that fit class signaling: working-class/poor characters lean modest one-syllable given names (Hà, Lam, Vy); old-money/CEO characters lean three-syllable composed names with literary middle tokens (Bảo, Khánh, Tuệ).',
        '9. Before finalizing the JSON, re-read the chosen names and verify NONE of them appear in the "Recent character names to avoid" list below. If any do, REGENERATE that name from the preferred pool.',
        recentCharacterNamesBlock,
        // ──────────────────────────────────────────────────────────────────
        // SPEECH PATTERN (Idiolect) — Wave 6
        // Each major character must have a distinct voice recognizable without
        // dialogue tags.
        // ──────────────────────────────────────────────────────────────────
        'SPEECH PATTERN RULE (hard constraint for heroine, betrayer, rival):',
        'Each major character (heroine, betrayer, rival) MUST have a `speechPattern` object with:',
        '- `fillers`: 2-3 verbal tics they use (e.g., ["thật ra", "kiểu như", "nói thiệt"])',
        '- `syntaxQuirk`: one syntactic habit (e.g., "uses 1-3 word fragments when angry")',
        '- `vocabularyBand`: one of "formal" | "neutral" | "casual" | "crude"',
        '- `avoidedPhrases`: 1-3 phrases this character would NEVER say (e.g., "không bao giờ dùng từ \'yêu\' — luôn nói \'thích\'")',
        '',
        'Honor these patterns in every line of dialogue throughout the 10-chapter arc.',
        'Different characters MUST have noticeably different speech patterns. No two characters share the same fillers or vocabularyBand.',
        '',
        'EXAMPLE speechPattern block (for reference only — do NOT copy verbatim):',
        '```json',
        '{',
        '  "heroine": {',
        '    "speechPattern": {',
        '      "fillers": ["thật ra", "nói thiệt"],',
        '      "syntaxQuirk": "uses 1-3 word fragments when angry",',
        '      "vocabularyBand": "casual",',
        '      "avoidedPhrases": ["không bao giờ dùng từ \'yêu\' — luôn nói \'thích\'"]',
        '    }',
        '  },',
        '  "betrayer": {',
        '    "speechPattern": {',
        '      "fillers": ["nói chung là", "đại khái"],',
        '      "syntaxQuirk": "always adds a trailing qualifier to soften statements",',
        '      "vocabularyBand": "formal",',
        '      "avoidedPhrases": ["không bao giờ nói \'xin lỗi\' trực tiếp"]',
        '    }',
        '  },',
        '  "rival": {',
        '    "speechPattern": {',
        '      "fillers": ["rõ ràng", "hiển nhiên"],',
        '      "syntaxQuirk": "speaks in complete, clipped declarative sentences",',
        '      "vocabularyBand": "neutral",',
        '      "avoidedPhrases": ["không bao giờ dùng tiếng lóng hay viết tắt"]',
        '    }',
        '  }',
        '}',
        '```',
        "Strengths must include one concrete behavior-based capability that can be proven in chapter 1 and reactivated in chapter 7.",
        'Betrayal and class shame engines must support: masked threat in chapter 2, reveal without confrontation in chapter 5, no-rescue nadir in chapter 6, and public truth reveal in chapter 9.',
        block('Request', { niche, outputLanguage }),
        block('Concept', concept),
        block('Seed blueprint', seedBlueprint),
        block('Drama 10-chapter architecture', renderDrama15ArchitectureOverview()),
        (() => { const lp = loadLinePreset(niche); return lp ? block('Line preset (genre-specific rules)', renderLinePresetForPrompt(lp)) : ''; })(),
    ].filter(Boolean).join('\n\n');
}
function buildChapterPlanSystemPrompt() {
    return composeSystemPrompt(loadDrama15SystemPrompt(), JSON_OUTPUT_GUARD, CHAPTER_PLAN_SYSTEM_PROMPT_SUPPLEMENT, '--- GU MAN STYLE OVERLAY ---', loadGuManStyleGuide());
}
function buildChapterPlanUserPrompt(params) {
    const { niche, outputLanguage, concept, storyBible } = params;
    return [
        'Create a 10-chapter plan for this short drama.',
        `Output language: ${outputLanguage}. All text fields MUST be in ${outputLanguage}.`,
        'Return JSON with a single top-level key named chapterPlan containing an array of 10 objects.',
        'Each object must include: chapterNumber, title, hook, mainBeat, humiliationProgression, revengeProgression, endingBeat.',
        'Keep the output compact. Each field value must be one sentence or shorter, preferably under 18 words.',
        'Do not write explanatory paragraphs. Use clean, high-signal beats only.',
        'Revenge activation should not happen too early. Keep class shame legible and cumulative.',
        'Follow the supplied 10-chapter architecture exactly.',
        'Chapter 2 must plant a concrete foreshadow detail. Chapter 5 must activate it. Chapter 6 must be maximum loss with no rescue. Chapter 7 must be an earned internal pivot. Chapter 9 must be a public reveal. Chapter 10 must be a short new equilibrium.',
        block('Request', { niche, outputLanguage }),
        block('Concept', concept),
        block('Story bible', storyBible),
        block('Chapter architecture map', renderChapterPlanArchitectureForPrompt()),
        (() => { const lp = loadLinePreset(niche); return lp ? block('Line preset (genre-specific pacing — use humiliationPacing and revengeActivation patterns)', renderLinePresetForPrompt(lp)) : ''; })(),
    ].filter(Boolean).join('\n\n');
}
function buildChapterDraftSystemPrompt(styleBlock) {
    // If a styleBlock is provided (from StyleResolver), use it as the coherent style section.
    // Otherwise, fall back to resolveStyle({}) which defaults to 'drama15_with_gu_man_overlay'.
    const effectiveStyleBlock = styleBlock ?? resolveStyle({}).styleBlock;
    return composeSystemPrompt(loadDrama15SystemPrompt(), JSON_OUTPUT_GUARD, CHAPTER_DRAFT_SYSTEM_PROMPT_SUPPLEMENT, effectiveStyleBlock);
}
function buildChapterDraftUserPrompt(params) {
    const { chapterNumber, outputLanguage, title, storyBible, chapterPlan, previousSummaries, dialogueRatio, hookDensity, intensity, memoryStoreContext, continuityLiteBlock, chapterPlanItemBlock, plannedChapterTitle, niche, } = params;
    const arch = getDrama15ChapterArchitecture(chapterNumber);
    const archBlock = renderChapterArchitectureForPrompt(chapterNumber);
    const wordRange = arch ? `${arch.wordCountRange[0]}-${arch.wordCountRange[1]}` : '2300-2700';
    const effectiveDialogue = arch ? arch.dialogueRatio : dialogueRatio;
    const effectiveIntensity = arch ? arch.intensity : intensity;
    return [
        'Draft one chapter of a commercial short drama.',
        `Output language: ${outputLanguage}. The chapter text MUST be written entirely in ${outputLanguage}.`,
        'Return JSON with exactly these keys: chapterNumber, title, summary, text.',
        'The chapter text must contain a strong opening hook, an emotional turn, and a sharp ending beat.',
        'Write in dramatized scenes, not retrospective summary.',
        'Show class shame through introductions, seating, titles, money, etiquette, and witness reactions.',
        'Keep continuity exact: names, status positions, emotional facts, and chapter logic cannot drift.',
        plannedChapterTitle
            ? `Use this exact chapter title (do NOT invent a new one): "${plannedChapterTitle}". Set JSON field "title" to this string verbatim.`
            : '',
        archBlock || '',
        `Target length: ${wordRange} words.`,
        `Dialogue target: ${Math.round(effectiveDialogue * 100)}% of text should be quoted speech.`,
        `Minimum quoted-dialogue floor: ${Math.round(effectiveDialogue * 50)}% of total words.`,
        `Hook density: ${hookDensity}.`,
        `Intensity: ${effectiveIntensity}.`,
        'If you reach the ending beat early, stop instead of extending aftermath.',
        'Use smart dialogue quotation marks (\u201C and \u201D) for spoken dialogue. Do not use raw ASCII double quotes for speech.',
        'Do not use banned empty drama phrases such as "her heart clenched" or "the world collapsed".',
        // Vietnamese AI-tell phrase ban — only emit when actually writing in
        // Vietnamese, otherwise the LLM gets distracted by irrelevant rules.
        outputLanguage === 'vietnamese' ? renderVietnameseAiTellsForPrompt() : '',
        // Punctuation rhythm + register switching — Vietnamese only (Wave 7)
        outputLanguage === 'vietnamese' ? `PUNCTUATION RHYTHM RULES:
- Use sentence fragments. Like this. Often. 5-15% should be fragments.
- Mix em-dash, semicolon, comma, period — vary across paragraphs.
- Do NOT use em-dash in every paragraph; this is an AI default.

REGISTER SWITCHING RULES:
- Mix formal narration with casual interior monologue within the same chapter.
- Dialogue: characters use slang/abbreviations sometimes.
- Leave 1-2 sentences slightly awkward, rough, or repetitive on purpose for human texture.` : '',
        'Default shape: one major public scene plus one short private aftermath scene unless the chapter plan clearly requires otherwise.',
        'If dialogue target is high, most scenes should contain spoken exchanges, not only inner monologue.',
        ...DRAMA15_INVARIANT_RULES.map(r => `INVARIANT: ${r}`),
        block('Story title', title),
        block('Story bible', storyBible),
        // Per-chapter beat takes precedence over the full plan when supplied.
        chapterPlanItemBlock ? block(`Target chapter ${chapterNumber} beat`, chapterPlanItemBlock) : block('Full chapter plan', chapterPlan),
        block('Target chapter number', chapterNumber),
        // Genre reminder — keeps prose on-genre even though the niche was "consumed" by earlier stages.
        niche ? (() => { const lp = loadLinePreset(niche); return lp ? `GENRE CONTEXT: This is a "${lp.description}" story. Hook style: ${lp.chapterArcDefaults.hookStyle}. Use genre-specific tropes (${Object.keys(lp.tropeWeights).slice(0, 5).join(', ').replace(/_/g, ' ')}) — do NOT drift into generic drama patterns from a different genre.` : ''; })() : '',
        continuityLiteBlock || '',
        previousSummaries.length > 0 ? block('Previous chapter summaries', previousSummaries) : '',
        memoryStoreContext ? block('Character memory context (chapters 1 through ' + (chapterNumber - 1) + ')', memoryStoreContext) : '',
    ].filter(Boolean).join('\n\n');
}
function buildChapterRepairUserPrompt(params) {
    const { previousDraft, failures, chapterNumber, dialogueRatio, wordCount, currentDialogueRatio } = params;
    const arch = getDrama15ChapterArchitecture(chapterNumber);
    const archBlock = renderChapterArchitectureForPrompt(chapterNumber);
    const wordRange = arch ? `${arch.wordCountRange[0]}-${arch.wordCountRange[1]}` : '2300-2700';
    return [
        'The previous draft missed quality targets and must be rewritten to pass them.',
        `Current failures: ${failures.join('; ')}.`,
        `Current draft metrics: ${wordCount} words and ${Math.round(currentDialogueRatio * 100)}% quoted speech.`,
        `Reference length target: ${wordRange} words.`,
        `Dialogue target: ${Math.round(dialogueRatio * 100)}%.`,
        archBlock || '',
        'Use smart dialogue quotation marks (\u201C and \u201D) for spoken dialogue.',
        'Compress repeated interior reaction, decorative description, and duplicate social observations.',
        'Rewrite the full chapter, not just a fragment.',
        'Keep the same chapter number, core beat, names, and continuity facts.',
        'Return JSON with exactly these keys: chapterNumber, title, summary, text.',
        block('Previous draft to rewrite', { text: previousDraft }),
    ].filter(Boolean).join('\n\n');
}
// --- Quality validation (mirrors desktop chapter-quality.ts) ---
const QUOTED_DIALOGUE_PATTERN = /["\u201c\u300c\u300e]([^"\u201d\u300d\u300f\n]+)["\u201d\u300d\u300f]/gu;
function analyzeChapterQuality(text, targetDialogueRatio, chapterNumber) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const quotedSegments = [...text.matchAll(QUOTED_DIALOGUE_PATTERN)].map((m) => m[1]);
    const quotedWords = quotedSegments.join(' ').split(/\s+/).filter(Boolean).length;
    const dialogueRatio = words === 0 ? 0 : quotedWords / words;
    const arch = getDrama15ChapterArchitecture(chapterNumber);
    const effectiveTarget = arch?.dialogueRatio ?? targetDialogueRatio;
    const minimumFloor = effectiveTarget * 0.5;
    const failures = [];
    if (dialogueRatio < minimumFloor) {
        failures.push(`dialogue ratio ${Math.round(dialogueRatio * 100)}% is below minimum ${Math.round(minimumFloor * 100)}%`);
    }
    return { wordCount: words, dialogueRatio, failures };
}
function needsChapterRetry(metrics) {
    return metrics.failures.length > 0;
}
// --- Chapter summary helper ---
function summarizeChapter(chapterText, chapterNumber) {
    // Extract first 200 chars as a rough summary for continuity
    const firstParagraph = chapterText.split(/\n\s*\n/)[0] ?? '';
    return `[Ch${chapterNumber}] ${firstParagraph.slice(0, 200).trim()}...`;
}
const TEMPERATURE_FACT_EXTRACTION = 0.2;
const TEMPERATURE_FACT_EXTRACTION_RETRY = 0.1;
/**
 * Validate that an unknown value conforms to the CharacterFactSheet schema.
 * Checks all required fields exist and have correct types.
 */
function validateCharacterFactSheet(data) {
    if (data === null || data === undefined || typeof data !== 'object') {
        return false;
    }
    const obj = data;
    // Check top-level required fields
    if (typeof obj.chapterNumber !== 'number' || !Number.isInteger(obj.chapterNumber) || obj.chapterNumber < 1) {
        return false;
    }
    if (typeof obj.extractedAt !== 'string' || obj.extractedAt.length === 0) {
        return false;
    }
    if (!Array.isArray(obj.characters)) {
        return false;
    }
    // Validate each character entry
    for (const character of obj.characters) {
        if (character === null || character === undefined || typeof character !== 'object') {
            return false;
        }
        const charObj = character;
        // Required string fields
        if (typeof charObj.characterName !== 'string' || charObj.characterName.length === 0) {
            return false;
        }
        if (typeof charObj.emotionalState !== 'string') {
            return false;
        }
        if (typeof charObj.socialPosition !== 'string') {
            return false;
        }
        // relationshipChanges must be an array
        if (!Array.isArray(charObj.relationshipChanges)) {
            return false;
        }
        for (const rel of charObj.relationshipChanges) {
            if (rel === null || rel === undefined || typeof rel !== 'object') {
                return false;
            }
            const relObj = rel;
            if (typeof relObj.targetCharacter !== 'string') {
                return false;
            }
            if (typeof relObj.change !== 'string') {
                return false;
            }
        }
        // newlyEstablishedFacts must be an array
        if (!Array.isArray(charObj.newlyEstablishedFacts)) {
            return false;
        }
        for (const fact of charObj.newlyEstablishedFacts) {
            if (fact === null || fact === undefined || typeof fact !== 'object') {
                return false;
            }
            const factObj = fact;
            if (typeof factObj.fact !== 'string') {
                return false;
            }
            if (factObj.confidence !== 'explicit' && factObj.confidence !== 'inferred') {
                return false;
            }
            // confidenceLevel is optional, but if present must be a number 0-1
            if (factObj.confidenceLevel !== undefined) {
                if (typeof factObj.confidenceLevel !== 'number' || factObj.confidenceLevel < 0 || factObj.confidenceLevel > 1) {
                    return false;
                }
            }
        }
    }
    return true;
}
/**
 * Build the system prompt for Character Fact Sheet extraction.
 * Includes the Story Bible as reference context for character identification.
 */
function buildFactExtractionSystemPrompt(storyBible) {
    return [
        'You are a character analysis assistant specialized in extracting structured character facts from narrative text.',
        'Your task is to identify all named characters in the provided chapter text and extract their current state.',
        '',
        '=== STORY BIBLE (Reference Context) ===',
        storyBible,
        '=== END STORY BIBLE ===',
        '',
        'Use the Story Bible above to identify which characters to track and their established baseline.',
        '',
        'RULES:',
        '1. Output MUST be valid JSON conforming to the CharacterFactSheet schema.',
        '2. Do NOT include any text outside the JSON object.',
        '3. For each character appearing in the chapter, extract: characterName, emotionalState, relationshipChanges, socialPosition, and newlyEstablishedFacts.',
        '4. Distinguish between EXPLICIT facts (directly stated in text) and INFERRED facts (implied by context). Mark inferred facts with a confidenceLevel between 0.0 and 1.0.',
        '5. If a character appears but has no changes, still include them with empty arrays for relationshipChanges and newlyEstablishedFacts.',
        '6. Output language MUST match the language of the chapter text provided.',
    ].join('\n');
}
/**
 * Build the user prompt for Character Fact Sheet extraction.
 * Instructs the LLM to output strict JSON and distinguish explicit vs inferred facts.
 */
function buildFactExtractionUserPrompt(opts) {
    return [
        `Extract the Character Fact Sheet for Chapter ${String(opts.chapterNumber)} from the text below.`,
        '',
        `Output language: ${opts.outputLanguage}. All extracted text fields (emotionalState, change descriptions, facts) MUST be in ${opts.outputLanguage}.`,
        '',
        'Return a single JSON object with this exact structure:',
        '{',
        '  "chapterNumber": <integer>,',
        '  "characters": [',
        '    {',
        '      "characterName": "<string>",',
        '      "emotionalState": "<string describing current emotional state>",',
        '      "relationshipChanges": [{ "targetCharacter": "<string>", "change": "<string>" }],',
        '      "socialPosition": "<string describing current social standing>",',
        '      "newlyEstablishedFacts": [',
        '        { "fact": "<string>", "confidence": "explicit" | "inferred", "confidenceLevel": <0.0-1.0 for inferred only> }',
        '      ]',
        '    }',
        '  ],',
        '  "extractedAt": "<ISO-8601 timestamp>"',
        '}',
        '',
        'IMPORTANT:',
        '- Mark facts as "explicit" when they are directly stated in the text.',
        '- Mark facts as "inferred" when they are implied by context, actions, or subtext. Include a confidenceLevel (0.0-1.0) for inferred facts.',
        '- Do NOT hallucinate characters not present in the chapter.',
        '- Output ONLY the JSON object, no additional text.',
        '',
        '=== CHAPTER TEXT ===',
        opts.chapterText,
        '=== END CHAPTER TEXT ===',
    ].join('\n');
}
/** Maximum repair attempts when character drift violations are present (Requirement 6.4) */
const MAX_CHAPTER_REPAIR_ATTEMPTS_WITH_DRIFT = 3;
/**
 * Build a repair prompt that addresses BOTH quality failures AND character drift
 * violations in a single repair attempt.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.6
 */
function buildChapterRepairUserPromptWithDrift(params) {
    const { previousDraft, failures, driftReport, chapterNumber, dialogueRatio, wordCount, currentDialogueRatio } = params;
    const arch = getDrama15ChapterArchitecture(chapterNumber);
    const archBlock = renderChapterArchitectureForPrompt(chapterNumber);
    const wordRange = arch ? `${arch.wordCountRange[0]}-${arch.wordCountRange[1]}` : '2300-2700';
    const sections = [
        'The previous draft has issues that must be corrected. This rewrite must fix ALL of the following problems in a single attempt.',
    ];
    // --- Quality failures section (Requirement 6.2: preserve existing quality checks) ---
    if (failures.length > 0) {
        sections.push('', '=== QUALITY FAILURES ===', `Current failures: ${failures.join('; ')}.`, `Current draft metrics: ${wordCount} words and ${Math.round(currentDialogueRatio * 100)}% quoted speech.`, `Reference length target: ${wordRange} words.`, `Dialogue target: ${Math.round(dialogueRatio * 100)}%.`);
    }
    // --- Character drift violations section (Requirement 6.1: specific correction instructions) ---
    const criticalViolations = driftReport.violations.filter((v) => v.severity === 'critical');
    if (criticalViolations.length > 0) {
        sections.push('', '=== CHARACTER CONSISTENCY VIOLATIONS ===', 'The following character inconsistencies were detected and MUST be corrected:', '');
        for (let i = 0; i < criticalViolations.length; i++) {
            const v = criticalViolations[i];
            sections.push(`VIOLATION ${String(i + 1)} [${v.type}] — Character: ${v.characterName}`, `  Problem: "${v.excerpt}"`, `  Contradicts: ${v.contradictedFact}`, `  Correction: Rewrite this section to be consistent with the established fact above.`, '');
        }
    }
    // --- General rewrite instructions ---
    sections.push(archBlock || '', 'Use smart dialogue quotation marks (\u201C and \u201D) for spoken dialogue.', 'Compress repeated interior reaction, decorative description, and duplicate social observations.', 'Rewrite the full chapter, not just a fragment.', 'Keep the same chapter number, core beat, names, and continuity facts.', 'Ensure all character names, relationships, and personality traits match the Story Bible exactly.', 'Return JSON with exactly these keys: chapterNumber, title, summary, text.', block('Previous draft to rewrite', { text: previousDraft }));
    return sections.filter(Boolean).join('\n');
}
/**
 * Determines whether a chapter needs repair based on quality metrics and/or
 * character drift violations.
 *
 * Returns true if:
 * - Quality metrics have failures (word count below target, dialogue ratio issues), OR
 * - DriftReport contains at least one critical violation
 *
 * Validates: Requirements 3.5, 6.2, 6.3
 */
function needsRepair(qualityMetrics, driftReport) {
    const hasQualityFailures = qualityMetrics.failures.length > 0;
    const hasCriticalDrift = driftReport.violations.some((v) => v.severity === 'critical');
    return hasQualityFailures || hasCriticalDrift;
}
// ---------------------------------------------------------------------------
// Character Name Extraction Fallback
// ---------------------------------------------------------------------------
/**
 * Regex-based fallback for extracting character names from chapter text.
 * Used when LLM extraction fails after retry.
 * Handles both Vietnamese and English capitalized names.
 */
function extractCharacterNamesFallback(chapterText) {
    if (!chapterText || chapterText.trim().length === 0) {
        return {
            chapterNumber: 0,
            characters: [],
            extractedAt: new Date().toISOString(),
        };
    }
    // Pattern matches:
    // - Vietnamese names: sequences of capitalized words (e.g., "Nguyễn Thị Lan", "Minh Anh")
    // - English names: capitalized words not at sentence start
    // - Common Vietnamese single-word names with diacritics
    const namePattern = /(?<![.!?]\s)(?:(?:[A-ZÀ-Ỹ][a-zà-ỹ]+)(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,3})/gu;
    const matches = chapterText.match(namePattern) ?? [];
    // Filter out common non-name words and deduplicate
    const commonWords = new Set([
        'The', 'This', 'That', 'These', 'Those', 'There', 'Then', 'They',
        'When', 'Where', 'What', 'Which', 'While', 'With', 'Would', 'Will',
        'After', 'Before', 'Between', 'About', 'Above', 'Below',
        'Chapter', 'Part', 'Section', 'Volume',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
        'Nhưng', 'Nếu', 'Khi', 'Sau', 'Trước', 'Trong', 'Ngoài',
        'Tuy', 'Dù', 'Vì', 'Bởi', 'Cho', 'Với', 'Từ',
    ]);
    const nameCounts = new Map();
    for (const match of matches) {
        const trimmed = match.trim();
        if (trimmed.length < 2)
            continue;
        if (commonWords.has(trimmed))
            continue;
        nameCounts.set(trimmed, (nameCounts.get(trimmed) ?? 0) + 1);
    }
    // Only keep names that appear at least 2 times (likely actual character names)
    const characterNames = [...nameCounts.entries()]
        .filter(([, count]) => count >= 2)
        .sort(([, a], [, b]) => b - a)
        .map(([name]) => name);
    const characters = characterNames.map((name) => ({
        characterName: name,
        emotionalState: '',
        relationshipChanges: [],
        socialPosition: '',
        newlyEstablishedFacts: [],
    }));
    return {
        chapterNumber: 0,
        characters,
        extractedAt: new Date().toISOString(),
    };
}
/**
 * Extract the named characters declared in a Story_Bible JSON object so they
 * can be persisted into seed history and fed back into the next Story_Bible
 * generation as a "do not reuse" list. Reads from the canonical fields
 * `heroine.name`, `betrayer.name`, `rival.name` and any optional
 * `supportingCharacters[].name` array. Returns an empty array on malformed
 * input so the caller can store nothing rather than crash.
 */
function extractBibleCharacterNames(bible) {
    if (!bible || typeof bible !== 'object')
        return [];
    const out = new Set();
    const record = bible;
    const pickName = (value) => {
        if (!value || typeof value !== 'object')
            return;
        const name = value.name;
        if (typeof name === 'string' && name.trim().length > 0) {
            out.add(name.trim());
        }
    };
    pickName(record.heroine);
    pickName(record.betrayer);
    pickName(record.rival);
    const supporting = record.supportingCharacters;
    if (Array.isArray(supporting)) {
        for (const entry of supporting)
            pickName(entry);
    }
    return Array.from(out);
}
/**
 * Build a Continuity_Lite tracker from the parsed Story_Bible and chapter
 * plan. Tolerates missing/malformed fields (returns null) so the caller can
 * fall back to passing `previousSummaries` only.
 */
function buildContinuityLiteFromBible(bibleJson, planJson) {
    if (!bibleJson || typeof bibleJson !== 'object')
        return null;
    const bible = bibleJson;
    const readName = (slot) => {
        if (!slot || typeof slot !== 'object')
            return '';
        const n = slot.name;
        return typeof n === 'string' ? n.trim() : '';
    };
    const heroineName = readName(bible.heroine);
    const betrayerName = readName(bible.betrayer);
    const rivalName = readName(bible.rival);
    // coreReveal: prefer betrayerEngine.coreConflict / betrayalEngine; fall back
    // to a stringified version. Desktop uses `storyBible.betrayalEngine`.
    const betrayalEngine = bible.betrayalEngine ?? bible.betrayerEngine ?? bible.conflictEngine;
    const coreReveal = (() => {
        if (typeof betrayalEngine === 'string')
            return betrayalEngine.trim();
        if (betrayalEngine && typeof betrayalEngine === 'object') {
            const eng = betrayalEngine;
            const candidate = eng.coreConflict ?? eng.summary ?? eng.description;
            if (typeof candidate === 'string')
                return candidate.trim();
            try {
                return JSON.stringify(betrayalEngine);
            }
            catch {
                return '';
            }
        }
        return '';
    })();
    const endingModeRaw = bible.endingMode;
    const endingMode = typeof endingModeRaw === 'string' ? endingModeRaw.trim() : '';
    // Chapter state — try to extract per-chapter beat from plan, fall back to
    // architecture defaults if the plan is missing or malformed.
    const planArray = Array.isArray(planJson)
        ? planJson
        : Array.isArray(planJson?.chapterPlan)
            ? planJson.chapterPlan
            : [];
    const chapterState = [];
    for (let i = 0; i < DRAMA15_FIXED_CHAPTER_COUNT; i += 1) {
        const chapterNumber = i + 1;
        // Look up the plan entry by chapterNumber rather than index so a sparse
        // or out-of-order plan does not corrupt the agency curve.
        const planItem = (planArray.find((entry) => entry &&
            typeof entry === 'object' &&
            entry.chapterNumber === chapterNumber) ?? null);
        const tempRaw = planItem && typeof planItem === 'object'
            ? planItem.humiliationProgression ?? planItem.emotionalTemperature ?? planItem.beat
            : undefined;
        const emotionalTemperature = typeof tempRaw === 'string' && tempRaw.trim().length > 0
            ? tempRaw.trim()
            : `chapter ${chapterNumber} architecture-default`;
        chapterState.push({
            chapter: chapterNumber,
            heroineAgency: Math.min(100, 18 + i * 5),
            emotionalTemperature,
        });
    }
    // If we don't have at least heroine + betrayer + rival names, the LLM can't
    // honor the continuity block — caller should fall back rather than send a
    // half-empty block.
    if (!heroineName || !betrayerName || !rivalName)
        return null;
    // Speech patterns (Wave 6 idiolect) — extract from each character slot if present.
    const speechPatterns = {};
    const readSpeechPattern = (slot, name) => {
        if (!slot || typeof slot !== 'object')
            return;
        const sp = slot.speechPattern;
        if (!sp || typeof sp !== 'object')
            return;
        const pattern = sp;
        // Validate minimal shape before including
        if (Array.isArray(pattern.fillers) && pattern.fillers.length >= 2 &&
            typeof pattern.syntaxQuirk === 'string' &&
            typeof pattern.vocabularyBand === 'string' &&
            Array.isArray(pattern.avoidedPhrases) && pattern.avoidedPhrases.length >= 1) {
            speechPatterns[name] = pattern;
        }
    };
    readSpeechPattern(bible.heroine, heroineName);
    readSpeechPattern(bible.betrayer, betrayerName);
    readSpeechPattern(bible.rival, rivalName);
    return {
        heroineName,
        betrayerName,
        rivalName,
        coreReveal,
        endingMode,
        chapterState,
        ...(Object.keys(speechPatterns).length > 0 ? { speechPatterns } : {}),
    };
}
/**
 * Render a Continuity_Lite tracker as a prompt block. The LLM is told these
 * are LOCKS — names, reveal engine, and ending mode cannot be renamed,
 * rewritten, or contradicted in any chapter.
 */
function renderContinuityLiteForPrompt(continuity) {
    if (!continuity)
        return '';
    const parts = [
        'CONTINUITY LOCK (apply to every chapter; do NOT rename, recast, or contradict):',
        JSON.stringify(continuity, null, 2),
        'These names and engines are FIXED. Use them verbatim. Do not introduce alternative spellings, nicknames, or renamings without an explicit story reason already encoded in the bible.',
    ];
    if (continuity.speechPatterns && Object.keys(continuity.speechPatterns).length > 0) {
        parts.push('', 'Honor each character\'s speechPattern in dialogue. Their fillers, quirks, and vocabularyBand are NON-NEGOTIABLE.');
    }
    return parts.join('\n');
}
/**
 * Pick the per-chapter beat from a parsed chapter plan and render it as a
 * compact prompt block. Falls back to an empty string when the plan is
 * malformed; caller should pass the full plan text in that case.
 */
function renderChapterPlanItemForPrompt(planJson, chapterNumber) {
    const planArray = Array.isArray(planJson)
        ? planJson
        : Array.isArray(planJson?.chapterPlan)
            ? planJson.chapterPlan
            : [];
    const item = planArray.find((entry) => {
        if (!entry || typeof entry !== 'object')
            return false;
        const n = entry.chapterNumber;
        return typeof n === 'number' && n === chapterNumber;
    });
    if (!item)
        return '';
    return JSON.stringify(item, null, 2);
}
/**
 * Read the planned title for a given chapter number from the parsed plan.
 * Returns '' when missing so the caller can decide whether to pass through
 * the LLM-invented title.
 */
function getPlannedChapterTitle(planJson, chapterNumber) {
    const planArray = Array.isArray(planJson)
        ? planJson
        : Array.isArray(planJson?.chapterPlan)
            ? planJson.chapterPlan
            : [];
    for (const entry of planArray) {
        if (!entry || typeof entry !== 'object')
            continue;
        const rec = entry;
        if (rec.chapterNumber === chapterNumber && typeof rec.title === 'string') {
            return rec.title.trim();
        }
    }
    return '';
}
/**
 * Force the chapter JSON's `title` field to match the plan-locked title.
 * Mirrors desktop `alignChapterTitleWithPlan`. Operates on the parsed JSON
 * (not the raw LLM text); caller is responsible for re-serializing.
 */
function alignChapterTitle(chapterJson, plannedTitle) {
    if (!plannedTitle)
        return chapterJson;
    if (!chapterJson || typeof chapterJson !== 'object')
        return chapterJson;
    const next = { ...chapterJson };
    next.title = plannedTitle;
    return next;
}
/**
 * Validate a chapter draft has the minimum required shape (chapterNumber,
 * title, text). Returns true on success; logs and returns false on failure
 * so the caller can fall back to the raw text. Mirrors desktop
 * `validateChapterDraft` but tolerant rather than throwing.
 */
function validateChapterDraftShape(chapterJson, expectedNumber) {
    if (!chapterJson || typeof chapterJson !== 'object')
        return false;
    const rec = chapterJson;
    if (rec.chapterNumber !== expectedNumber)
        return false;
    if (typeof rec.title !== 'string' || rec.title.trim().length === 0)
        return false;
    if (typeof rec.text !== 'string' || rec.text.trim().length === 0)
        return false;
    return true;
}
//# sourceMappingURL=storyEngine.js.map