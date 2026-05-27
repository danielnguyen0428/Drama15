# Add Three Drama Niches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three production-ready drama niches to the desktop tool, bringing the app from 7 to 10 configured niches.

**Architecture:** Each niche must be available as a line preset, visible in the renderer dropdown with Vietnamese labels, have hidden randomized story controls, and have full seed engine coverage. Seed coverage means at least 30 hot motif anchors, 20 script motif families, broad context arenas, reveal venues, skeleton diversity, and prompt catalog representation.

**Tech Stack:** TypeScript, Electron renderer JavaScript, JSON presets, Node test runner with `tsx`, Zod schemas.

---

### Task 1: Add Failing Tests For 10 Niches

**Files:**
- Modify: `tests/modules/presets/preset-loader.test.ts` or the existing preset test file discovered in `tests/`
- Modify: `tests/desktop/renderer-ui-copy.test.ts`
- Modify: `tests/prompts/seed-blueprint.test.ts`
- Modify: `tests/prompts/story-prompts.test.ts`

- [ ] **Step 1: Write preset tests**

Assert line preset ids include:
`workplace_ceo_power_struggle`, `medical_hidden_doctor_life_care`, `school_campus_bullying_identity`.

- [ ] **Step 2: Write renderer tests**

Assert renderer labels use Vietnamese niche names for all 10 niches and hidden controls exist for the 3 new ids.

- [ ] **Step 3: Write seed tests**

Assert diagnostics length is 10 and every niche has at least 30 anchors and 20 motif families.

- [ ] **Step 4: Run tests and verify RED**

Run:
`node --test --import tsx .\tests\prompts\seed-blueprint.test.ts .\tests\desktop\renderer-ui-copy.test.ts`

Expected: FAIL because new niche ids and banks do not exist.

### Task 2: Add Presets And Renderer Controls

**Files:**
- Create: `presets/lines/workplace_ceo_power_struggle.json`
- Create: `presets/lines/medical_hidden_doctor_life_care.json`
- Create: `presets/lines/school_campus_bullying_identity.json`
- Modify: `desktop/renderer/renderer.js`

- [ ] **Step 1: Add JSON line presets**

Each new preset must include `id`, Vietnamese `displayName`, `description`, `emotionalAxis`, `coreKeywords`, `seriesExamples`, `tropeWeights`, `chapterArcDefaults`, `humiliationPacing`, `revengeActivation`, `dignityRecoveryTiming`, and fixed 10-chapter constraints.

- [ ] **Step 2: Add Vietnamese dropdown labels**

Add the three new ids to `SELECT_OPTION_LABELS["line-preset"]`.

- [ ] **Step 3: Add hidden story controls**

Add `NICHE_STORY_CONTROLS` entries for each new id.

### Task 3: Add Seed Engine Banks

**Files:**
- Modify: `src/modules/prompts/hot-motif-anchors.ts`
- Modify: `src/modules/prompts/seed-blueprint.ts`

- [ ] **Step 1: Add 30 anchors per new niche**

Add arrays for the three new ids in `HOT_MOTIF_ANCHORS`.

- [ ] **Step 2: Add skeleton banks**

Add relationship dynamics, protagonist agencies, antagonist webs, reveal mechanisms, and ending shapes for the three new ids.

- [ ] **Step 3: Add full `SEED_BLUEPRINT_BANKS` entries**

Each bank must include motif families, social pains, arenas, humiliations, hidden leverages, evidence objects, betrayer pressures, status forces, reveal venues, freshness angles, and skeleton spread.

### Task 4: Update Prompt Catalog And Routing

**Files:**
- Modify: `src/modules/prompts/story-prompts.ts`
- Modify: `src/modules/orchestrator/story-orchestrator.ts`

- [ ] **Step 1: Update configured niche id instruction**

Include all 10 ids in the setting seed prompt.

- [ ] **Step 2: Add topic catalog rows**

Add the three new branches to the auto-generation catalog and trend-aware seed engine.

- [ ] **Step 3: Update custom niche routing**

Map workplace/office/CEO terms to `workplace_ceo_power_struggle`, medical/hospital/doctor terms to `medical_hidden_doctor_life_care`, and school/campus/bullying terms to `school_campus_bullying_identity`.

### Task 5: Verify And Pack

**Files:**
- No source edits unless tests fail.

- [ ] **Step 1: Run targeted tests**

Run:
`node --test --import tsx .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts .\tests\desktop\renderer-ui-copy.test.ts`

- [ ] **Step 2: Run full check**

Run:
`npm run check`

- [ ] **Step 3: Pack portable build**

Backup portable data files in `release/gui`, stop `Drama15` processes, then run:
`npm run desktop:pack`

- [ ] **Step 4: Verify packed asar**

Extract `dist\modules\prompts\seed-blueprint.js`, `dist\modules\prompts\story-prompts.js`, and `desktop\renderer\renderer.js` from `release/gui/win-unpacked/resources/app.asar`; verify all three new niche ids are present.

- [ ] **Step 5: Hash final exe**

Run:
`Get-FileHash -LiteralPath .\release\gui\Drama15-Lite-Studio-2.0.1-x64.exe -Algorithm SHA256`
