# Vietnamese Writing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Drama15 writing workspace into a fully Vietnamese creative studio UI.

**Architecture:** Keep the existing React component and CSS structure. Make surgical copy, state-label, and visual polish changes in the current workspace files without changing API payloads, SSE behavior, or generation logic.

**Tech Stack:** Vite, React 18, TypeScript, CSS.

---

### Task 1: Localize Story Workspace Copy

**Files:**
- Modify: `apps/web/src/story/StoryWorkspace.tsx`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Add Vietnamese label maps**

Add constants for phase labels, language labels, rewrite modes, and fallback style names near the existing config constants.

- [ ] **Step 2: Replace user-facing English strings**

Translate workspace heading, form labels, buttons, tabs, empty states, progress labels, error fallbacks, chapter fallbacks, and exported Markdown headings into Vietnamese with diacritics.

- [ ] **Step 3: Preserve behavior**

Keep all enum values, request payload keys, endpoints, component props, and function signatures unchanged.

- [ ] **Step 3b: Localize metadata copy**

Translate visible and share-card description copy in `apps/web/index.html` where it still uses mixed English terms such as `concept`, `beat sheet`, or `Rewrite`.

- [ ] **Step 4: Run source string search**

Run: `rg -n "Setup|Niche|Language|Intensity|Dialogue|Hook|Chapter|Chapters|Overview|Plan|Bible|Rewrite|Waiting|Ready|Working|Story complete|Could not|stream|Generate|Manuscript|Untitled|Reload|App crashed" apps/web/src apps/web/index.html`

Expected: only accepted product names, technical terms, metadata, or non-user-facing developer strings remain.

### Task 2: Polish Workspace Styling

**Files:**
- Modify: `apps/web/src/story/StoryWorkspace.css`

- [ ] **Step 1: Update type and colors**

Replace generic Inter-first typography with a Vietnamese-friendly font stack and tune colors with the existing dark studio mood.

- [ ] **Step 2: Improve controls and focus**

Keep 8px radius, strengthen focus outlines, add accessible disabled reasons through visible disabled state styling, and improve button hover transitions.

- [ ] **Step 3: Improve reading layout**

Refine spacing for the setup panel, tabs, chapter list, manuscript reader, text panels, and rewrite panel without changing the DOM shape.

### Task 3: Localize Error Boundary

**Files:**
- Modify: `apps/web/src/ErrorBoundary.tsx`

- [ ] **Step 1: Translate crash UI**

Use Vietnamese title, explanation, and reload button text.

- [ ] **Step 2: Align styling**

Match the workspace font stack and focus-visible button styling.

### Task 4: Verify and Commit

**Files:**
- Verify all modified files.

- [ ] **Step 1: Build web client**

Run: `npm run build:web`

Expected: Vite production build exits 0.

- [ ] **Step 2: Search for remaining user-facing English**

Run the source string search from Task 1 again.

Expected: any remaining English is intentional and listed in the handoff.

- [ ] **Step 3: Review git diff**

Run: `git diff -- apps/web/index.html apps/web/src/story/StoryWorkspace.tsx apps/web/src/story/StoryWorkspace.css apps/web/src/ErrorBoundary.tsx docs/superpowers/plans/2026-05-27-vietnamese-writing-ui.md`

Expected: diff only contains the planned UI and plan changes.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/web/index.html apps/web/src/story/StoryWorkspace.tsx apps/web/src/story/StoryWorkspace.css apps/web/src/ErrorBoundary.tsx docs/superpowers/plans/2026-05-27-vietnamese-writing-ui.md
git commit -m "feat: localize writing studio ui"
```
