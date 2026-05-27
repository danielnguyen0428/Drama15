# Requirements Document

## Introduction

Nâng cấp hệ thống Character Consistency cho pipeline sáng tác truyện AI (Drama15). Hiện tại, pipeline chỉ truyền Story Bible JSON blob và mảng `previousSummaries` (200 ký tự đầu mỗi chương) để duy trì tính nhất quán nhân vật. Hệ thống thiếu: (1) Character Memory Store theo dõi trạng thái cảm xúc, mối quan hệ, và sự kiện đã xác lập qua từng chương; (2) Lớp validation phát hiện character drift sau khi sinh chương; (3) Tóm tắt chương theo nhân vật thay vì chỉ theo cốt truyện; (4) Cơ chế giải quyết xung đột phong cách Gu Man vs Drama15.

## Glossary

- **Pipeline**: Chuỗi xử lý tuần tự từ Seed → Concept → Story Bible → Chapter Plan → Chapter Drafts trong hệ thống Drama15
- **Story_Bible**: JSON object chứa thông tin nền tảng về nhân vật (heroine, betrayer, rival), các engine (betrayal, class shame, revenge), và ending mode
- **Character_Fact_Sheet**: Cấu trúc dữ liệu trích xuất sau mỗi chương, chứa tên nhân vật, trạng thái cảm xúc, mối quan hệ, vị trí xã hội, và sự kiện đã xác lập
- **Character_Memory_Store**: Kho lưu trữ tích lũy tất cả Character_Fact_Sheet qua các chương, cung cấp ngữ cảnh nhân vật đầy đủ cho việc sinh chương tiếp theo
- **Consistency_Validator**: Module kiểm tra tính nhất quán nhân vật bằng cách so sánh chương mới sinh với Story_Bible và Character_Memory_Store
- **Character_Summary**: Tóm tắt chương được tổ chức theo từng nhân vật thay vì chỉ theo cốt truyện
- **Style_Resolver**: Module xác định và áp dụng đúng phong cách (Gu Man overlay hoặc Drama15 core) dựa trên ngữ cảnh chương
- **Drift_Report**: Báo cáo chi tiết các vi phạm tính nhất quán nhân vật được phát hiện bởi Consistency_Validator
- **Repair_Loop**: Vòng lặp sửa chữa chương khi phát hiện lỗi chất lượng (hiện chỉ kiểm tra word count và dialogue ratio)

## Requirements

### Requirement 1: Trích xuất Character Fact Sheet sau mỗi chương

**User Story:** As a pipeline operator, I want to extract structured character facts after each chapter is generated, so that the system can track character state evolution across the story.

#### Acceptance Criteria

1. WHEN a chapter draft is finalized (after Repair_Loop completes), THE Pipeline SHALL extract a Character_Fact_Sheet from the chapter text using an LLM call
2. THE Character_Fact_Sheet SHALL contain the following fields for each named character appearing in the chapter: character name, emotional state, relationship changes, social position, and newly established facts
3. WHEN the chapter text contains no named characters, THE Pipeline SHALL produce an empty Character_Fact_Sheet and log a warning
4. THE Pipeline SHALL validate that the extracted Character_Fact_Sheet conforms to a predefined JSON schema before storing it in the Character_Memory_Store
5. IF the Character_Fact_Sheet extraction fails or returns invalid JSON, THEN THE Pipeline SHALL retry extraction once with a lower temperature, and if still failing, store a fallback entry containing only character names found via regex

### Requirement 2: Character Memory Store tích lũy qua các chương

**User Story:** As a pipeline operator, I want a cumulative memory store that tracks all character facts across chapters, so that subsequent chapter generation has full character context.

#### Acceptance Criteria

1. THE Character_Memory_Store SHALL accumulate Character_Fact_Sheet entries indexed by chapter number and character name
2. WHEN generating chapter N (where N > 1), THE Pipeline SHALL pass the full Character_Memory_Store (chapters 1 through N-1) as context to the chapter draft prompt
3. THE Character_Memory_Store SHALL support querying facts for a specific character across all previous chapters
4. WHEN operating in single-chapter mode, THE Pipeline SHALL initialize the Character_Memory_Store from the user-provided seed context or leave it empty if no context is available
5. THE Character_Memory_Store SHALL serialize to and deserialize from JSON format for persistence between pipeline runs
6. FOR ALL valid Character_Memory_Store objects, serializing then deserializing SHALL produce an equivalent object (round-trip property)

### Requirement 3: Consistency Validation sau khi sinh chương

**User Story:** As a pipeline operator, I want the system to automatically detect character inconsistencies after generating each chapter, so that contradictions are caught before the story is finalized.

#### Acceptance Criteria

1. WHEN a chapter draft is finalized, THE Consistency_Validator SHALL compare the chapter content against the Story_Bible and Character_Memory_Store
2. THE Consistency_Validator SHALL detect the following violation types: character name misspelling or variation, personality trait contradiction, relationship logic violation, social position drift, and emotional state discontinuity
3. WHEN the Consistency_Validator detects one or more violations, THE Consistency_Validator SHALL produce a Drift_Report containing: violation type, severity (critical or warning), the conflicting text excerpt, and the established fact being contradicted
4. THE Consistency_Validator SHALL classify violations as critical when they contradict Story_Bible core facts (character names, fundamental relationships, social hierarchy) and as warning when they contradict Character_Memory_Store accumulated state
5. IF the Consistency_Validator produces a Drift_Report with at least one critical violation, THEN THE Pipeline SHALL trigger the Repair_Loop with the Drift_Report included in the repair prompt
6. WHILE the Repair_Loop is processing a character consistency repair, THE Pipeline SHALL include both the original quality failures and the Drift_Report violations in the repair instructions

### Requirement 4: Tóm tắt chương theo nhân vật (Character Summary)

**User Story:** As a pipeline operator, I want chapter summaries organized by character rather than just plot, so that the LLM receives richer character-specific context for subsequent chapters.

#### Acceptance Criteria

1. WHEN a chapter is finalized, THE Pipeline SHALL generate a Character_Summary that organizes information by character name instead of chronological plot order
2. THE Character_Summary SHALL include for each character: actions taken, emotional arc within the chapter, relationship interactions, and status changes
3. THE Character_Summary SHALL replace the current `summarizeChapter()` function output (which only extracts the first 200 characters) as the input to `previousSummaries` for subsequent chapter generation
4. THE Character_Summary for a single chapter SHALL contain between 300 and 800 words to provide sufficient context without exceeding prompt token limits
5. WHEN a chapter contains more than 5 named characters, THE Character_Summary SHALL prioritize the 5 most plot-relevant characters and group remaining characters under a collective summary

### Requirement 5: Giải quyết xung đột phong cách Gu Man vs Drama15

**User Story:** As a pipeline operator, I want clear separation between Gu Man style overlay and Drama15 core style, so that style instructions do not conflict during chapter generation.

#### Acceptance Criteria

1. THE Style_Resolver SHALL determine which style mode to apply based on the story configuration: "drama15_only", "gu_man_only", or "drama15_with_gu_man_overlay"
2. WHEN the style mode is "drama15_with_gu_man_overlay", THE Style_Resolver SHALL apply Gu Man style instructions only to dialogue tone and romantic interaction scenes, while Drama15 core style governs plot structure, pacing, and intensity
3. WHEN the style mode is "drama15_only", THE Style_Resolver SHALL exclude the Gu Man style guide entirely from the system prompt
4. WHEN the style mode is "gu_man_only", THE Style_Resolver SHALL use the Gu Man style guide as the primary style authority and reduce Drama15 structural constraints to architecture-only (chapter count, word count, mandatory/forbidden elements)
5. THE Style_Resolver SHALL inject style instructions into the system prompt as a single coherent block with explicit priority markers, preventing the LLM from receiving contradictory style directives
6. IF a story configuration does not specify a style mode, THEN THE Style_Resolver SHALL default to "drama15_with_gu_man_overlay" to maintain backward compatibility

### Requirement 6: Mở rộng Repair Loop để xử lý Character Drift

**User Story:** As a pipeline operator, I want the repair loop to fix character inconsistencies in addition to quantitative metrics, so that the final output maintains both quality targets and character coherence.

#### Acceptance Criteria

1. WHEN the Repair_Loop receives a Drift_Report, THE Repair_Loop SHALL include specific correction instructions for each critical violation in the repair prompt
2. THE Repair_Loop SHALL preserve all existing quality checks (word count, dialogue ratio) while adding character consistency checks
3. WHEN a chapter fails both quality metrics and character consistency, THE Repair_Loop SHALL address both categories of failure in a single repair attempt rather than sequential repairs
4. THE Repair_Loop SHALL allow a maximum of 3 total repair attempts (increased from current 2) when character consistency violations are present
5. IF the Repair_Loop exhausts all repair attempts and critical character violations remain, THEN THE Pipeline SHALL log the unresolved violations and mark the chapter with a consistency warning flag rather than blocking story completion
6. THE Repair_Loop SHALL use a repair temperature of 0.28 for character consistency repairs (matching the existing repair temperature)

### Requirement 7: Character Fact Sheet Extraction Prompt

**User Story:** As a pipeline operator, I want a dedicated prompt template for extracting character facts from chapter text, so that extraction is consistent and structured.

#### Acceptance Criteria

1. THE Pipeline SHALL use a dedicated system prompt for Character_Fact_Sheet extraction that instructs the LLM to output strict JSON conforming to the Character_Fact_Sheet schema
2. THE extraction prompt SHALL include the Story_Bible as reference context so the LLM can identify which characters to track
3. WHEN extracting facts, THE Pipeline SHALL use a temperature of 0.2 to maximize extraction accuracy and minimize hallucination
4. THE extraction prompt SHALL instruct the LLM to distinguish between explicitly stated facts and inferred facts, marking inferred facts with a confidence level
5. THE Pipeline SHALL extract Character_Fact_Sheet data in the same output language as the chapter text

### Requirement 8: Consistency Validation Prompt

**User Story:** As a pipeline operator, I want a dedicated prompt template for consistency validation, so that the validator produces structured and actionable drift reports.

#### Acceptance Criteria

1. THE Pipeline SHALL use a dedicated system prompt for consistency validation that instructs the LLM to compare the new chapter against provided reference data (Story_Bible and Character_Memory_Store)
2. THE validation prompt SHALL enumerate specific categories to check: name consistency, personality consistency, relationship logic, social position, emotional continuity, and established fact preservation
3. WHEN validating, THE Pipeline SHALL use a temperature of 0.1 to maximize detection accuracy
4. THE validation prompt SHALL instruct the LLM to output a structured Drift_Report in JSON format with violation type, severity, excerpt, and contradicted fact
5. IF no violations are detected, THEN THE Consistency_Validator SHALL return an empty Drift_Report (empty violations array) rather than omitting the response
