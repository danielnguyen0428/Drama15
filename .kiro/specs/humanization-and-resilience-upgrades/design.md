# Design: Humanization & Resilience Upgrades (Wave 5-7)

## Overview

Wave 5-7 add three layered post-processing stages to the existing chapter generation pipeline in `apps/api/src/startDev.ts`:

1. **Phrase-Reuse Tracker** (Wave 5) — in-process trigram index per story job, used to detect cross-chapter cliché reuse.
2. **Idiolect Per Character** (Wave 6) — extends `Story_Bible` schema, `Continuity_Lite`, and `Consistency_Validator` to track and verify per-character speech voice.
3. **Humanization Wave** (Wave 7) — sentence variance analyzer, punctuation/register prompt rules, and LRT-based AI detector with humanization repair.

All three integrate as additional checkpoints in the existing chapter loop, after quality repair and consistency validation but before the final `chapter` SSE event. Each stage can trigger at most one targeted repair LLM call to bound latency.

## Architecture

```
Existing chapter loop:
  [Draft] → [Quality Repair Loop] → [Soft-Pass Check] → [AI-Tell Repair (W3)]
       → [Consistency Validator] → [Drift Repair Loop] → [Fact Extraction]
       → [Character Summary] → [Send Chapter Event]

Upgraded chapter loop:
  [Draft] → [Quality Repair Loop] → [Soft-Pass Check] → [AI-Tell Repair (W3)]
       → [Phrase-Reuse Check (W5)] → [Phrase-Reuse Repair?]
       → [Consistency Validator (extended W6)] → [Drift Repair Loop]
       → [Idiolect Repair (W6)?]
       → [Sentence Variance Check (W7)] → [Variance Repair?]
       → [LRT Detector (W7, flagged)] → [Humanization Repair?]
       → [Fact Extraction] → [Character Summary] → [Send Chapter Event]
```

Each upgraded stage adds optional fields to the `chapter` SSE meta. Feature flags allow toggling each stage independently.

## Components

Same as the "Components Detail" section below ([Wave 5: Phrase-Reuse Tracker](#wave-5-phrase-reuse-tracker), [Wave 6: Idiolect Per Character](#wave-6-idiolect-per-character), [Wave 7: Humanization Wave](#wave-7-humanization-wave)).

## Components and Interfaces

### Phrase-Reuse Tracker (Wave 5)
- **Module:** `apps/api/src/stories/phraseReuseTracker.ts` (new)
- **Public interface:** `createPhraseReuseIndex()`, `indexChapter(idx, n, text)`, `scoreCandidate(idx, text, n) → PhraseReuseReport`, `buildReuseRepairInstruction(report) → string`
- **Lifetime:** in-memory per story-job; created at start of chapter loop, discarded when SSE stream ends.
- **Dependencies:** none external. Pure TS.

### Speech Pattern Schema (Wave 6)
- **Module:** `apps/api/src/stories/desktopParity.ts` (extended)
- **Public interface:** `SpeechPatternSchema`, type `SpeechPattern`, extended `StoryBibleSchema` with optional `speechPattern` per character.
- **Backwards compat:** existing bibles parse without `speechPattern`. New field is `.optional()` at the Zod level.

### Idiolect-Aware Validator (Wave 6)
- **Module:** `apps/api/src/stories/consistencyValidator.ts` (extended)
- **Change:** `ViolationType` adds `'speech_idiolect'` variant. `buildValidationSystemPrompt()` enumerates 6 categories. `classifyViolationSeverity()` returns `'warning'` for speech_idiolect.

### Sentence Variance Analyzer (Wave 7)
- **Module:** `apps/api/src/stories/sentenceVarianceAnalyzer.ts` (new)
- **Public interface:** `analyzeSentenceVariance(text) → SentenceVarianceMetrics`, `buildVarianceRepairInstruction(metrics) → string`
- **Computation:** sentence segmentation by `[.!?…]\s+`, word count per sentence, cv = stdev / mean, fragment heuristic on token count + verb pattern.

### AI Detector Adapter (Wave 7)
- **Module:** `apps/api/src/stories/aiDetector.ts` (new)
- **Interface:** `AiDetectorAdapter { score(text, opts?) → Promise<number | null>; readonly name }`
- **Default impl:** `createLrtDetector({ baseUrl, apiKey, model })` — 2 LLM calls with contrasting personas, normalize to [0,1].
- **Stub impl:** `noopDetector` — always returns null. Used when feature flag is off.
- **Failure mode:** on timeout/exception, returns null. Caller treats null as "skip humanization repair".

### Pipeline Orchestrator (extended)
- **File:** `apps/api/src/startDev.ts` (existing, extended)
- **Inserted stages** (in order, after current consistency validator and drift repair):
  1. Phrase-reuse check + optional repair
  2. Idiolect repair (when ≥ 2 idiolect warnings, no critical drift)
  3. Sentence variance check + optional repair
  4. AI detector + optional humanization repair
- **Each stage feature-flagged** via env var. Stages added at most 1 LLM call each.

## Correctness Properties

### Property 1: Phrase-reuse symmetric

For any pair of chapter texts (A, B) and chapter numbers (i, j) with i ≠ j: `scoreCandidate(indexedFromA, B, j).reuseScore` and `scoreCandidate(indexedFromB, A, i).reuseScore` agree within 5% absolute. Verified by property test with 100 random text pairs.

**Validates: Requirements 1.4**

### Property 2: Phrase-reuse never NaN

For any non-empty text and valid index, `scoreCandidate` returns `reuseScore ∈ [0, 1]`, never NaN/Infinity. Verified by property test.

**Validates: Requirements 1.4, 1.8**

### Property 3: speech_idiolect non-critical

For any DriftReport produced by the validator, every violation with `type === 'speech_idiolect'` has `severity === 'warning'`. Verified by property test.

**Validates: Requirements 2.6**

### Property 4: avoidedPhrase detection

For any character C with a non-empty `avoidedPhrases` list, given a chapter where C speaks a line containing one of those phrases, the validator emits at least one `speech_idiolect` warning naming C. Verified by property test with random samples.

**Validates: Requirements 2.5, 2.9**

### Property 5: Sentence variance bounded

For any text, `analyzeSentenceVariance(text).cv` is finite and ≥ 0 (or precisely 0 when all sentences are equal length or there is at most 1 sentence). Verified by property test with edge cases (empty text, single sentence, equal-length sentences).

**Validates: Requirements 3.1, 3.2**

### Property 6: Detector range

Any successful `aiDetector.score(text)` call returns a value in `[0, 1]`. Failures return `null`. Never NaN/Infinity, never negative, never > 1. Verified by property test with 100 random texts (mocked LLM).

**Validates: Requirements 3.5, 3.6, 3.9**

### Property 7: Repair monotonicity

For any of the 4 new repair stages, the repaired chapter is accepted iff its score is strictly better than the original. If equal or worse, original is kept. Verified by integration test.

**Validates: Requirements 1.5, 1.6, 2.8, 3.7**

### Property 8: Feature flag isolation

With all Wave 5-7 flags off, the chapter SSE meta carries only the keys produced by Wave 1-4 (no `phraseReuseScore`, `idiolectWarnings`, `sentenceCv`, `aiScoreEstimate`, `humanizationRepaired`). Verified by integration test.

**Validates: Requirements 4.1, 4.4**

### Property 9: Backwards compat

Stories generated before Wave 5-7 ship (without `speechPattern` in their bibles) continue to load and render through the parser without throwing. Verified by integration test using a pre-Wave-6 bible fixture.

**Validates: Requirements 2.7**

**File:** `apps/api/src/stories/phraseReuseTracker.ts` (new)

```typescript
export interface PhraseReuseIndex {
  /** trigram (lowercased, punct-stripped, space-joined) → set of chapter numbers in which it appeared */
  trigramOccurrences: Map<string, Set<number>>;
  /** Chapters indexed so far (used to skip already-indexed chapters on re-entry) */
  indexedChapters: Set<number>;
}

export interface PhraseReuseReport {
  reuseScore: number;          // 0..1
  topRepeats: Array<{
    phrase: string;
    chapters: number[];        // chapters where this trigram appeared
    count: number;
  }>;
  needsRepair: boolean;        // true iff reuseScore > 0.15
}

export function createPhraseReuseIndex(): PhraseReuseIndex;
export function indexChapter(idx: PhraseReuseIndex, chapterNumber: number, text: string): void;
export function scoreCandidate(idx: PhraseReuseIndex, candidateText: string, currentChapter: number): PhraseReuseReport;
export function buildReuseRepairInstruction(report: PhraseReuseReport): string;
```

**Tokenization rules:**
- Lowercase via `toLocaleLowerCase('vi')` to handle Vietnamese diacritics correctly
- Strip punctuation (preserve diacritics): `text.replace(/[^\p{L}\p{N}\s]/gu, ' ')`
- Collapse whitespace: `.replace(/\s+/g, ' ').trim()`
- Tokenize on space → `tokens[]`
- Trigrams = `tokens[i..i+2].join(' ')` for i in 0..tokens.length-3

**Stop-word filter:** maintain a 30-50 word list of Vietnamese connectors. Skip a trigram if all 3 tokens are in the list. Stop-list co-located in the file for now; can be moved to a shared resource later.

**Score formula:**
```
scoreCandidate(idx, text, currentChapter):
  candidateTrigrams = extractTrigrams(text)  // set, not list (dedup within chapter)
  reusedCount = count of trigrams that appear in idx.trigramOccurrences
                with at least 2 chapters in their occurrence set
                AND currentChapter not yet indexed
  reuseScore = reusedCount / candidateTrigrams.size
  topRepeats = top 10 reused trigrams sorted by occurrence count descending
  needsRepair = reuseScore > 0.15
```

**Wire into pipeline:** in `startDev.ts` chapter loop, after consistency validation passes:

```typescript
if (FEATURES.phraseReuseTracker) {
  const reuseReport = scoreCandidate(reuseIndex, chapterText, i);
  if (reuseReport.needsRepair) {
    // single-shot repair
    const repairedRaw = await callLLM(...);
    const newReport = scoreCandidate(reuseIndex, newText, i);
    if (newReport.reuseScore < reuseReport.reuseScore) {
      chapterText = newText;
      // log improvement
    }
  }
  // ALWAYS emit reuseScore in meta
  indexChapter(reuseIndex, i, chapterText);
}
```

The index lives in stream handler scope (per story job). Not persisted across server restarts — acceptable because re-running a story job from scratch rebuilds the index.

**Tests:**
- Unit: tokenization stable across whitespace/punct variations
- Unit: stop-word trigrams skipped
- Property: 100 random chapter pairs, reuseScore symmetric within ±5% if texts swapped
- Synthetic: chapter 2 with 30% of chapter 1's trigrams → score ≥ 0.20

### Wave 6: Idiolect Per Character

**Schema extension** in `apps/api/src/stories/desktopParity.ts`:

```typescript
export const SpeechPatternSchema = z.object({
  fillers: z.array(z.string().min(1)).min(2).max(5),
  syntaxQuirk: z.string().min(1),
  vocabularyBand: z.enum(['formal', 'neutral', 'casual', 'crude']),
  avoidedPhrases: z.array(z.string().min(1)).min(1).max(5),
});

export const StoryBibleCharacterSchema = z.object({
  name: z.string().min(1),
  wound: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1),
  blindSpots: z.array(z.string().min(1)).min(1),
  speechPattern: SpeechPatternSchema.optional(), // optional for backwards compat
});
```

`StoryBibleSchema.heroine`, `StoryBibleSchema.betrayer`, `StoryBibleSchema.rival` all extend with `speechPattern: SpeechPatternSchema.optional()`.

**Story Bible prompt change** in `storyEngine.ts → buildStoryBibleUserPrompt`:

Add to instruction list:
```
Each major character (heroine, betrayer, rival) MUST have a `speechPattern` object with:
- `fillers`: 2-3 verbal tics they use (e.g., ["thật ra", "kiểu như", "nói thiệt"])
- `syntaxQuirk`: one syntactic habit (e.g., "uses 1-3 word fragments when angry")
- `vocabularyBand`: one of "formal" | "neutral" | "casual" | "crude"
- `avoidedPhrases`: 1-3 phrases this character would NEVER say (e.g., "không bao giờ dùng từ 'yêu' — luôn nói 'thích'")

Honor these patterns in every line of dialogue throughout the 10-chapter arc.
Different characters MUST have noticeably different speech patterns. No two characters share the same fillers or vocabularyBand.
```

**Continuity_Lite extension** in `storyEngine.ts → buildContinuityLiteFromBible`:

```typescript
export interface ContinuityLite {
  // existing fields...
  speechPatterns?: Record<string, SpeechPattern>;  // [characterName]: SpeechPattern
}
```

Populate from parsed bible in `buildContinuityLiteFromBible`:
```typescript
const speechPatterns: Record<string, SpeechPattern> = {};
if (bible.heroine?.speechPattern) speechPatterns[bible.heroine.name] = bible.heroine.speechPattern;
// ditto for betrayer and rival
return { ...other, speechPatterns: Object.keys(speechPatterns).length > 0 ? speechPatterns : undefined };
```

**Consistency Validator extension** in `consistencyValidator.ts`:

The existing validator builds a JSON validation prompt enumerating categories: name, personality, relationship, social position, emotional continuity. Add a 6th category:
```
6. Speech idiolect: a character speaks lines that violate their `speechPattern.avoidedPhrases` or grossly mismatch their `vocabularyBand`.
```

Extend `Violation` type:
```typescript
export type ViolationType =
  | 'name' | 'personality' | 'relationship' | 'social_position'
  | 'emotional_continuity' | 'speech_idiolect';
```

Severity rule: speech_idiolect = `warning` (not critical) → triggers soft repair, not hard repair. Critical drift still exclusively comes from name/personality/relationship.

**Idiolect repair pass** in startDev.ts: after drift repair loop exits, count idiolect warnings:

```typescript
const idiolectWarnings = driftReport.violations.filter(v => v.type === 'speech_idiolect');
if (idiolectWarnings.length >= 2 && !hasCriticalViolations(driftReport)) {
  const repairInstruction = buildIdiolectRepairInstruction(idiolectWarnings, continuityLite.speechPatterns);
  const repairedRaw = await callLLM(...);
  // ... update chapterText if validator no longer flags those lines
}
```

**Tests:**
- Property: random `SpeechPattern` validates Zod schema
- Property: dialogue lines containing avoidedPhrases trigger detection 100% of time
- Integration: synthetic chapter mixing voices → validator catches mismatches
- E2E: 10-chapter run, dialogue of heroine consistently shows fillers from her pattern

### Wave 7: Humanization Wave

**File:** `apps/api/src/stories/sentenceVarianceAnalyzer.ts` (new)

```typescript
export interface SentenceVarianceMetrics {
  sentenceCount: number;
  meanLengthWords: number;
  stdevLengthWords: number;
  cv: number;                  // stdev / mean
  fragmentRatio: number;       // % sentences without main verb
  needsRepair: boolean;        // true iff cv < 0.55
}

export function analyzeSentenceVariance(text: string): SentenceVarianceMetrics;
export function buildVarianceRepairInstruction(metrics: SentenceVarianceMetrics): string;
```

**Sentence segmentation:** simple regex `text.split(/(?<=[.!?…])\s+/)` — sufficient for Vietnamese. Trim empty.

**Word count per sentence:** `tokens.split(/\s+/).filter(Boolean).length`.

**Fragment detection:** crude heuristic — sentence has < 4 tokens OR no main verb pattern (Vietnamese: no co-occurrence of pronoun+verb). Mark as fragment.

**File:** `apps/api/src/stories/aiDetector.ts` (new)

```typescript
export interface AiDetectorAdapter {
  /** Returns aiScore in [0, 1] where 1 = certain AI. */
  score(text: string, opts?: { signal?: AbortSignal }): Promise<number | null>;
  /** Adapter name for logging. */
  readonly name: string;
}

/** LRT-based detector using the existing LLM router. Default. */
export function createLrtDetector(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): AiDetectorAdapter;

/** Stub adapter — always returns null. Used when feature flag is off. */
export const noopDetector: AiDetectorAdapter;
```

**LRT Implementation:**
LRT (Likelihood-Ratio Test) computes the ratio of how likely the text is under "natural human prose" vs "AI assistant prose". We approximate this by asking the LLM to score the text under two contrasting personas:

```typescript
async function score(text: string): Promise<number> {
  const sample = text.slice(0, 3000); // truncate for cost
  const prompts = [
    { role: 'natural', prompt: 'Rate how likely this Vietnamese prose is from a human writer (0..1). Reply ONLY with a JSON: {"score": 0.X}' },
    { role: 'ai', prompt: 'Rate how likely this Vietnamese prose is from an AI assistant (0..1). Reply ONLY with a JSON: {"score": 0.X}' },
  ];
  const [naturalScore, aiScore] = await Promise.all([
    callForScore(sample, prompts[0]),
    callForScore(sample, prompts[1]),
  ]);
  // Normalize: aiScore wins if it is meaningfully higher
  if (naturalScore + aiScore === 0) return 0.5;
  return aiScore / (naturalScore + aiScore);
}
```

Note: LRT is **noisy** by nature. We use it as a soft signal, not absolute truth. Threshold 0.7 chosen conservatively to avoid unnecessary repairs.

**Wire into pipeline:**

```typescript
if (FEATURES.humanizationRules) {
  // Sentence variance check (always-on, no extra LLM call)
  const varianceMetrics = analyzeSentenceVariance(chapterText);
  if (varianceMetrics.needsRepair) {
    const repaired = await callLLM(
      buildChapterDraftSystemPrompt(...),
      buildVarianceRepairInstruction(varianceMetrics) + '\n\n' + chapterText,
      ...
    );
    // accept if cv improves
  }
}

if (FEATURES.humanizationDetector) {
  const aiScore = await Promise.race([
    aiDetector.score(chapterText),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (aiScore !== null && aiScore > 0.7) {
    const humanized = await callLLM(
      buildChapterDraftSystemPrompt(...),
      buildHumanizationRepairInstruction() + '\n\n' + chapterText,
      ...
    );
    // accept if new score < old score
  }
}
```

**Punctuation rhythm + register switching:** added to `buildChapterDraftUserPrompt` only when `outputLanguage === 'vietnamese'` to avoid bloating English prompts:

```typescript
outputLanguage === 'vietnamese' ? `
PUNCTUATION RHYTHM RULES:
- Use sentence fragments. Like this. Often. 5-15% should be fragments.
- Mix em-dash, semicolon, comma, period — vary across paragraphs.
- Do NOT use em-dash in every paragraph; this is an AI default.

REGISTER SWITCHING RULES:
- Mix formal narration with casual interior monologue within the same chapter.
- Dialogue: characters use slang/abbreviations sometimes.
- Leave 1-2 sentences slightly awkward, rough, or repetitive on purpose for human texture.
` : ''
```

**Tests:**
- Unit: synthetic AI text (cv 0.4, em-dash heavy) → variance flagged
- Unit: synthetic human text (cv 0.85, mixed punct) → variance passes
- Property: LRT noop adapter always returns null without throwing
- Property: LRT actual adapter handles malformed LLM JSON without crashing (returns 0.5)
- Integration: full chapter with both checks running, no exception thrown when both flags off

## Data Models

### PhraseReuseIndex (in-memory)
```typescript
type PhraseReuseIndex = {
  trigramOccurrences: Map<string, Set<number>>;
  indexedChapters: Set<number>;
};
```
Lifetime: created at start of chapter loop, discarded when SSE stream ends.

### SpeechPattern (Zod-validated)
```typescript
type SpeechPattern = {
  fillers: string[];           // 2-5 items
  syntaxQuirk: string;
  vocabularyBand: 'formal' | 'neutral' | 'casual' | 'crude';
  avoidedPhrases: string[];    // 1-5 items
};
```

### Extended ContinuityLite
```typescript
type ContinuityLite = {
  // ... existing fields
  speechPatterns?: Record<string, SpeechPattern>;
};
```

### Extended Violation type
```typescript
type Violation = {
  type: 'name' | 'personality' | 'relationship' | 'social_position'
      | 'emotional_continuity' | 'speech_idiolect';
  severity: 'critical' | 'warning';
  description: string;
};
```

### Extended chapter SSE event meta
```typescript
{
  // existing fields...
  phraseReuseScore?: number;     // 0..1, present when ≥ 0.10
  topRepeatedPhrases?: string[];  // when above threshold
  idiolectWarnings?: number;      // count of speech_idiolect violations
  lowSentenceVariance?: boolean;  // when cv < 0.55
  sentenceCv?: number;            // raw cv value
  aiScoreEstimate?: number | null; // detector output, null on failure
  humanizationRepaired?: boolean; // true if W7 repair fired
}
```

## Error Handling

### Phrase-reuse repair fails
Log warning with reuseScore before/after. Keep original chapter. Do NOT fail the SSE stream.

### Idiolect repair fails
Log warning. Keep chapter as-is. Do NOT block downstream.

### Detector throws / times out
`aiScoreEstimate: null` in meta. Continue. The detector is informational; pipeline does not depend on it.

### Variance repair fails
Log warning. Keep chapter. cv stays as-is in meta.

All Wave 5-7 repairs are SOFT. They never raise to a degree that aborts the story. Hard failures are reserved for upstream LLM outage (handled by circuit breaker in Wave 2) and chapter generation total failure (existing).

## Testing Strategy

### Unit tests
- Phrase-reuse: tokenization, trigram extraction, stop-word filtering, score computation
- Idiolect: speech pattern Zod validation, mismatch detection
- Variance: sentence segmentation, cv computation, repair instruction generation
- LRT detector: response parsing, error handling, abort signal handling

### Property tests (fast-check, 100 runs each)
- Phrase-reuse: tokenization stable across whitespace/case variations
- Phrase-reuse: reuseScore symmetric (text A vs B = text B vs A within ±5%)
- Idiolect: any avoidedPhrase guaranteed to be detected when present in dialogue
- Variance: cv computation handles 0-sentence, 1-sentence, equal-length cases without NaN

### Integration tests
- Full chapter loop with all 3 waves enabled (mocked LLM)
- Chapter where reuseScore = 0.20 → repair triggered, score reduces
- Chapter with 3 idiolect violations → repair pass triggered
- Detector returning 0.85 → humanization repair triggered

### Benchmark suite (Requirement 4)
- 10 random stories across 3 niches
- Each metric computed deterministically
- CI-fail if any metric < 0.85

## Rollout Plan

1. Wave 5 ships first (lowest risk, no LLM cost): tracker + repair, feature flag default ON.
2. Wave 6 ships second (moderate risk, schema extension): bible + continuity + validator + optional repair, feature flag default ON.
3. Wave 7 ships third (highest risk, LLM cost): rules go live first (zero-cost), detector ships behind flag default OFF until empirical tuning shows it improves scores without doubling latency.
4. Benchmark suite ships last as the validation harness.
