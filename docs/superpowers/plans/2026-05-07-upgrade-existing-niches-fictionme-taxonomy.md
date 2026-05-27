# Upgrade Existing Niches FictionMe Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the 11 existing non-billionaire niches so generated titles and story seeds align with practical FictionMe category patterns while preserving current niche ids and UI structure.

**Architecture:** Keep the existing 12-niche configuration. Add test coverage that locks category DNA for each remaining niche, then expand preset JSON, hot motif anchors, seed blueprint banks, market signal packs, and auto-generation catalog examples to match the mapped taxonomy.

**Tech Stack:** TypeScript, JSON presets, Node test runner with `tsx`, PowerShell verification commands.

---

### Task 1: Add Category Coverage Tests

**Files:**
- Modify: `tests/presets/drama-branch-presets.test.ts`
- Modify: `tests/prompts/seed-blueprint.test.ts`
- Modify: `tests/prompts/story-prompts.test.ts`

- [x] **Step 1: Add preset category DNA assertions**

Add a test that serializes each non-billionaire line preset and checks mapped category markers:

```ts
const expectations = {
  humiliation_revenge_justice: [/urban/i, /thriller/i, /viral|evidence|lawsuit|public apology/i],
  secret_identity_hidden_heiress: [/romance/i, /urban/i, /undercover|hidden heiress|lost daughter|secret owner/i],
  toxic_family_betrayal: [/family/i, /thriller/i, /inheritance|custody|adoption|deed|fraud/i],
  cheating_ex_wedding_drama: [/romance/i, /dark romance/i, /mistress|ex-wife|divorce|wedding reveal/i],
  single_mom_poor_woman_comeback: [/romance/i, /urban/i, /secret child|custody|daycare|comeback/i],
  social_injustice_discrimination_drama: [/urban/i, /thriller/i, /discrimination|accessibility|racism|classism|evidence/i],
  workplace_ceo_power_struggle: [/billionaire\/CEO|CEO/i, /urban/i, /cap table|boardroom|hostile takeover|pitch theft/i],
  medical_hidden_doctor_life_care: [/romance/i, /thriller/i, /hidden surgeon|malpractice|consent|chart audit/i],
  school_campus_bullying_identity: [/young adult/i, /scholarship|bullying|rich clique|donor parent|talent show/i],
  werewolf_luna_alpha_soulmate: [/werewolf/i, /rejected mate|fated mate|Alpha|Luna|Omega|pack law/i],
  steamy_alien_captive_romance: [/steamy/i, /dark romance/i, /alien|captive heroine|empire contract|consent restoration/i],
};
```

- [x] **Step 2: Add seed coverage assertions**

Generate 45 blueprints per target niche with history avoidance and assert the joined corpus contains each mapped category pattern.

- [x] **Step 3: Add topic catalog assertions**

Assert `buildSettingSeedPrompt` includes representative original title shapes such as:

```ts
"Viral Video Cleared The Woman They Shamed"
"Lost Heiress Worked The Hotel Night Shift"
"Mother-In-Law Hid The Custody Papers"
"Mistress Took The Bride's Name"
"Single Mom Won The Custody Hearing"
"Restaurant Refused The Owner In A Wheelchair"
"Hostile Board Needed The Fired Assistant"
"Hidden Surgeon Exposed The VIP Cover Up"
"Scholarship Girl Beat The Rich Clique"
"Rejected Omega Became The Luna"
"Alien Emperor Signed Her Freedom"
```

- [x] **Step 4: Verify RED**

Run:

```powershell
node --test --import tsx .\tests\presets\drama-branch-presets.test.ts .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts
```

Expected: FAIL because preset/category prompt data is not yet fully upgraded.

### Task 2: Expand Presets And Hot Motif Anchors

**Files:**
- Modify: `presets/lines/*.json` for the 11 target niches
- Modify: `src/modules/prompts/hot-motif-anchors.ts`

- [x] **Step 1: Expand preset JSON**

For each target niche, preserve `id` and `displayName`, then update description, keywords, examples, trope weights, pacing, and activation copy to include the mapped FictionMe taxonomy DNA.

- [x] **Step 2: Add original anchors**

Add category-specific original anchors to each target niche. Keep examples original and compact; do not copy FictionMe titles.

- [x] **Step 3: Run targeted tests**

Run the Task 1 command. Expected: preset assertions pass; seed/prompt catalog may still fail until Task 3.

### Task 3: Expand Seed Blueprint And Prompt Catalog

**Files:**
- Modify: `src/modules/prompts/seed-blueprint.ts`
- Modify: `src/modules/prompts/drama15-seed-engine.ts`
- Modify: `src/modules/prompts/story-prompts.ts`

- [x] **Step 1: Add category terms to seed blueprint banks**

Append missing category terms to motif families, social pains, evidence objects, status forces, reveal mechanisms, and ending shapes for each target niche.

- [x] **Step 2: Expand market signal packs**

Update each non-billionaire signal with current-demand text, title shapes, and freshness moves that match the mapped category.

- [x] **Step 3: Expand auto-generation topic catalog**

Add the representative title shapes from Task 1 to the matching topic catalog sections.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
node --test --import tsx .\tests\presets\drama-branch-presets.test.ts .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- No source edits unless verification fails.

- [x] **Step 1: Run full check**

Run:

```powershell
npm run check
```

Expected: build succeeds and all tests pass.

- [x] **Step 2: Review status**

Run:

```powershell
git status --short --untracked-files=all
```

Expected: changed files are limited to the niche taxonomy upgrade plus pre-existing unrelated workspace changes.
