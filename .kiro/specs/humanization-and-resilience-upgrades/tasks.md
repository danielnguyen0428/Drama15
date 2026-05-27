# Implementation Plan: Humanization & Resilience Upgrades (Wave 5-7)

## Overview

3 phụ wave, mỗi cái tăng điểm benchmark theo tiêu chí khác nhau:
- **Wave 5** (Phrase-Reuse Tracker): +0.5 Consistency, +0.5 Đa dạng, +0.5 Văn phong
- **Wave 6** (Idiolect Per Character): +0.7 Consistency, +0.5 Đa dạng, +0.5 Văn phong
- **Wave 7** (Humanization Wave): +0.5 Đa dạng, +2.5 Văn phong

Wave 1-4 đã ship trực tiếp (không qua spec này). Sau khi hoàn thành Wave 5-7, cả 4 tiêu chí phải đạt ≥ 8.5/10 (verified bằng benchmark suite ở Task 11).

## Tasks

- [x] 1. Wave 5 — Phrase-Reuse Tracker
  - [x] 1.1 Implement `phraseReuseTracker.ts` core logic
    - Tạo file `apps/api/src/stories/phraseReuseTracker.ts`
    - Implement types: `PhraseReuseIndex`, `PhraseReuseReport`
    - Implement functions: `createPhraseReuseIndex()`, `indexChapter()`, `scoreCandidate()`, `buildReuseRepairInstruction()`
    - Tokenization: lowercase via `toLocaleLowerCase('vi')`, strip punctuation preserving diacritics, collapse whitespace
    - Trigram = 3 consecutive tokens joined with space
    - Co-locate Vietnamese stop-word trigram filter (30-50 connector phrases)
    - Score formula: reused-trigrams / total-trigrams; threshold 0.15 triggers repair
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9_

  - [x] 1.2 Write property tests for phrase-reuse tracker
    - **Property: tokenization stable across whitespace/case variations**
    - **Property: reuseScore symmetric (text A scored against B ≈ B scored against A within ±5%)**
    - **Property: stop-word-only trigrams excluded from index**
    - Tạo file `apps/api/src/stories/phraseReuseTracker.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - Synthetic test: feed chapter B with 30% of chapter A's trigrams → score ≥ 0.20
    - _Validates: Requirements 1.3, 1.4, 1.9_

  - [x] 1.3 Wire tracker into chapter loop with feature flag
    - Modify `startDev.ts` chapter generation loop
    - Create `phraseReuseIndex` once per stream handler (per story job)
    - After consistency validation passes, call `scoreCandidate()` if `FEATURE_PHRASE_REUSE_TRACKER=true`
    - If `report.needsRepair === true`, call LLM once with `buildReuseRepairInstruction()` + chapterText
    - Accept repaired text only if new reuseScore < original (no regression)
    - After accept/reject, call `indexChapter()` so this chapter feeds into next iteration
    - Always emit `phraseReuseScore` in chapter SSE meta when score ≥ 0.10
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 1.4 Write integration tests for phrase-reuse repair flow
    - Test: chapter with 25% reuseScore triggers repair
    - Test: repair LLM call uses top 5-10 phrases in prompt
    - Test: if repair makes score worse, original chapter is kept
    - Test: meta.phraseReuseScore always present when threshold reached
    - _Requirements: 1.5, 1.6, 1.7_

- [x] 2. Checkpoint — Wave 5 tests pass
  - All Wave 5 tests pass; ensure existing 105 tests still pass.

- [x] 3. Wave 6 — Idiolect Per Character
  - [x] 3.1 Extend Zod schemas with SpeechPattern
    - Modify `apps/api/src/stories/desktopParity.ts`
    - Add `SpeechPatternSchema` (fillers 2-5, syntaxQuirk, vocabularyBand enum, avoidedPhrases 1-5)
    - Extend `StoryBibleCharacterSchema` heroine + extend betrayer, rival shapes with optional `speechPattern`
    - Update tolerant `parseStoryBible` to coerce speechPattern fields with defaults when LLM omits them
    - Update existing tests to verify backwards compatibility (bibles without speechPattern still parse)
    - _Requirements: 2.1, 2.2, 2.7, NF7_

  - [x] 3.2 Update Story Bible prompt with speechPattern instructions
    - Modify `storyEngine.ts → buildStoryBibleUserPrompt`
    - Add instruction block: each major character must have speechPattern with concrete fillers/quirk/band/avoided
    - Stress: heroine, betrayer, rival MUST differ in fillers AND vocabularyBand
    - Add 1 example block in the prompt to anchor LLM output format
    - _Requirements: 2.1_

  - [x] 3.3 Extend ContinuityLite with speechPatterns
    - Modify `storyEngine.ts → ContinuityLite` interface and `buildContinuityLiteFromBible`
    - Add optional `speechPatterns?: Record<string, SpeechPattern>` keyed by character name
    - Populate from parsed bible (heroine, betrayer, rival)
    - Update `renderContinuityLiteForPrompt` to include speechPatterns in the LOCK block
    - _Requirements: 2.3, 2.4_

  - [x] 3.4 Extend Consistency Validator with speech_idiolect category
    - Modify `apps/api/src/stories/consistencyValidator.ts`
    - Add `speech_idiolect` to `ViolationType` union
    - Update `buildValidationSystemPrompt()` to enumerate the 6th category with explicit instructions
    - Update `buildValidationUserPrompt()` to include speechPatterns from continuityLite
    - `classifyViolationSeverity()` always returns `warning` for speech_idiolect (never critical)
    - _Requirements: 2.5, 2.6_

  - [x] 3.5 Write property tests for idiolect validation
    - **Property: SpeechPattern with valid shape always passes Zod schema**
    - **Property: dialogue containing avoidedPhrase from character's pattern triggers detection**
    - **Property: speech_idiolect violations never get severity 'critical'**
    - Tạo file `apps/api/src/stories/idiolect.property.test.ts`
    - Synthetic: chapter with 3 mismatched dialogue lines → validator flags ≥ 3 warnings
    - _Validates: Requirements 2.5, 2.6, 2.9_

  - [x] 3.6 Implement idiolect repair pass
    - Modify `startDev.ts` chapter loop
    - After drift repair loop, count idiolect warnings in driftReport
    - If `idiolectWarnings ≥ 2 && !hasCriticalViolations(driftReport)`, run single repair LLM call
    - Repair prompt: "Character X has these speech patterns [...]. Rewrite the flagged dialogue lines to match. Keep all plot facts."
    - Re-run validator only if repair was attempted; accept only if warnings reduce
    - Emit `idiolectWarnings: count` in chapter SSE meta
    - _Requirements: 2.8_

- [x] 4. Checkpoint — Wave 6 tests pass
  - All Wave 6 tests pass; existing tests still pass.

- [x] 5. Wave 7 — Humanization Wave
  - [x] 5.1 Implement sentenceVarianceAnalyzer.ts
    - Tạo file `apps/api/src/stories/sentenceVarianceAnalyzer.ts`
    - Implement `analyzeSentenceVariance(text)` returning `{ sentenceCount, meanLengthWords, stdevLengthWords, cv, fragmentRatio, needsRepair }`
    - Sentence segmentation: regex split on `[.!?…]\s+`
    - cv = stdev / mean; needsRepair = cv < 0.55
    - Implement `buildVarianceRepairInstruction(metrics)` with prompt: "Vary sentence length more aggressively..."
    - Handle edge cases: 0 sentences, 1 sentence, all-equal lengths (no NaN)
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Write tests for sentenceVarianceAnalyzer
    - Unit: synthetic AI-style text (cv 0.4) → needsRepair true
    - Unit: synthetic human text (cv 0.85) → needsRepair false
    - Property: cv computation never returns NaN for valid input
    - Property: empty input returns sensible zeroed metrics
    - _Validates: Requirements 3.1, 3.2_

  - [x] 5.3 Add punctuation rhythm + register switching prompt rules
    - Modify `storyEngine.ts → buildChapterDraftUserPrompt`
    - When `outputLanguage === 'vietnamese'`, append punctuation rhythm block (fragments, em-dash variation, semicolon mix)
    - Append register switching block (formal/casual mix, deliberate awkwardness)
    - Verify with prompt-snapshot test that the blocks are present
    - _Requirements: 3.3, 3.4_

  - [x] 5.4 Implement aiDetector.ts with LRT adapter
    - Tạo file `apps/api/src/stories/aiDetector.ts`
    - Implement `AiDetectorAdapter` interface, `noopDetector`, `createLrtDetector(opts)`
    - LRT: 2 LLM calls with contrasting personas (natural vs AI-assistant), parse JSON score, normalize to [0,1]
    - Truncate input to 3000 chars before sending
    - Handle malformed LLM JSON: return 0.5 instead of crashing
    - Respect AbortSignal for cancellation
    - _Requirements: 3.5, 3.6, 3.9_

  - [x] 5.5 Write tests for aiDetector
    - Unit: noop adapter returns null
    - Unit: LRT with mocked LLM returning malformed JSON returns 0.5 (no crash)
    - Unit: LRT respects 5s timeout (Promise.race in caller)
    - Property: 100 random texts produce a number in [0,1] or null, never NaN/Infinity
    - _Validates: Requirements 3.5, 3.6, 3.9_

  - [x] 5.6 Wire variance + detector + humanization repair into chapter loop
    - Modify `startDev.ts` chapter loop
    - After idiolect repair, run `analyzeSentenceVariance(chapterText)`
    - If `needsRepair`, single soft repair LLM call; accept if cv improves
    - If `FEATURE_HUMANIZATION_DETECTOR=true`, call detector with 5s timeout (race against `setTimeout(() => null, 5000)`)
    - If `aiScore > 0.7`, single humanization repair LLM call; accept if new score < old AND consistency validator still passes
    - Emit `lowSentenceVariance`, `sentenceCv`, `aiScoreEstimate`, `humanizationRepaired` in chapter SSE meta
    - _Requirements: 3.2, 3.7, 3.8, 3.9, 3.10_

  - [x] 5.7 Verify backwards compatibility with feature flags off
    - Test: with all Wave 7 flags off, pipeline produces same output as before Wave 7
    - Test: chapter SSE meta lacks Wave-7 fields when flags off
    - _Validates: Requirements NF5, NF6, NF8_

- [x] 6. Checkpoint — Wave 7 tests pass
  - All Wave 7 tests pass; existing tests still pass.

- [x] 7. Integration — End-to-end test with all 3 waves on
  - [x] 7.1 Mock-LLM integration test
    - Tạo file `apps/api/src/stories/humanization.integration.test.ts`
    - Mock LLM responses for: bible (with speechPatterns), 10 chapters, validator, repairs
    - Verify: pipeline runs to completion, all 3 waves emit their meta fields, no exception
    - _Requirements: 1.5, 2.8, 3.7_

- [x] 8. Benchmark suite
  - [x] 8.1 Create benchmark script
    - Tạo file `apps/api/scripts/benchmark.ts`
    - Generate 10 stories with random seeds across 3 niches (billionaire, humiliation_revenge, secret_identity)
    - For each story: extract metrics from chapter SSE meta accumulated during stream
    - Compute 4 aggregate scores deterministically:
      * Consistency = % chapters with 0 critical drift violations (no consistencyWarning)
      * Diversity = 1 - mean(Jaccard trigram similarity between any 2 stories of same niche)
      * Human voice = 1 - mean(aiScoreEstimate) across all chapters where score is non-null
      * Architecture = % chapters that hit no parser fallback (parseChapterDraft returned non-null first try)
    - Print per-metric scores + pass/fail at 0.85 threshold
    - Exit code 1 if any metric < 0.85; 0 otherwise
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 8.2 Add npm script
    - Modify `apps/api/package.json` to add `"benchmark": "tsx scripts/benchmark.ts"`
    - Document benchmark usage in `apps/api/README.md`
    - _Requirements: 4.2_

  - [x] 8.3 Run benchmark and verify acceptance
    - Execute `npm run benchmark` against running dev server
    - Capture output as `benchmark/baseline-after-wave7.json`
    - Verify all 4 metrics ≥ 0.85
    - If any metric below threshold, iterate on prompts / thresholds before declaring done
    - _Requirements: 4.5_

- [x] 9. Final checkpoint — All tests pass + benchmark green
  - 105 (existing) + new tests all pass; benchmark on real LLM router shows ≥ 0.85 on all 4 metrics.

## Notes

- Mỗi wave một feature flag riêng (`FEATURE_PHRASE_REUSE_TRACKER`, `FEATURE_IDIOLECT`, `FEATURE_HUMANIZATION_RULES`, `FEATURE_HUMANIZATION_DETECTOR`) để có thể tắt từng cái nếu phá pipeline.
- Wave 5 và Wave 6 mỗi cái có thể trigger 1 LLM call extra/chương → tổng tăng ~2 calls/chương. Wave 7 detector tăng 2 calls/chương khi flag on. Worst case 1 chương = 8 calls (vs current 6 calls). Tổng latency ~+30%.
- Detector LRT là noisy. Nếu sau Wave 7 ship mà score không cải thiện rõ, có thể swap qua Binoculars sidecar (Python) ở wave sau.
- Benchmark suite đóng vai trò regression guard: nếu sau wave nào đó điểm tụt, CI fail và phải fix trước khi merge.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 5, "tasks": ["3.5", "3.6"] },
    { "id": 6, "tasks": ["5.1", "5.4"] },
    { "id": 7, "tasks": ["5.2", "5.3", "5.5"] },
    { "id": 8, "tasks": ["5.6", "5.7"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["8.3"] }
  ]
}
```
