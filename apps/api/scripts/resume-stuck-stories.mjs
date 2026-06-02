import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Admin batch resume for stories stuck in `running` whose in-memory job died
// (server restart / disconnect). Reconstructs the same orchestrator wiring as
// the API and writes completed payloads back to the same Supabase project.
//
// Usage:
//   node apps/api/scripts/resume-stuck-stories.mjs            # dry run (lists targets)
//   node apps/api/scripts/resume-stuck-stories.mjs --run      # actually resume
//   node apps/api/scripts/resume-stuck-stories.mjs --run --id <storyId>
//   node apps/api/scripts/resume-stuck-stories.mjs --run --skip-active-min 3
//
// Safety:
// - Dry run by default. Nothing is generated or written without --run.
// - Skips any story updated within --skip-active-min minutes (default 3) so an
//   actively-streaming job is never double-driven.

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const ONLY_ID = readFlag('--id');
const SKIP_ACTIVE_MIN = Number(readFlag('--skip-active-min') ?? '3');

function readFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

// Load .env from repo root without printing secrets.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Reuse the exact orchestrator wiring from the API (env-driven router).
const { StoryOrchestrator } = await import('../../../src/modules/orchestrator/story-orchestrator.js');
const { PresetLoader } = await import('../../../src/modules/presets/preset-loader.js');
const { RouterClient } = await import('../../../src/modules/router/router-client.js');
const { SeedHistoryStore } = await import('../../../src/modules/session/seed-history-store.js');
const { getRemainingChapterPlanItems } = await import('../../../src/modules/orchestrator/story-resume.js');
const { env } = await import('../../../src/lib/env.js');

const orchestrator = new StoryOrchestrator(
  new PresetLoader(),
  new RouterClient(),
  env.modelPreset,
  new SeedHistoryStore(),
);

function remaining(payload) {
  if (!payload || !Array.isArray(payload.chapterPlan) || !Array.isArray(payload.chapters)) return [];
  return getRemainingChapterPlanItems(payload);
}

// Verify the AI router is reachable before doing anything heavy.
try {
  const health = await new RouterClient().checkHealth();
  console.log(`router: ${health.status} @ ${health.baseUrl}${health.details ? ` (${health.details})` : ''}`);
  if (RUN && health.status !== 'healthy') {
    console.error('Router is not healthy; aborting. Re-run when the AI connection is stable.');
    process.exit(3);
  }
} catch (error) {
  console.error(`router check failed: ${error?.message ?? error}`);
  if (RUN) process.exit(3);
}

let query = supabase
  .from('stories')
  .select('id,user_id,title,status,updated_at,story_payload')
  .order('updated_at', { ascending: true });
if (ONLY_ID) {
  // Targeting a specific story: ignore the status filter so we can recover a
  // story that was previously marked failed mid-resume.
  query = query.eq('id', ONLY_ID);
} else {
  query = query.eq('status', 'running');
}

const { data: stories, error } = await query;
if (error) {
  console.error('read error:', error.message);
  process.exit(1);
}

const now = Date.now();
const targets = [];
for (const s of stories) {
  const ageMin = (now - new Date(s.updated_at).getTime()) / 60000;
  const rem = remaining(s.story_payload);
  const drafted = Array.isArray(s.story_payload?.chapters) ? s.story_payload.chapters.length : 0;
  if (!s.story_payload || rem.length === 0) {
    console.log(`skip "${s.title}" (${s.id.slice(0, 8)}): not resumable (drafted=${drafted}, remaining=${rem.length})`);
    continue;
  }
  if (ageMin < SKIP_ACTIVE_MIN) {
    console.log(`skip "${s.title}" (${s.id.slice(0, 8)}): updated ${ageMin.toFixed(1)}m ago, may be actively generating`);
    continue;
  }
  targets.push({ ...s, drafted, remaining: rem.length });
}

console.log(`\n${RUN ? 'RESUMING' : 'DRY RUN'} — ${targets.length} resumable stuck stories:\n`);
for (const t of targets) {
  console.log(`  • "${t.title}" (${t.id.slice(0, 8)})  ${t.drafted}/${t.drafted + t.remaining} → +${t.remaining} chapters`);
}
if (!RUN) {
  console.log('\nNo changes made. Re-run with --run to resume these stories.');
  process.exit(0);
}

console.log('');
const results = { completed: 0, failed: 0 };
for (const t of targets) {
  console.log(`\n=== "${t.title}" (${t.id.slice(0, 8)}) — writing ${t.remaining} more chapters ===`);
  try {
    let lastSaved = 0;
    const finalPayload = await orchestrator.resumeFull(t.story_payload, {
      onProgress: (event) => {
        if (event.label) {
          const pct = event.total ? ` [${event.current}/${event.total}]` : '';
          process.stdout.write(`  ${event.label}${pct}\n`);
        }
        // Persist partial progress so a mid-run failure still saves new chapters.
        if (event.storyPayload && Array.isArray(event.storyPayload.chapters)) {
          const count = event.storyPayload.chapters.length;
          if (count > lastSaved) {
            lastSaved = count;
            void saveStory(t.user_id, t.id, event.storyPayload, 'running');
          }
        }
      },
    });

    await saveStory(t.user_id, t.id, finalPayload, 'completed');
    results.completed += 1;
    console.log(`  ✔ completed: ${finalPayload.chapters.length} chapters`);
  } catch (err) {
    results.failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ failed: ${message}`);
    await supabase
      .from('stories')
      .update({ status: 'failed', error: `Resume thất bại: ${message}`.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', t.id)
      .eq('user_id', t.user_id);
  }
}

console.log(`\n=== done: ${results.completed} completed, ${results.failed} failed ===`);

async function saveStory(userId, id, storyPayload, status) {
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  const { error: saveError } = await supabase
    .from('stories')
    .update({
      title: storyPayload.title,
      status,
      story_payload: storyPayload,
      relationship_graph: storyPayload.relationshipGraph ?? null,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
      error: null,
    })
    .eq('user_id', userId)
    .eq('id', id);
  if (saveError) console.log(`  ! save error (${status}): ${saveError.message}`);
}
