# PLAN — Character Consistency & Desktop/Web Parity

## Problem Statement

Two critical gaps in the Drama15 story generation system:

1. **Character Consistency**: 10-chapter stories have no mechanism to track character state (emotional arc, relationships, speech patterns, established facts) across chapters. `summarizeChapter()` returns a 200-char string — insufficient for continuity.

2. **Desktop/Web Parity**: Duplicate prompt builders, web-only features (Vietnamese AI-tell detection, character speech patterns, consistency validation), and divergent code paths make maintenance expensive and quality inconsistent.

## Progress Tracker

- [x] Phase 1: Core pipeline types, progress reporter, stage runner
- [x] Phase 2: Character memory store, fact extractor, consistency validator, continuity tracker
- [x] Phase 3: AI-tell detector, phrase reuse tracker, sentence variance analyzer
- [x] Phase 4: Unified prompt templates, prompt builder, Gu Man style guide
- [x] Pipeline Orchestrator (core orchestration engine)
- [ ] Phase 5: Desktop orchestrator adapter
- [ ] Phase 6: Web API engine adapter
- [ ] Phase 7: TypeScript compile check + tests

**Status**: Core pipeline ✅ implemented. Desktop/Web adapters in progress.

---

- Unify the core generation pipeline so both desktop and web share the same code
- Implement character memory tracking across chapters
- Port web-only quality features (AI-tell detection, speech patterns, consistency validation) to shared core
- Eliminate duplicate prompt builders
- Maintain backward compatibility with existing JSON files (session, history, seed history)

## Phases

### Phase 1: Unified Core Pipeline Module
Create `src/modules/core-pipeline/` with shared orchestration logic.

### Phase 2: Character Memory & Consistency (Shared)
Move character tracking from web-only to shared core.

### Phase 3: AI-Tell Detection & Quality (Shared)
Port Vietnamese AI-tell detection and quality validators to shared core.

### Phase 4: Prompt Builder Unification
Consolidate duplicate prompt builders into single shared module.

### Phase 5: Desktop Adapter Integration
Wire desktop orchestrator to use the new shared core.

### Phase 6: Web Adapter Integration
Wire web API engine to use the new shared core.

### Phase 7: Tests & Cleanup

---

## Phase 1: Unified Core Pipeline Module

### New files:

```
src/modules/core-pipeline/
├── pipeline-types.ts          ← Shared type definitions for pipeline stages
├── pipeline-context.ts        ← Generation context (models, presets, temperatures)
├── pipeline-progress.ts       ← Progress reporter interface (works for desktop + web)
├── pipeline-stage.ts          ← Stage runner with error handling
└── pipeline-orchestrator.ts   ← Main orchestrator: seed → concept → bible → plan → chapters
```

### `pipeline-types.ts`
- Define `PipelineStage` enum: `seed | concept | bible | plan | chapter | finalize`
- Define `PipelineRequest` (unified input for both desktop and web)
- Define `PipelineResult` (unified output)
- Define `ChapterDraftResult` with metrics

### `pipeline-context.ts`
- Resolve models (planner, bible, drafter, rewriter, fallback)
- Resolve presets (line, style)
- Apply temperatures per stage
- Load generation config

### `pipeline-progress.ts`
- Interface `ProgressReporter` (compatible with desktop callback + web SSE)
- Stage labels in Vietnamese
- Progress event emission

### `pipeline-stage.ts`
- `runStage()` wrapper with error handling, timing, progress emit
- Retry logic with max attempts
- Model fallback handling

### `pipeline-orchestrator.ts`
- `generateOutline()` → seed, concept, bible, plan, assemble
- `generateFull()` → outline + poster + 10 chapters + finalize
- `generateChapter()` → draft + quality check + repair + emit
- `regenerateChapter()` → preserve constraints, rewrite
- Uses shared `RouterClient`
- Integrates `CharacterMemoryStore` (Phase 2)

### What changes:
- `src/modules/orchestrator/story-orchestrator.ts` → **becomes a thin desktop adapter** that calls `PipelineOrchestrator`
- `apps/api/src/storyEngine.ts` → **becomes a thin web adapter** that calls `PipelineOrchestrator` + streams SSE

---

## Phase 2: Character Memory & Consistency (Shared)

### Move files:
```
apps/api/src/stories/characterMemoryStore.ts  →  src/modules/core-pipeline/character-memory-store.ts
apps/api/src/stories/characterSummary.ts      →  src/modules/core-pipeline/character-summary.ts
```

### New files:
```
src/modules/core-pipeline/
├── character-fact-extractor.ts   ← LLM-based fact extraction (temp 0.2)
├── character-consistency.ts      ← Drift detection validator
└── continuity-tracker.ts        ← Enhanced ContinuityLite
```

### `character-memory-store.ts`
- Already implemented and working. Just move to shared location.
- No code changes needed.

### `character-summary.ts`
- Already implemented and working. Just move to shared location.
- No code changes needed.

### `character-fact-extractor.ts` (new)
```typescript
export async function extractCharacterFacts(
  chapterText: string,
  chapterNumber: number,
  storyBible: StoryBible,
  outputLanguage: string,
  routerClient: RouterClient,
): Promise<CharacterFactSheet>
```
- Calls LLM with temp 0.2 for structured extraction
- Extracts: emotional state, relationship changes, social position, established facts
- Returns `CharacterFactSheet` for storage in `CharacterMemoryStore`

### `character-consistency.ts` (new)
```typescript
export type DriftSeverity = 'critical' | 'warning'

export type DriftViolation = {
  character: string
  type: 'personality' | 'relationship' | 'fact' | 'speech_pattern'
  severity: DriftSeverity
  description: string
  expected: string
  actual: string
}

export async function validateConsistency(
  chapterText: string,
  chapterNumber: number,
  memoryStore: CharacterMemoryStore,
  storyBible: StoryBible,
  routerClient: RouterClient,
): Promise<DriftReport>
```
- Calls LLM with temp 0.1 for drift detection
- Compares new chapter against accumulated facts in memory store
- Returns violations with severity

### `continuity-tracker.ts` (new)
- Enhanced version of `createContinuityLite()`
- Tracks:
  - Character names and speech patterns
  - Emotional state progression per chapter
  - Relationship changes per chapter
  - Established facts (from memory store)
  - Foreshadow items planted vs activated
  - Plot beats achieved vs planned
- Renders to prompt-friendly context for LLM

### Integration into pipeline:
```
Chapter generation loop:
  1. Draft chapter (with continuity context from tracker)
  2. Quality check (word count, dialogue ratio)
  3. Consistency check (drift detection via LLM)
  4. Repair loop (if quality OR consistency fails, max 3 attempts combined)
  5. Extract character facts (LLM, temp 0.2)
  6. Store in CharacterMemoryStore
  7. Generate character-organized summary
  8. Update ContinuityTracker
  9. Next chapter
```

---

## Phase 3: AI-Tell Detection & Quality (Shared)

### Move files:
```
apps/api/src/stories/vietnameseAiTells.ts  →  src/modules/core-pipeline/validators/ai-tell-detector.ts
```

### New files:
```
src/modules/core-pipeline/validators/
├── ai-tell-detector.ts       ← Vietnamese AI-tell phrase bank + detector
├── phrase-reuse-tracker.ts   ← Trigram-based phrase reuse scoring
└── sentence-variance.ts       ← Sentence-level variance analysis
```

### `ai-tell-detector.ts`
- Move `VIETNAMESE_BANNED_PHRASES` dictionary
- Add `detectAiTells(text)` function
- Add `generateRepairInstructions(aiScore)` function
- Make language-agnostic (support English, Japanese, Korean later)

### `phrase-reuse-tracker.ts`
- Move from web to shared
- Trigram overlap scoring between chapters
- Detect and flag repeated phrases

### `sentence-variance.ts`
- Move from web to shared
- Fragment detection
- Variance repair instructions

### Integration into chapter quality:
```typescript
// In analyzeChapterQuality() or repair loop:
const aiTellScore = detectAiTells(chapterText, outputLanguage);
if (aiTellScore > threshold) {
  metrics.failures.push(`AI-tell score too high: ${aiTellScore}`);
  triggers repair with humanization instructions
}
```

---

## Phase 4: Prompt Builder Unification

### Problem:
- Desktop: `src/modules/prompts/story-prompts.ts` (803 lines)
- Web: `apps/api/src/storyEngine.ts` (1170 lines, includes prompt builders)
- Both build concept, bible, plan, chapter draft, repair prompts
- Desktop missing: Gu Man style overlay, speech patterns, recent title avoidance
- Web missing: repair loop logic (storyEngine.ts has prompt builders but no repair loop caller)

### Solution:
Create unified prompt builders in `src/modules/prompts/`:

```
src/modules/prompts/
├── prompt-templates.ts         ← Stage-specific system prompt templates
├── prompt-builder.ts           ← Unified prompt construction (all stages)
├── story-prompts.ts            ← KEEP: existing desktop prompts (refactor into builder)
├── seed-blueprint.ts           ← KEEP: shared
├── drama15-seed-engine.ts      ← KEEP: shared
├── drama15-chapter-architecture.ts ← KEEP: shared
├── system-prompt-loader.ts     ← KEEP: shared
├── stage-system-instructions.ts ← KEEP: shared
└── gu-man-style-guide.ts       ← Extract from web storyEngine.ts
```

### `prompt-templates.ts`
```typescript
export const SYSTEM_PROMPTS = {
  concept: string,
  bible: string,
  chapterPlan: string,
  chapterDraft: string,
  chapterRepair: string,
  regenerateChapter: string,
  settingSeed: string,
}
```

### `prompt-builder.ts`
```typescript
export function buildPrompt(stage: Stage, params: StageParams): { systemPrompt: string, userPrompt: string }
```
- Combines system prompt template + stage-specific supplement + style overlays + context blocks
- Single source of truth for all prompt construction

### `gu-man-style-guide.ts`
- Extract `loadGuManStyleGuide()` from `apps/api/src/storyEngine.ts`
- Move to shared location
- Add caching

### Changes:
- `story-prompts.ts` → refactor: each `buildXxxPrompt()` calls `buildPrompt(XxxStage, params)`
- `apps/api/src/storyEngine.ts` → remove duplicate prompt builders, import from shared

---

## Phase 5: Desktop Adapter Integration

### Changes to `src/modules/orchestrator/story-orchestrator.ts`:

**Before:** Full pipeline implementation (~970 lines)
**After:** Thin adapter that calls `PipelineOrchestrator` (~100 lines)

```typescript
import { PipelineOrchestrator } from '../core-pipeline/pipeline-orchestrator';
import { createDesktopProgressReporter } from '../core-pipeline/pipeline-progress';
import { createFileBasedSeedHistoryStore } from '../session/seed-history-store';
import { createFileBasedStoryHistoryStore } from '../session/story-history-store';

export class StoryOrchestrator {
  private pipeline: PipelineOrchestrator;

  constructor(routerClient: RouterClient, posterGenerator?: StoryPosterGeneratorPort) {
    this.pipeline = new PipelineOrchestrator(routerClient, posterGenerator);
  }

  async generateOutline(request: NormalizedOutlineRequest, progressOptions?: StoryProgressOptions) {
    const progress = createDesktopProgressReporter(progressOptions);
    const seedHistoryStore = createFileBasedSeedHistoryStore();
    return this.pipeline.generateOutline(request, progress, { seedHistoryStore });
  }

  async generateFull(request: NormalizedFullGenerateRequest, progressOptions?: StoryProgressOptions) {
    const progress = createDesktopProgressReporter(progressOptions);
    const seedHistoryStore = createFileBasedSeedHistoryStore();
    const storyHistoryStore = createFileBasedStoryHistoryStore();
    return this.pipeline.generateFull(request, progress, {
      seedHistoryStore,
      storyHistoryStore,
      exportPath: env.outputDir,
    });
  }

  // ... same for generateChapter, regenerateChapter
}
```

### Desktop-specific concerns handled in adapter:
- Electron IPC event emission → mapped to `ProgressReporter`
- File-based session/history stores → passed as dependencies
- Markdown/PDF export → called after pipeline completes

---

## Phase 6: Web Adapter Integration

### Changes to `apps/api/src/storyEngine.ts`:

**Before:** Full pipeline reimplementation (~1170 lines)
**After:** Thin adapter that calls `PipelineOrchestrator` + SSE streaming

```typescript
import { PipelineOrchestrator } from '../../../src/modules/core-pipeline/pipeline-orchestrator';
import { createSseProgressReporter } from '../../../src/modules/core-pipeline/pipeline-progress';
import { StoryJobFsmRepo } from './stories/fsmDb';

export class WebStoryEngine {
  private pipeline: PipelineOrchestrator;

  constructor(routerClient: RouterClient) {
    this.pipeline = new PipelineOrchestrator(routerClient);
  }

  async generateFullStream(jobId: string, request: GenerateRequest, sse: ServerSentEventStream) {
    const progress = createSseProgressReporter(sse, jobId);
    const fsmRepo = new StoryJobFsmRepo();

    fsmRepo.applyTransition(jobId, 'start');

    try {
      const result = await this.pipeline.generateFull(request, progress, {
        characterMemoryStore: true,  // enable character tracking
        consistencyValidation: true,  // enable drift detection
        seedHistoryStore: dbSeedHistoryStore,
      });

      fsmRepo.applyTransition(jobId, 'complete');
      return result;
    } catch (error) {
      fsmRepo.applyTransition(jobId, 'fail');
      throw error;
    }
  }
}
```

### Web-specific concerns handled in adapter:
- SSE streaming → mapped from `ProgressReporter`
- FSM transitions → called on pipeline stage completion
- Database-based history stores → passed as dependencies
- Quota management → handled in adapter, not pipeline

---

## Phase 7: Tests & Cleanup

### Tests to add:
1. **Unit tests** for each pipeline stage (seed, concept, bible, plan, chapter)
2. **Integration tests** for pipeline end-to-end (mock LLM responses)
3. **Character consistency tests**:
   - Memory store serialization/deserialization
   - Fact extraction accuracy
   - Drift detection sensitivity
   - Character summary generation
4. **AI-tell detection tests**:
   - Phrase matching accuracy
   - Repair instruction generation
5. **Prompt builder tests**:
   - All stages produce valid prompts
   - System prompt includes all required overlays
   - Character name diversity enforcement
6. **Parity tests**:
   - Desktop adapter → same output as pipeline
   - Web adapter → same output as pipeline
   - Both use same prompt templates

### Cleanup:
- Remove duplicate prompt builders from `apps/api/src/storyEngine.ts`
- Remove unused web-only modules (now in shared core)
- Update import paths
- Verify benchmark still passes (≥0.85 on all 4 metrics)

---

## File Change Summary

### New Files (13):
1. `src/modules/core-pipeline/pipeline-types.ts`
2. `src/modules/core-pipeline/pipeline-context.ts`
3. `src/modules/core-pipeline/pipeline-progress.ts`
4. `src/modules/core-pipeline/pipeline-stage.ts`
5. `src/modules/core-pipeline/pipeline-orchestrator.ts`
6. `src/modules/core-pipeline/character-fact-extractor.ts`
7. `src/modules/core-pipeline/character-consistency.ts`
8. `src/modules/core-pipeline/continuity-tracker.ts`
9. `src/modules/core-pipeline/validators/ai-tell-detector.ts`
10. `src/modules/core-pipeline/validators/phrase-reuse-tracker.ts`
11. `src/modules/core-pipeline/validators/sentence-variance.ts`
12. `src/modules/prompts/prompt-templates.ts`
13. `src/modules/prompts/prompt-builder.ts`

### Moved Files (5):
1. `apps/api/src/stories/characterMemoryStore.ts` → `src/modules/core-pipeline/character-memory-store.ts`
2. `apps/api/src/stories/characterSummary.ts` → `src/modules/core-pipeline/character-summary.ts`
3. `apps/api/src/stories/vietnameseAiTells.ts` → `src/modules/core-pipeline/validators/ai-tell-detector.ts`
4. `apps/api/src/stories/sentenceVarianceAnalyzer.ts` → `src/modules/core-pipeline/validators/sentence-variance.ts`
5. `apps/api/src/stories/phraseReuseTracker.ts` → `src/modules/core-pipeline/validators/phrase-reuse-tracker.ts`

### Modified Files (4):
1. `src/modules/orchestrator/story-orchestrator.ts` → Thin desktop adapter
2. `apps/api/src/storyEngine.ts` → Thin web adapter
3. `src/modules/prompts/story-prompts.ts` → Refactor to use shared prompt builder
4. `src/modules/validators/story-validator.ts` → Remove character-unrelated code, keep coercion helpers

### Deleted Files (0):
- No files deleted. Web modules moved (re-export from old location for backward compat)

---

## Execution Order

1. **Phase 4** (Prompt unification) → Foundation for everything else
2. **Phase 2** (Character Memory) → Core quality feature
3. **Phase 3** (AI-Tell Detection) → Core quality feature
4. **Phase 1** (Pipeline Orchestrator) → Glue everything together
5. **Phase 5** (Desktop Adapter) → Wire desktop
6. **Phase 6** (Web Adapter) → Wire web
7. **Phase 7** (Tests & Cleanup) → Verify and clean up
