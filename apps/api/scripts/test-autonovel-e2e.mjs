import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// End-to-end smoke test of the autonovel upgrades. Enables every opt-in pass
// (adversarial cut, reader panel, manuscript review, revision loop) plus the
// always-on voice lock + propagation ledger, runs a REAL full story, and prints
// the resulting quality reports.
//
//   npx tsx scripts/test-autonovel-e2e.mjs

// Flags must be set BEFORE importing the env module (it parses process.env once).
process.env.ADVERSARIAL_CUT_ENABLED = 'true';
process.env.READER_PANEL_ENABLED = 'true';
process.env.MANUSCRIPT_REVIEW_ENABLED = 'true';
process.env.REVISION_LOOP_ENABLED = 'true';
process.env.REVISION_MAX_CHAPTERS = '2';
process.env.VOICE_LOCK_ENABLED = 'true';
process.env.PROPAGATION_LEDGER_ENABLED = 'true';

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

console.log(`provider=${env.routerBaseUrl}  preset=${env.modelPreset}`);
console.log('flags:', JSON.stringify({
  adversarialCut: env.adversarialCutEnabled,
  readerPanel: env.readerPanelEnabled,
  manuscriptReview: env.manuscriptReviewEnabled,
  revisionLoop: env.revisionLoopEnabled,
  revisionMaxChapters: env.revisionMaxChapters,
  voiceLock: env.voiceLockEnabled,
  propagationLedger: env.propagationLedgerEnabled,
}));

const outline = NormalizedOutlineRequestSchema.parse({
  titleHint: 'Autonovel E2E',
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
  env.modelPreset,
  new SeedHistoryStore(),
);

const started = Date.now();
try {
  const payload = await orchestrator.generateFull(request, {
    onProgress: (event) => {
      if (event.status === 'completed' && event.label) {
        console.log(`  [${event.current ?? '?'}/${event.total ?? '?'}] ${event.label}`);
      }
    },
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✔ story generated: ${payload.chapters.length} chapters in ${secs}s`);

  const meta = payload.meta ?? {};

  console.log('\n── Reader panel ─────────────────────────────');
  if (meta.readerPanel) {
    console.log(`overall: ${meta.readerPanel.overallScore}/10  (model ${meta.readerPanel.model})`);
    for (const p of meta.readerPanel.personas) console.log(`  • ${p.persona}: ${p.score}/10 — 👍 ${p.liked} | ⚠️ ${p.concern}`);
    for (const i of meta.readerPanel.topIssues) console.log(`  [${i.severity}] ${i.issue} (ch ${i.chapters.join(',') || '-'})`);
  } else console.log('(none)');

  console.log('\n── Manuscript review ────────────────────────');
  if (meta.manuscriptReview) {
    console.log(`verdict: ${meta.manuscriptReview.verdict}`);
    for (const it of meta.manuscriptReview.items) console.log(`  [${it.severity}/${it.persona}] ${it.issue} (ch ${it.chapters.join(',') || '-'})`);
  } else console.log('(none)');

  console.log('\n── Propagation debt ─────────────────────────');
  if (Array.isArray(meta.propagationDebt) && meta.propagationDebt.length > 0) {
    for (const d of meta.propagationDebt) console.log(`  [${d.severity}] ${d.kind}: ${d.detail} (ch ${d.chapters.join(',') || '-'})`);
  } else console.log('(none — no unpaid debts)');

  const lens = payload.chapters.map((c) => c.text.length);
  console.log(`\nchapter text lengths (chars): ${lens.join(', ')}`);
} catch (error) {
  console.log(`\n✗ generation failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
}
