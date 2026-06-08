import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Smoke test: run the REAL orchestrator for a given tier against the configured
// provider (ckey.vn). Confirms the full pipeline (planner -> bible -> chapter
// plan -> chapters) works with that tier's model, and prints model aliases.
//
// Usage:
//   npx tsx scripts/test-tier-generation.mjs --tier free
//   npx tsx scripts/test-tier-generation.mjs --tier premium

const args = process.argv.slice(2);
const tierArg = (() => {
  const i = args.indexOf('--tier');
  return i >= 0 ? args[i + 1] : 'free';
})();

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..', '..');
process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;

const { env } = await import('../../../src/lib/env.js');
const { StoryOrchestrator } = await import('../../../src/modules/orchestrator/story-orchestrator.js');
const { PresetLoader } = await import('../../../src/modules/presets/preset-loader.js');
const { RouterClient } = await import('../../../src/modules/router/router-client.js');
const { SeedHistoryStore } = await import('../../../src/modules/session/seed-history-store.js');
const { NormalizedFullGenerateRequestSchema, NormalizedOutlineRequestSchema } =
  await import('../../../src/schemas/story.js');

const presetName = env.modelPresetByTier[tierArg] ?? env.modelPreset;
console.log(`tier=${tierArg}  model preset=${presetName}  provider=${env.routerBaseUrl}`);

const outline = NormalizedOutlineRequestSchema.parse({
  titleHint: 'Test ckey provider',
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
});
const request = NormalizedFullGenerateRequestSchema.parse({
  ...outline,
  draftControls: { dialogueRatio: 0.5, hookDensity: 'medium' },
});

const orchestrator = new StoryOrchestrator(
  new PresetLoader(),
  new RouterClient(),
  presetName,
  new SeedHistoryStore(),
);

const started = Date.now();
try {
  const payload = await orchestrator.generateFull(request, {
    onProgress: (event) => {
      if (event.label) console.log(`  [${event.current ?? '?'}/${event.total ?? '?'}] ${event.label}`);
    },
  });
  console.log(`\n✔ full story generated: ${payload.chapters.length} chapters in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('model aliases:', JSON.stringify(payload.meta?.modelAliases ?? {}));
  const firstLen = payload.chapters[0]?.text?.length ?? 0;
  console.log(`first chapter length: ${firstLen} chars`);

  // ─── autonovel upgrade reports ──────────────────────────────────────────
  const rp = payload.meta?.readerPanel;
  if (rp) {
    console.log(`\n[reader panel] overall=${rp.overallScore}/10  personas=${rp.personas.length}  topIssues=${rp.topIssues.length}`);
    for (const issue of rp.topIssues.slice(0, 5)) {
      console.log(`   - (${issue.severity}) ${issue.issue} ${issue.chapters.length ? `[ch ${issue.chapters.join(',')}]` : ''}`);
    }
  } else {
    console.log('\n[reader panel] (not enabled / no report)');
  }

  const mr = payload.meta?.manuscriptReview;
  if (mr) {
    console.log(`\n[manuscript review] items=${mr.items.length}\n   verdict: ${mr.verdict}`);
    for (const item of mr.items.slice(0, 5)) {
      console.log(`   - (${item.severity}/${item.persona}) ${item.issue} ${item.chapters.length ? `[ch ${item.chapters.join(',')}]` : ''}`);
    }
  } else {
    console.log('\n[manuscript review] (not enabled / no report)');
  }

  const debt = payload.meta?.propagationDebt;
  if (debt && debt.length > 0) {
    console.log(`\n[propagation debt] ${debt.length} item(s):`);
    for (const d of debt.slice(0, 8)) {
      console.log(`   - (${d.severity}) ${d.kind}: ${d.detail}`);
    }
  } else {
    console.log('\n[propagation debt] none');
  }
} catch (error) {
  console.log(`\n✗ generation failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error?.message ?? error}`);
  process.exit(1);
}
