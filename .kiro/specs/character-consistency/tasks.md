# Implementation Plan: Character Consistency

## Overview

Triển khai hệ thống Character Consistency cho pipeline Drama15, bao gồm 5 module mới: Character Fact Sheet Extractor, Character Memory Store, Consistency Validator, Character Summary Generator, và Style Resolver. Các module được tích hợp vào pipeline hiện có và mở rộng Repair Loop để xử lý character drift.

## Tasks

- [x] 1. Tạo Character Memory Store module
  - [x] 1.1 Implement `characterMemoryStore.ts` với interfaces và core functions
    - Tạo file `apps/api/src/stories/characterMemoryStore.ts`
    - Implement interfaces: `CharacterMemoryStore`, `CharacterFact`, `CharacterFactSheet`
    - Implement functions: `createEmptyMemoryStore()`, `addFactSheet()`, `queryByCharacter()`, `serializeMemoryStore()`, `deserializeMemoryStore()`, `memoryStoreToPromptContext()`
    - Sử dụng `Map<number, CharacterFactSheet>` indexed by chapter number
    - Serialization format phải bao gồm `version: 1` field
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.2 Write property tests for Character Memory Store (Properties 2, 3, 4)
    - **Property 2: Character_Memory_Store accumulation preserves all entries**
    - **Property 3: Character_Memory_Store character query returns correct subset**
    - **Property 4: Character_Memory_Store serialization round-trip**
    - Tạo file `apps/api/src/stories/characterMemoryStore.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 2.1, 2.3, 2.5, 2.6**

- [x] 2. Implement Character Fact Sheet Extractor
  - [x] 2.1 Implement fact extraction interfaces, schema validation, và prompt builders
    - Thêm exports vào `apps/api/src/storyEngine.ts`: interfaces `CharacterFact`, `CharacterFactSheet`, `FactSheetExtractionOptions`
    - Implement `validateCharacterFactSheet()` — JSON schema validation cho required fields
    - Implement `buildFactExtractionSystemPrompt(storyBible)` — phải include Story_Bible content
    - Implement `buildFactExtractionUserPrompt(opts)` — instruct LLM output strict JSON, distinguish explicit vs inferred facts
    - Implement `extractCharacterNamesFallback(chapterText)` — regex-based fallback
    - Constants: `TEMPERATURE_FACT_EXTRACTION = 0.2`, `TEMPERATURE_FACT_EXTRACTION_RETRY = 0.1`
    - Extraction prompt phải instruct output language matching chapter text language
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 2.2 Write property tests for Character Fact Sheet (Properties 1, 13)
    - **Property 1: Character_Fact_Sheet schema validation**
    - **Property 13: Extraction prompt includes Story_Bible context**
    - Tạo file `apps/api/src/stories/characterFactSheet.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 1.2, 1.4, 7.2**

  - [x] 2.3 Write unit tests for extraction retry and fallback logic
    - Test: invalid JSON triggers retry with temperature 0.1
    - Test: second failure produces fallback entry with regex-extracted names
    - Test: empty chapter produces empty CharacterFactSheet with warning log
    - Test: temperature constants are correct values
    - _Requirements: 1.3, 1.5, 7.3_

- [x] 3. Implement Consistency Validator
  - [x] 3.1 Implement `consistencyValidator.ts` với interfaces và core functions
    - Tạo file `apps/api/src/stories/consistencyValidator.ts`
    - Implement types: `ViolationType`, `ViolationSeverity`, `Violation`, `DriftReport`
    - Implement `buildValidationSystemPrompt()` — enumerate categories: name, personality, relationship, social position, emotional continuity
    - Implement `buildValidationUserPrompt(opts)` — include chapterText, storyBible, memoryStoreContext
    - Implement `parseDriftReport(llmOutput, chapterNumber)` — parse JSON, handle invalid JSON as empty report
    - Implement `classifyViolationSeverity()` — critical if contradicts Story_Bible core facts, warning if contradicts Memory_Store
    - Implement `hasCriticalViolations(report)` — check for at least one critical violation
    - Implement `createEmptyDriftReport(chapterNumber)` — valid DriftReport with empty violations array
    - Constant: `TEMPERATURE_VALIDATION = 0.1`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 3.2 Write property tests for Consistency Validator (Properties 5, 6, 7, 14)
    - **Property 5: Drift_Report structure completeness**
    - **Property 6: Violation severity classification correctness**
    - **Property 7: Repair trigger on critical violations**
    - **Property 14: Empty Drift_Report validity**
    - Tạo file `apps/api/src/stories/consistencyValidator.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 3.3, 3.4, 3.5, 8.5**

- [x] 4. Implement Character Summary Generator
  - [x] 4.1 Implement `characterSummary.ts` với interfaces và core functions
    - Tạo file `apps/api/src/stories/characterSummary.ts`
    - Implement interfaces: `CharacterSummaryEntry`, `CharacterSummary`
    - Implement `buildCharacterSummarySystemPrompt()` — instruct LLM to organize by character
    - Implement `buildCharacterSummaryUserPrompt(opts)` — include chapterText, storyBible
    - Implement `validateCharacterSummary(data)` — validate structure and word count bounds (300-800)
    - Implement `characterSummaryToString(summary)` — convert to string for `previousSummaries` array
    - Constants: `CHARACTER_SUMMARY_MIN_WORDS = 300`, `CHARACTER_SUMMARY_MAX_WORDS = 800`, `MAX_PRIMARY_CHARACTERS = 5`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Write property tests for Character Summary (Properties 8, 9, 10)
    - **Property 8: Character_Summary schema completeness**
    - **Property 9: Character_Summary word count bounds**
    - **Property 10: Character_Summary prioritization**
    - Tạo file `apps/api/src/stories/characterSummary.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 4.2, 4.4, 4.5**

- [x] 5. Implement Style Resolver
  - [x] 5.1 Implement `styleResolver.ts` với interfaces và core functions
    - Tạo file `apps/api/src/stories/styleResolver.ts`
    - Implement types: `StyleMode`, `StyleResolution`, `StoryStyleConfig`
    - Implement `resolveStyleMode(config)` — default to `'drama15_with_gu_man_overlay'` when undefined
    - Implement `buildStyleBlock(mode)` — produce single coherent style block with priority markers
    - Implement `resolveStyle(config)` — orchestrate mode resolution and block building
    - Implement `containsGuManContent(styleBlock)` — helper for testing mode correctness
    - Implement `containsDrama15StructuralOnly(styleBlock)` — helper for gu_man_only mode verification
    - Mode logic: `drama15_only` excludes Gu Man entirely; `gu_man_only` uses Gu Man as primary with Drama15 architecture-only; `drama15_with_gu_man_overlay` scopes Gu Man to dialogue/romance
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.2 Write property tests for Style Resolver (Property 11)
    - **Property 11: Style_Resolver mode-appropriate output**
    - Tạo file `apps/api/src/stories/styleResolver.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 6. Checkpoint - Ensure all module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extend Repair Loop for Character Drift
  - [x] 7.1 Implement `buildChapterRepairUserPromptWithDrift()` và `needsRepair()` trong `storyEngine.ts`
    - Thêm `MAX_CHAPTER_REPAIR_ATTEMPTS_WITH_DRIFT = 3` constant
    - Implement `buildChapterRepairUserPromptWithDrift(params)` — include both quality failures AND drift violations in single repair prompt
    - Implement `needsRepair(qualityMetrics, driftReport)` — returns true if quality failures OR critical violations exist
    - Repair prompt phải include specific correction instructions for each critical violation
    - Preserve existing quality check instructions (word count, dialogue ratio)
    - Temperature for repair: 0.28 (matching existing)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 7.2 Write property tests for Repair Loop (Property 12)
    - **Property 12: Repair_Loop combined failure handling**
    - Tạo file `apps/api/src/stories/characterRepairLoop.property.test.ts`
    - Sử dụng `fast-check` với `numRuns: 100`
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 7.3 Write unit tests for repair loop extensions
    - Test: max attempts = 3 when drift present
    - Test: graceful degradation after exhausted retries (log + consistencyWarning flag)
    - Test: repair temperature = 0.28
    - Test: combined prompt includes both quality and drift instructions
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 8. Integrate modules into pipeline flow
  - [x] 8.1 Wire Style Resolver into chapter draft generation
    - Modify `buildChapterDraftSystemPrompt()` hoặc caller to inject `StyleResolution.styleBlock` into system prompt
    - Use `resolveStyle(storyConfig)` before chapter generation
    - Ensure style block is injected as single coherent block with priority markers
    - _Requirements: 5.1, 5.5_

  - [x] 8.2 Wire Character Memory Store context into chapter draft prompt
    - Modify `buildChapterDraftUserPrompt()` to accept `memoryStoreContext` parameter
    - Call `memoryStoreToPromptContext(store)` and include in prompt
    - Pass full Character_Memory_Store (chapters 1 through N-1) as context
    - _Requirements: 2.2_

  - [x] 8.3 Wire Consistency Validator into post-generation flow
    - After `analyzeChapterQuality()` passes, call `ConsistencyValidator.validate()`
    - If `hasCriticalViolations(report)` is true, trigger Repair Loop with DriftReport
    - Use `buildChapterRepairUserPromptWithDrift()` for repair attempts
    - Implement max 3 retry logic when drift is present
    - On exhaustion: log unresolved violations, set `consistencyWarning: true` flag
    - _Requirements: 3.1, 3.5, 6.4, 6.5_

  - [x] 8.4 Wire Fact Sheet Extraction and Character Summary into post-validation flow
    - After validation passes (no critical violations), call `CharacterFactSheetExtractor.extract()`
    - Validate extracted fact sheet, retry once with lower temperature on failure
    - On second failure, use `extractCharacterNamesFallback()`
    - Add validated fact sheet to Character Memory Store via `addFactSheet()`
    - Call `CharacterSummaryGenerator.generate()` to produce Character_Summary
    - Replace existing `summarizeChapter()` output with `characterSummaryToString()` for `previousSummaries`
    - Fallback to existing `summarizeChapter()` if Character Summary LLM fails
    - _Requirements: 1.1, 1.4, 1.5, 4.3_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration tests
  - [x] 10.1 Write integration tests for full pipeline flow
    - Test: chapter generation → quality check → validation → extraction → memory store update
    - Test: multi-chapter generation with memory store accumulation
    - Test: repair loop with combined quality + drift failures
    - Mock LLM calls for extraction and validation prompts
    - Tạo file `apps/api/src/stories/characterConsistency.integration.test.ts`
    - _Requirements: 1.1, 2.2, 3.1, 3.5, 6.3_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All new files are created in `apps/api/src/stories/` directory
- Existing `storyEngine.ts` is extended (not replaced) for backward compatibility
- TypeScript is used throughout, matching the existing codebase
- `fast-check` ^4.8.0 is already available in devDependencies
- Test runner: `vitest` (existing project pattern)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "4.1", "5.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "7.1"] },
    { "id": 3, "tasks": ["7.2", "7.3", "8.1", "8.2"] },
    { "id": 4, "tasks": ["8.3", "8.4"] },
    { "id": 5, "tasks": ["10.1"] }
  ]
}
```
