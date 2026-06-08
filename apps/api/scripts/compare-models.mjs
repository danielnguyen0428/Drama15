import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// A/B stability probe: run outline + the first N chapters under two model
// aliases against the configured provider, and compare error rate, repair
// frequency, latency, and mechanical slop scores. Cheaper than a full 15-chapter
// run while still exercising the drafting + quality-gate + repair path.
//
// Usage:
//   npx tsx scripts/compare-models.mjs --models deepseek-v4-flash,deepseek-v4-pro --chapters 3

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const models = getArg('--models', 'deepseek-v4-flash,deepseek-v4-pro').split(',').map((m) => m.trim()).filter(Boolean);
const chapterTarget = Number(getArg('--chapters', '3'));

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..', '..');
process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;
// Keep the probe focused on raw drafting stability — disable the extra passes.
process.env.ADVERSARIAL_CUT_ENABLED = 'false';
process.env.READER_PANEL_ENABLED = 'false';
process.env.MANUSCRIPT_REVIEW_ENABLED = 'false';
process.env.REVISION_LOOP_ENABLED = 'false';

const { env } = await import('../../../src/lib/env.js');
const { StoryOrchestrator } = await import('../../../src/modules/orchestrator/story-orchestrator.js');
const { PresetLoader } = await import('../../../src/modules/presets/preset-loader.js');
const { RouterClient } = await import('../../../src/modules/router/router-client.js');
const { SeedHistoryStore } = await import('../../../src/modules/session/seed-history-store.js');
const { NormalizedOutlineRequestSchema } = await import('../../../src/schemas/story.js');
const { analyzeChapterQuality } = await import('../../../src/modules/validators/chapter-quality.js');
const { resolveDraftControls } = await import('../../../src/modules/validators/story-validator.js');

const baseOutline = {
  titleHint: 'So sánh model',
  linePreset: env.defaultLinePreset,
  stylePreset: env.defaultStylePreset,
  outputLanguage: 'vietnamese',
  audience: { genderFocus: 'female', ageBand: '18_34', market: 'global' },
  storyControls: {
    betrayalType: 'hidden_relationship_replaced_by_fiancee',
    shameType: 'polite_class_exclusion',
    revengeMode: 'strategic_withdrawal_status_reversal',
    endingMode: 'bittersweet_dignity_first',
    intensity: 0.8,
  },
  customCreativeInputs: { stylePreset: env.defaultStylePreset },
  settingSeed: 'Một cô gái nghèo bị nhà giàu sỉ nhục trong tiệc đính hôn của chính mình.',
  chapterCount: 15,
};
const draftControls = resolveDraftControls({ dialogueRatio: 0.5, hookDensity: 'medium' });

async function probe(model) {
  const orchestrator = new StoryOrchestrator(new PresetLoader(), new RouterClient(), env.modelPreset, new SeedHistoryStore());
  orchestrator.setModelAliasOverride(model);

  const result = { model, ok: false, outlineMs: 0, chapters: [], errors: [] };
  const outlineStart = Date.now();
  let outline;
  try {
    outline = await orchestrator.generateOutline(NormalizedOutlineRequestSchema.parse(baseOutline));
    result.outlineMs = Date.now() - outlineStart;
  } catch (error) {
    result.errors.push(`outline: ${error?.message ?? error}`);
    return result;
  }

  const summaries = [];
  for (let chapterNumber = 1; chapterNumber <= chapterTarget; chapterNumber += 1) {
    let repaired = false;
    const start = Date.now();
    try {
      const chapter = await orchestrator.generateChapter(
        {
          storyBible: outline.storyBible,
          chapterPlan: outline.chapterPlan,
          chapterNumber,
          previousChapterSummaries: summaries.slice(),
          draftControls: { dialogueRatio: 0.5, hookDensity: 'medium' },
          outputLanguage: 'vietnamese',
          storyTitle: outline.title,
        },
        outline.request.stylePreset,
        undefined,
        outline.continuityLite,
        {
          onProgress: (event) => {
            if (event.stageId === 'repair-chapter' && event.status === 'completed' && /Đã sửa/.test(event.detail ?? '')) {
              repaired = true;
            }
          },
        },
      );
      const ms = Date.now() - start;
      const metrics = analyzeChapterQuality(chapter.text, draftControls, 'vietnamese', chapterNumber);
      summaries.push(chapter.summary ?? '');
      result.chapters.push({
        chapterNumber,
        ms,
        repaired,
        words: metrics.wordCount,
        aiTell: Number(metrics.aiTellScore.toFixed(2)),
        structural: Number(metrics.structuralSlop.score.toFixed(2)),
        cv: Number(metrics.sentenceVariance.cv.toFixed(2)),
        failures: metrics.failures.length,
      });
    } catch (error) {
      result.errors.push(`ch${chapterNumber}: ${error?.message ?? error}`);
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}

console.log(`provider=${env.routerBaseUrl}  chapters=${chapterTarget}  models=${models.join(', ')}\n`);
const results = [];
for (const model of models) {
  console.log(`▶ probing ${model} ...`);
  results.push(await probe(model));
}

console.log('\n=== SUMMARY ===');
for (const r of results) {
  const done = r.chapters.length;
  const avgMs = done ? Math.round(r.chapters.reduce((s, c) => s + c.ms, 0) / done) : 0;
  const repairs = r.chapters.filter((c) => c.repaired).length;
  const avgWords = done ? Math.round(r.chapters.reduce((s, c) => s + c.words, 0) / done) : 0;
  const avgAiTell = done ? (r.chapters.reduce((s, c) => s + c.aiTell, 0) / done).toFixed(2) : '-';
  const avgStruct = done ? (r.chapters.reduce((s, c) => s + c.structural, 0) / done).toFixed(2) : '-';
  console.log(`\n${r.model}`);
  console.log(`  ok=${r.ok}  outline=${(r.outlineMs / 1000).toFixed(1)}s  chapters_done=${done}/${chapterTarget}`);
  console.log(`  avg/chapter: ${(avgMs / 1000).toFixed(1)}s  words=${avgWords}  repaired=${repairs}/${done}`);
  console.log(`  avg slop: aiTell=${avgAiTell}  structural=${avgStruct}`);
  if (r.errors.length) console.log(`  errors: ${r.errors.join(' | ')}`);
}
