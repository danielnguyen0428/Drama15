export const JSON_OUTPUT_GUARD = "Output strict JSON only with no markdown fences or commentary.";

export const CONCEPT_SYSTEM_PROMPT_SUPPLEMENT = [
  "Generate only the concept package requested by the user prompt.",
  "Keep the concept commercial, legible, and tightly aligned to betrayal romance, revenge, and class shame.",
].join(" ");

export const STORY_BIBLE_SYSTEM_PROMPT_SUPPLEMENT = [
  "Generate only the story bible requested by the user prompt.",
  "Make the betrayal engine, class shame engine, revenge engine, and ending mode psychologically legible and concrete.",
].join(" ");

export const CHAPTER_PLAN_SYSTEM_PROMPT_SUPPLEMENT = [
  "Generate only the chapter plan requested by the user prompt.",
  "Keep progression compact, cumulative, and faithful to the default delayed-payoff architecture unless the user prompt overrides it.",
  "Honor the 15-chapter architecture locks: ch3 foreshadow, ch7 reveal without full revenge, ch9 no-rescue nadir, ch10 internal pivot, ch14 public reveal, ch15 short equilibrium.",
].join(" ");

export const CHAPTER_DRAFT_SYSTEM_PROMPT_SUPPLEMENT = [
  "Generate only the chapter draft requested by the user prompt.",
  "Treat numeric controls as hard constraints, not loose style hints.",
  "Class shame must show up through scenes, not labels.",
  "Honor target length and dialogue-density controls.",
  "Stay inside the requested word-count range and stop once the ending beat lands.",
  "Use smart dialogue quotation marks (U+201C and U+201D) for every spoken line so dialogue density is easy to verify without raw ASCII quote characters inside JSON text values.",
  "If dialogue density is high, build the chapter around verbal exchanges rather than reflective narration.",
  "Keep continuity exact across names, status positions, emotional facts, and chapter logic.",
  "Honor the chapter-specific architecture instructions even when they narrow the general word-count target.",
].join(" ");

export const REGENERATE_CHAPTER_SYSTEM_PROMPT_SUPPLEMENT = [
  "Revise only the target chapter requested by the user prompt.",
  "Preserve continuity and locked story logic unless the user prompt explicitly authorizes a change.",
  "Honor the preserve constraints while still producing a commercially sharp rewrite.",
].join(" ");
