# Requirements Document

## Introduction

Tăng điểm benchmark hệ thống sáng tác từ 7/10 lên ≥ 8.5/10 trên cả 4 tiêu chí (Consistency / Đa dạng / Văn phong người thật / Kiến trúc). Wave 1-4 (persist pending stories, circuit breaker, Vietnamese AI tells, streaming partial chapter) đã được implement trực tiếp. Wave 5-7 (Phrase-Reuse Tracker, Idiolect-Per-Character, Humanization Wave) phức tạp hơn về thiết kế và phụ thuộc lẫn nhau, nên cần spec chính thức.

This document covers the **Humanization & Resilience Upgrades (Wave 5-7)** spec.

Mục tiêu cuối: output truyện qua AI detector (Binoculars hoặc tương đương) đạt aiScore < 0.4, không lặp cụm từ chéo chương quá 10%, mỗi nhân vật chính có giọng riêng nhận diện được mà không cần dialogue tag.

## Requirements

### Requirement 1: Phrase-Reuse Tracker (Cross-Chapter)

**User Story:** As a story author, I want the system to detect and discourage cross-chapter phrase repetition, so that the LLM does not lazily reuse the same metaphors across the 10-chapter arc.

#### Acceptance Criteria

1.1. Hệ thống SHALL maintain a per-story `PhraseReuseIndex` that tracks 3-word n-grams (trigrams) across all completed chapters.

1.2. WHEN a chapter draft is finalized, THEN the system SHALL index its trigrams and persist them in the index for the lifetime of the story job.

1.3. Tokenization SHALL normalize text by lowercasing, stripping punctuation, and collapsing whitespace. Diacritics SHALL be preserved (Vietnamese needs them).

1.4. WHEN a new chapter draft passes quality + drift validation, THEN the system SHALL compute `reuseScore` = (count of trigrams that already appeared ≥2 times in chapters 1..N-1) / (total trigrams in chapter N).

1.5. IF `reuseScore` > 0.15, THEN the system SHALL trigger ONE phrase-reuse repair pass naming the top 5-10 most-repeated phrases. The repair prompt SHALL instruct the LLM to reword these specific phrases without changing plot facts.

1.6. The phrase-reuse repair SHALL be a single-shot pass — no loop. If it does not reduce the score, log a warning and accept the chapter.

1.7. The system SHALL include `phraseReuseScore` and `topRepeatedPhrases` in the `chapter` SSE event meta when reuseScore > 0.10 (informational below the trigger threshold).

1.8. The tracker SHALL handle empty-text and single-chapter cases without throwing (no chapters before chapter 1, etc.).

1.9. Trigram extraction SHALL skip stop-word-only trigrams ("trong khi đó", "và sau đó", "lúc này thì") to avoid false positives on common Vietnamese connectors.

### Requirement 2: Idiolect Per Character

**User Story:** As a reader, I want each major character (heroine, betrayer, rival) to have a recognizable speech voice, so that I can identify who is speaking from dialogue alone without dialogue tags.

#### Acceptance Criteria

2.1. The Story Bible prompt SHALL instruct the LLM to define a `SpeechPattern` for heroine, betrayer, and rival containing: 2-3 fillers/verbal tics, 1 syntax quirk, vocabularyBand (formal/neutral/casual/crude), 1 phrase the character would never say.

2.2. The `SpeechPattern` SHALL be persisted in the parsed Story Bible JSON under each character (e.g., `bible.heroine.speechPattern`).

2.3. The `ContinuityLite` block SHALL include `speechPatterns: { [characterName]: SpeechPattern }` so it is injected into every chapter prompt.

2.4. Chapter draft prompt SHALL include explicit instruction "Honor each character's speechPattern in dialogue. Their fillers, quirks, and vocabularyBand are NON-NEGOTIABLE."

2.5. The Consistency Validator SHALL be extended with a 6th check: idiolect drift. Given a chapter and the speechPatterns map, the validator SHALL flag dialogue lines where:
- a character uses a phrase from their `avoidedPhrases` list, OR
- a character's vocabularyBand is grossly violated (e.g., "crude" character speaking "formal" register).

2.6. Idiolect violations SHALL be classified as `warning` severity (not critical) so they trigger soft repair, not hard repair.

2.7. The `validateCharacterFactSheet` Zod schema SHALL be extended to optionally include `speechPattern: SpeechPatternSchema`. Backwards compatibility: existing fact sheets without speechPattern remain valid.

2.8. WHEN a chapter has ≥2 idiolect warnings AND no critical drift violations, THEN the system SHALL trigger one targeted repair pass naming the specific lines and characters that drift.

2.9. Property test SHALL verify: any `SpeechPattern` with non-empty `avoidedPhrases` causes detection if those phrases appear in dialogue attributed to that character.

### Requirement 3: Humanization Wave (Sentence Variance + Punctuation Rhythm + Register Switching + Detector)

**User Story:** As a story author, I want generated chapters to pass automated AI detectors at "uncertain" or below, so that the output is publishable on platforms that filter AI content.

#### Acceptance Criteria

3.1. The system SHALL compute the coefficient of variation of sentence lengths (`cv = stdev(sentenceLengths) / mean(sentenceLengths)`) for every finalized chapter.

3.2. IF `cv < 0.55`, THEN the chapter SHALL be flagged with `lowSentenceVariance: true` in chapter SSE meta and a single soft repair SHALL be triggered with prompt: "Vary sentence length more aggressively. Mix 3-word fragments with 25+ word complex sentences. Aim for cv > 0.65."

3.3. Chapter draft prompts SHALL include punctuation rhythm rules:
   - "Use sentence fragments. Like this. Often. 5-15% of sentences should be fragments."
   - "Mix em-dash, semicolon, comma, period — vary across paragraphs."
   - "Avoid em-dash in every paragraph. Default-Western-AI overuse pattern."

3.4. Chapter draft prompts SHALL include register switching rules:
   - "Within a chapter, mix formal narration with casual interior monologue."
   - "Dialogue should drift register: characters use slang/abbreviations sometimes."
   - "Leave 1-2 sentences slightly awkward, rough, or repetitive on purpose."

3.5. The system SHALL integrate an AI detector behind a feature flag `FEATURE_AI_DETECTOR=true`. The default detector SHALL be a local likelihood-ratio test (LRT) implementation that requires no external API. An optional adapter SHALL allow plugging in Binoculars (local Python sidecar) or GPTZero (HTTP API) when the flag selects that backend.

3.6. The LRT detector SHALL use two perplexity samples from the same LLM with contrasting system prompts (one "Write naturally", one "Write like an AI assistant") to estimate the AI score in range [0, 1]. Implementation note: this requires only the existing LLM router and adds 2 calls per chapter.

3.7. WHEN `aiScore > 0.7`, THEN the system SHALL trigger ONE humanization repair pass with prompt: "This text scored as AI-written by detector. Rewrite WITH: more irregular sentence lengths, 2-3 deliberate awkward phrasings, casual register drift, no banned tells (en + vi). Keep facts identical."

3.8. The system SHALL emit `aiScoreEstimate` in chapter SSE meta whenever the detector ran, regardless of trigger threshold.

3.9. The detector adapter SHALL fail open: if the detector throws or times out (5s), the chapter SHALL still be sent to the client with `aiScoreEstimate: null`. The pipeline does not block on detector failures.

3.10. The humanization repair SHALL respect existing facts (character names, plot beats, ending mode) — verified by re-running consistency validator after repair.

### Requirement 4: Benchmark Re-Score

**User Story:** As a project owner, I want measurable proof that scores improved, so that the upgrade investment is justified.

#### Acceptance Criteria

4.1. The repository SHALL include a `benchmark/` script that generates 10 stories with random seeds across 3 niches, scores each on 4 metrics (consistency, diversity, human-voice, architecture), and reports averages.

4.2. The benchmark SHALL be runnable via `npm run benchmark` from the API package.

4.3. Each metric SHALL have a deterministic computation (not human judgment):
- **Consistency**: % chapters with 0 critical drift violations
- **Diversity**: 1 - (Jaccard similarity of trigrams between any 2 stories of same niche)
- **Human voice**: 1 - (mean aiScore across all chapters, when detector enabled)
- **Architecture**: % chapters that pass all schema validations on first try (no fallback parser hit)

4.4. The benchmark SHALL fail (exit non-zero) if any metric drops below 0.85 to prevent regression in CI.

4.5. After Wave 5-7 ship, running the benchmark suite SHALL produce ≥ 0.85 on all 4 metrics on the current LLM router config.

## Non-Functional Requirements

### Performance

NF1. Wave 5 (phrase-reuse tracker): chapter overhead < 200ms (in-process trigram indexing).

NF2. Wave 6 (idiolect): adds at most 1 LLM call per chapter (the targeted repair when ≥2 warnings). No mandatory call per chapter.

NF3. Wave 7 (LRT detector): adds at most 2 LLM calls per chapter. Skip for chapters that streamed > 4500 words to avoid context-length issues.

NF4. End-to-end: a 10-chapter story SHALL not exceed 1.5x the latency of the current pipeline. Current ~30 minutes per story → upgraded ≤ 45 minutes worst-case.

### Backwards Compatibility

NF5. All new SSE event meta fields (phraseReuseScore, lowSentenceVariance, aiScoreEstimate, idiolectWarnings, etc.) SHALL be optional. Web client written before this wave SHALL continue to work without UI changes.

NF6. Existing tests (currently 105) SHALL continue to pass without modification.

NF7. The `SpeechPattern` extension to `CharacterFact` SHALL be optional. Stories generated before Wave 6 ship SHALL load and render correctly when their fact sheets lack speechPattern.

### Feature Flags

NF8. Each wave SHALL be gated by an env flag for safe rollout:
- `FEATURE_PHRASE_REUSE_TRACKER` (default: true after Wave 5 ships)
- `FEATURE_IDIOLECT` (default: true after Wave 6 ships)
- `FEATURE_HUMANIZATION_DETECTOR` (default: false initially; enable after empirical tuning)
- `FEATURE_HUMANIZATION_RULES` (default: true after Wave 7 ships — these are prompt-only and zero-cost)

### Observability

NF9. Each repair pass SHALL log: the trigger condition, the score before/after, and whether it improved. Logs go through `request.log` so they appear in pino output with `reqId`.

NF10. Chapter SSE events SHALL carry all repair flags as meta keys so a frontend can later display per-chapter quality breakdowns without re-running validation.

## Out of Scope

- A graphical "quality dashboard" UI showing scores over time (separate spec).
- Multi-language support beyond Vietnamese for AI-tell detection (English handled by existing prompt rules).
- Auto-tuning of LLM model selection based on detector scores (separate research spike).
- Persisting `PhraseReuseIndex` across server restarts (in-memory per story-job is sufficient for MVP).

## Glossary

- **Trigram**: a contiguous sequence of 3 word tokens. Used by Wave 5 to detect cross-chapter reuse.
- **Reuse score**: ratio of trigrams in the current chapter that already appeared in ≥2 prior chapters. Threshold 0.15 triggers repair.
- **Idiolect**: the speech voice unique to a character — fillers, syntax habits, vocabulary register, avoided phrases. Wave 6 enforces this.
- **Speech pattern**: the structured form of an idiolect. 4 fields: fillers, syntaxQuirk, vocabularyBand, avoidedPhrases.
- **Vocabulary band**: one of `formal | neutral | casual | crude` describing a character's default register.
- **CV (coefficient of variation)**: standard deviation divided by mean. For sentence lengths, used as a humanness proxy. Human writers ≥ 0.65; AI writers ≤ 0.50.
- **LRT (Likelihood Ratio Test)**: a 2-call detector method that asks the LLM to score the same text under "human writer" vs "AI assistant" personas, then normalizes the ratio to a [0, 1] AI score.
- **Soft repair**: a single-shot LLM call that re-writes the chapter to fix a specific issue. Does not loop; if it does not improve, the original is kept.
- **Critical drift**: violations that contradict the Story Bible's locked facts (names, ending mode, betrayal engine). Always trigger hard repair.
- **Warning drift**: violations that drift from secondary continuity (idiolect, emotional rhythm). Trigger soft repair.

## Dependencies

- Wave 5-7 build on top of Wave 1-4 (already shipped). No external service dependencies for LRT detector.
- Optional Binoculars sidecar requires Python 3.10+ runtime, not in scope for MVP.
