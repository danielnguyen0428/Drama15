# Upgrade Billionaire CEO FictionMe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `billionaire_rich_poor_romance` niche so generated titles and story seeds cover the broader Billionaire/CEO market grammar seen across FictionMe pages 1-17.

**Architecture:** Keep one configured niche id and expand its data banks instead of adding a new preset. Tests lock the market grammar categories, then JSON preset data, hot motif anchors, seed blueprint atoms, and prompt catalogs are expanded to make auto-generation rotate through contract marriage, CEO boss, ex-wife revenge, secret baby, one-night mistake, possessive billionaire, hidden identity, and paper marriage story shapes.

**Tech Stack:** TypeScript, JSON presets, Electron renderer JavaScript, Node test runner with `tsx`.

---

### Task 1: Add Failing Market-Grammar Tests

**Files:**
- Modify: `tests/presets/drama-branch-presets.test.ts`
- Modify: `tests/prompts/seed-blueprint.test.ts`
- Modify: `tests/prompts/story-prompts.test.ts`

- [x] **Step 1: Add preset DNA assertions**

Add a test that loads `presets/lines/billionaire_rich_poor_romance.json` and asserts its serialized text contains all required FictionMe-derived category signals:

```ts
assert.match(serialized, /CEO|boss/i);
assert.match(serialized, /contract|paper marriage|business deal/i);
assert.match(serialized, /secret baby|twins|heir|pregnant/i);
assert.match(serialized, /ex-wife|divorce|regret/i);
assert.match(serialized, /one-night|accidental/i);
assert.match(serialized, /possessive|ruthless|heartless/i);
assert.match(serialized, /hidden identity|secret billionaire|mistaken/i);
assert.match(serialized, /revenge queen|female billionaire|comeback/i);
```

- [x] **Step 2: Add seed-bank coverage assertions**

Add a seed blueprint test that checks `billionaire_rich_poor_romance` has at least 80 anchors and that generated blueprint text covers:

```ts
[
  /contract|paper marriage|business deal/i,
  /CEO|boss|secretary|assistant|workplace/i,
  /secret baby|twins|heir|pregnant|surrogate/i,
  /ex-wife|divorce|regret|chasing wife/i,
  /one-night|accidental|slept/i,
  /possessive|ruthless|heartless|domineering/i,
  /hidden identity|secret billionaire|mistaken/i,
  /revenge queen|female billionaire|comeback/i,
]
```

- [x] **Step 3: Add prompt catalog assertions**

Update the setting-seed prompt test so the auto-generation topic catalog includes new original title shapes such as:

```ts
assert.match(prompt.userPrompt, /Contract Wife For The CEO Heir/);
assert.match(prompt.userPrompt, /Hiding Twins From The Ruthless Billionaire/);
assert.match(prompt.userPrompt, /After Divorce She Bought His Company/);
assert.match(prompt.userPrompt, /One Night With The Wrong CEO/);
```

- [x] **Step 4: Verify RED**

Run:

```powershell
node --test --import tsx .\tests\presets\drama-branch-presets.test.ts .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts
```

Expected: FAIL because the current Niche 1 banks do not yet contain the broader FictionMe category coverage.

### Task 2: Expand Niche 1 Preset And Motif Anchors

**Files:**
- Modify: `presets/lines/billionaire_rich_poor_romance.json`
- Modify: `src/modules/prompts/hot-motif-anchors.ts`

- [x] **Step 1: Expand preset JSON**

Add `CEO/boss`, `contract wife`, `paper marriage`, `secret baby/twins/heir`, `ex-wife revenge`, `divorce regret`, `one-night mistake`, `possessive/ruthless billionaire`, and `hidden identity` to description, `emotionalAxis`, `coreKeywords`, `seriesExamples`, and `tropeWeights`.

- [x] **Step 2: Expand `HOT_MOTIF_ANCHORS.billionaire_rich_poor_romance`**

Add original market-shaped anchors until the array has at least 80 unique entries. Keep them as original title seeds, not copied FictionMe titles. Include all categories from Task 1.

- [x] **Step 3: Run targeted tests**

Run the same command from Task 1. Expected: preset assertions pass; seed blueprint category assertions may still fail until Task 3.

### Task 3: Expand Seed Blueprint Bank And Prompt Catalog

**Files:**
- Modify: `src/modules/prompts/seed-blueprint.ts`
- Modify: `src/modules/prompts/drama15-seed-engine.ts`
- Modify: `src/modules/prompts/story-prompts.ts`

- [x] **Step 1: Expand billionaire seed blueprint arrays**

Add original motif families, arenas, inciting humiliations, hidden leverages, evidence objects, betrayer pressures, status forces, reveal venues, freshness angles, relationship dynamics, protagonist agencies, antagonist webs, reveal mechanisms, and ending shapes for the new categories.

- [x] **Step 2: Expand market signal and social pain banks**

Update `MARKET_SIGNAL_PACK` for `billionaire_rich_poor_romance` with broader current demand and title shapes. Update `SOCIAL_PAIN_BANK` with CEO contract, secret child, divorce regret, and one-night/paper-marriage social pressure.

- [x] **Step 3: Expand auto-generation topic catalog**

Update `AUTO_GENERATE_TOPIC_CATALOG` under Rich / Poor / Billionaire Romance to include original FictionMe-like title shapes across all required categories.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
node --test --import tsx .\tests\presets\drama-branch-presets.test.ts .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- No source edits unless tests fail.

- [x] **Step 1: Run full check**

Run:

```powershell
npm run check
```

Expected: build succeeds and all tests pass.

- [x] **Step 2: Review changed files**

Run:

```powershell
git diff -- tests/presets/drama-branch-presets.test.ts tests/prompts/seed-blueprint.test.ts tests/prompts/story-prompts.test.ts presets/lines/billionaire_rich_poor_romance.json src/modules/prompts/hot-motif-anchors.ts src/modules/prompts/seed-blueprint.ts src/modules/prompts/drama15-seed-engine.ts src/modules/prompts/story-prompts.ts
```

Expected: diff is limited to Billionaire/CEO market grammar expansion and the local plan document.
