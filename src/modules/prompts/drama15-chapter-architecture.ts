type ChapterArchitecture = {
  chapterNumber: number;
  arc: string;
  functionName: string;
  wordCountTarget: number;
  wordCountRange: [number, number];
  intensity: number;
  dialogueRatio: number;
  hookType: "curiosity" | "tension" | "revelation" | "irony";
  mandatoryElements: string[];
  forbiddenElements: string[];
  craftInstructions: string[];
  summaryMemoryTags: string[];
};

export const DRAMA15_TOTAL_TARGET_WORDS = 37_500;
export const DRAMA15_FIXED_CHAPTER_COUNT = 15;
export const DRAMA15_EXACT_WORD_COUNT_OPERATIONAL_TOLERANCE = 100;

// Phase A: the architecture is no longer hard-locked to exactly 15 chapters.
// The floor stays at 15 so no authored beat is ever dropped; the planner may
// request 16 or 17 when the plot needs an extra breathing chapter before the
// climax. Extra chapters are inserted into the rise arc (see
// buildDrama15ChapterArchitecture), never before the nadir/pivot locks.
export const DRAMA15_MIN_CHAPTER_COUNT = 15;
export const DRAMA15_MAX_CHAPTER_COUNT = 17;

export function clampChapterCount(total: number): number {
  if (!Number.isFinite(total)) return DRAMA15_FIXED_CHAPTER_COUNT;
  const rounded = Math.round(total);
  if (rounded < DRAMA15_MIN_CHAPTER_COUNT) return DRAMA15_MIN_CHAPTER_COUNT;
  if (rounded > DRAMA15_MAX_CHAPTER_COUNT) return DRAMA15_MAX_CHAPTER_COUNT;
  return rounded;
}

/**
 * Decide how many chapters a story needs (15-17) from its structural
 * complexity. The floor is 15 so no authored beat is ever dropped; each extra
 * distinct load the climax must carry earns one breathing chapter in the rise
 * arc so the finale is not forced to resolve everything at once (the exact
 * failure seen when a lopsided climax dumped an unresolved thread on ch15).
 *
 * Signals (both are concrete outputs of the story bible, not guesses):
 * - pressureThreads beyond the baseline two: every extra pressure line the
 *   climax must close.
 * - supportingPressureCast beyond two: every extra named family/institutional
 *   force whose arc needs at least one on-page beat before the finale.
 *
 * One extra chapter per two units of excess complexity, clamped to 15-17.
 */
export function resolveComplexityChapterCount(signals: {
  pressureThreadCount: number;
  supportingCastCount: number;
}): number {
  const excessThreads = Math.max(0, signals.pressureThreadCount - 2);
  const excessCast = Math.max(0, signals.supportingCastCount - 2);
  const extraChapters = Math.floor((excessThreads + excessCast) / 2);
  return clampChapterCount(DRAMA15_FIXED_CHAPTER_COUNT + extraChapters);
}

/**
 * Named structural positions for the fixed 15-chapter architecture.
 *
 * These are the single source of truth for the dramatic locks. Every prompt,
 * invariant rule, and overview string derives its chapter numbers from here so
 * that the architecture and the instructions can never drift apart.
 */
export const DRAMA15_KEY_CHAPTERS = {
  /** Chapter that plants the concrete foreshadow detail. */
  foreshadowPlant: 3,
  /** Chapter that activates the planted foreshadow detail with new meaning. */
  foreshadowActivate: 7,
  /** Chapter where the designed betrayal is revealed (same beat as activation). */
  reveal: 7,
  /** No-rescue nadir: maximum loss with no outside rescue. */
  nadir: 9,
  /** Quiet internal pivot / pressure-release chapter. */
  pivot: 10,
  /** Public confrontation where the decisive truth is exposed. */
  publicReveal: 14,
  /** Short aftershock resolution and new equilibrium. */
  resolution: 15,
} as const;

const K = DRAMA15_KEY_CHAPTERS;

export type ResolvedKeyChapters = {
  foreshadowPlant: number;
  foreshadowActivate: number;
  reveal: number;
  nadir: number;
  pivot: number;
  publicReveal: number;
  resolution: number;
};

/**
 * Resolve the structural lock positions for a given total chapter count.
 *
 * Extra chapters (16, 17) are added to the rise arc, so only the climax and
 * resolution positions slide down by the delta from 15. Every earlier lock
 * (foreshadow plant/activate, nadir, pivot) keeps its canonical position, which
 * is why the authored mandatory-element text referencing those chapters stays
 * accurate. For total === 15 this returns exactly DRAMA15_KEY_CHAPTERS.
 */
export function resolveKeyChapters(total: number = DRAMA15_FIXED_CHAPTER_COUNT): ResolvedKeyChapters {
  const clamped = clampChapterCount(total);
  const delta = clamped - DRAMA15_FIXED_CHAPTER_COUNT;
  return {
    foreshadowPlant: K.foreshadowPlant,
    foreshadowActivate: K.foreshadowActivate,
    reveal: K.reveal,
    nadir: K.nadir,
    pivot: K.pivot,
    publicReveal: K.publicReveal + delta,
    resolution: K.resolution + delta,
  };
}

export const DRAMA15_INVARIANT_RULES = [
  "No direct cloning from outside novels: borrow only commercial setup patterns, premise energy, social pressure, and pacing logic; all names, scenes, twists, evidence, and outcomes must be original.",
  "FictionMe-style niche pressure: every story should lean into fast hooks, high-status romance tension, betrayal, public humiliation, hidden power, second-chance pressure, and a heroine-led reversal appropriate to its niche.",
  `No deus ex machina: the nadir (chapter ${K.nadir}) and the pivot (chapter ${K.pivot}) cannot be rescued by an outside character, sudden money, secret inheritance, or lucky coincidence.`,
  `Foreshadow must activate: chapter ${K.foreshadowPlant} plants one concrete detail that chapter ${K.foreshadowActivate} reuses with a new meaning.`,
  `Chapter ${K.resolution} is a short climax-and-aftershock resolution with a hard cap near 2,000 words.`,
  `No three consecutive high-intensity chapters. Chapter ${K.pivot} acts as the pressure-release/internal-pivot chapter.`,
  `Protagonist agency: chapters ${K.pivot}, ${K.pivot + 1}, through ${K.resolution} must prove the heroine stands up through her own action.`,
  "Sustained mid-arc: across 15 chapters the escalation, break, and rise arcs must keep introducing fresh pressure and new information so the middle never stalls or repeats a beat.",
];

export const DRAMA15_CHAPTER_ARCHITECTURE: ChapterArchitecture[] = [
  {
    chapterNumber: 1,
    arc: "setup",
    functionName: "commercial_hook_world_entry",
    wordCountTarget: 2400,
    wordCountRange: [2300, 2600],
    intensity: 0.66,
    dialogueRatio: 0.48,
    hookType: "curiosity",
    mandatoryElements: [
      "open on a concrete high-pressure situation, not background explanation",
      "show the heroine's core strength through behavior under social pressure",
      "establish the niche rules through interaction: pack law, elite family protocol, school hierarchy, hospital politics, workplace rank, captivity rules, or family debt",
      "introduce one emotionally magnetic relationship pressure: fated pull, contract bond, old love, custody, debt, rank, hidden identity, or taboo dependence",
    ],
    forbiddenElements: [
      "backstory information dump",
      "long internal-monologue opening",
      "flashback in the first 500 words",
      "copying a recognizable external novel scene",
    ],
    craftInstructions: [
      "Use FictionMe-style immediacy: readers should understand the wound, the power imbalance, and the romantic or status danger before the chapter ends.",
      "End on a specific odd detail or interrupted social moment that creates curiosity without asking a direct question.",
    ],
    summaryMemoryTags: ["CH1_HOOK", "CH1_STRENGTH"],
  },
  {
    chapterNumber: 2,
    arc: "setup",
    functionName: "world_deepening_relationship_pressure",
    wordCountTarget: 2400,
    wordCountRange: [2300, 2600],
    intensity: 0.7,
    dialogueRatio: 0.5,
    hookType: "tension",
    mandatoryElements: [
      "deepen the central relationship pressure with a second concrete scene, not a recap",
      "expand the niche world by one new rule, room, or social rite the heroine must navigate",
      "show what the heroine stands to lose so later pressure has weight",
      "introduce a supporting ally or witness who will matter in the rise or climax",
    ],
    forbiddenElements: [
      "repeating chapter 1's hook beat with new wording",
      "static description with no scene movement",
      "revealing the antagonist's true plan",
    ],
    craftInstructions: [
      "Treat this as the second setup beat: raise stakes and intimacy without resolving anything.",
      "Keep one thread deliberately unfinished so the foreshadow chapter has room to plant its detail.",
    ],
    summaryMemoryTags: ["CH2_STAKES", "CH2_ALLY"],
  },
  {
    chapterNumber: 3,
    arc: "setup",
    functionName: "threat_surface_and_foreshadow",
    wordCountTarget: 2500,
    wordCountRange: [2400, 2700],
    intensity: 0.72,
    dialogueRatio: 0.52,
    hookType: "tension",
    mandatoryElements: [
      "introduce the betrayer, rival, council, family, institution, captor, or status gatekeeper with a positive or neutral surface",
      `plant one concrete foreshadow detail for chapter ${K.foreshadowActivate}`,
      "make the detail ordinary enough that first-time readers do not notice it",
      "deepen attraction, dependence, or public expectation so rejection will hurt more later",
    ],
    forbiddenElements: [
      "revealing the antagonist's true nature",
      "making the heroine clearly suspicious",
      "using a vague feeling as the foreshadow detail",
    ],
    craftInstructions: [
      `The foreshadow must be an action, sentence, object, mismatch, record, scent, document, scar, mark, message, or reaction that can physically reappear in chapter ${K.foreshadowActivate}.`,
      "The chapter surface should still read as normal social, romantic, institutional, or family drama.",
    ],
    summaryMemoryTags: ["FORESHADOW_CH3", "PUBLIC_EXPECTATION"],
  },
  {
    chapterNumber: 4,
    arc: "escalation",
    functionName: "commitment_false_safety",
    wordCountTarget: 2500,
    wordCountRange: [2400, 2700],
    intensity: 0.76,
    dialogueRatio: 0.55,
    hookType: "irony",
    mandatoryElements: [
      "the heroine crosses a point of no return by active choice",
      "create false safety and expectation around love, rank, job, family, school, contract, or protection",
      "make an unfavorable comparison public but still deniable",
      "end with one subtle ominous line or detail",
    ],
    forbiddenElements: [
      "clear danger signals",
      "prolonged ominous atmosphere",
      "clean protagonist victory",
    ],
    craftInstructions: [
      "Keep the mood lighter than the coming betrayal; the last beat should gain meaning only in hindsight.",
      "Romance or dependency tension should feel tempting without making the heroine passive.",
    ],
    summaryMemoryTags: ["COMMITMENT_EVENT", "OMINOUS_CLOSING"],
  },
  {
    chapterNumber: 5,
    arc: "escalation",
    functionName: "public_pressure_rival_force",
    wordCountTarget: 2600,
    wordCountRange: [2500, 2800],
    intensity: 0.82,
    dialogueRatio: 0.58,
    hookType: "tension",
    mandatoryElements: [
      "first conflict with real stakes",
      "the rival or second status force manipulates etiquette, law, policy, money, medicine, family duty, school rules, or survival rules",
      "the heroine loses ground in public",
      "one tense dialogue scene where every line changes status",
    ],
    forbiddenElements: [
      "cartoonishly evil rival",
      "clean protagonist victory",
      "villain confession",
    ],
    craftInstructions: [
      "Pressure must cost something tangible: status, access, money, trust, reputation, safety, custody, home, rank, or bodily autonomy.",
      "The rival should be socially effective, not foolish; humiliation lands through plausible rules and timing.",
    ],
    summaryMemoryTags: ["FIRST_REAL_PRESSURE", "RIVAL_FORCE"],
  },
  {
    chapterNumber: 6,
    arc: "escalation",
    functionName: "tightening_loss_and_isolation",
    wordCountTarget: 2600,
    wordCountRange: [2500, 2800],
    intensity: 0.8,
    dialogueRatio: 0.54,
    hookType: "tension",
    mandatoryElements: [
      "the rival or status force tightens the trap with a second, concrete move",
      "isolate the heroine from one source of support, information, or protection",
      "raise the personal cost so the coming reveal will land harder",
      "let the heroine win one small, deniable point so hope is not fully gone yet",
    ],
    forbiddenElements: [
      "premature betrayal reveal",
      "the heroine giving up",
      "an outside rescuer solving the pressure",
    ],
    craftInstructions: [
      "This is the bridge into the break arc: keep escalation moving with new information, not repeated humiliation.",
      "Plant the practical reason the heroine cannot simply walk away before the betrayal lands.",
    ],
    summaryMemoryTags: ["TRAP_TIGHTENS", "SUPPORT_LOST"],
  },
  {
    chapterNumber: 7,
    arc: "break",
    functionName: "betrayal_reveal_foreshadow_activation",
    wordCountTarget: 2700,
    wordCountRange: [2600, 2900],
    intensity: 0.9,
    dialogueRatio: 0.58,
    hookType: "revelation",
    mandatoryElements: [
      `activate the chapter ${K.foreshadowPlant} foreshadow detail with a new meaning`,
      "reveal the betrayal, replacement, rejection, frame-up, false diagnosis, stolen identity, forged document, or institutional trap",
      "force the heroine to understand that the harm was designed, not accidental",
      "end before full confrontation or revenge begins",
    ],
    forbiddenElements: [
      "the betrayer explains everything in a monologue",
      "immediate revenge success",
      "outside rescuer solves the reveal",
    ],
    craftInstructions: [
      "Use concrete evidence, not exposition: object, scent, signature, video, ritual mark, lab note, account trail, witness timing, or hidden clause.",
      "The chapter should feel like a FictionMe mid-book punch: romantic wound and status wound land together.",
    ],
    summaryMemoryTags: ["FORESHADOW_ACTIVATED", "BETRAYAL_REVEAL"],
  },
  {
    chapterNumber: 8,
    arc: "break",
    functionName: "false_hope_and_complication",
    wordCountTarget: 2500,
    wordCountRange: [2400, 2700],
    intensity: 0.74,
    dialogueRatio: 0.52,
    hookType: "irony",
    mandatoryElements: [
      "the heroine reaches for one obvious fix and it partly works, then curdles",
      "complicate the betrayal with a new fact that raises the cost of fighting back",
      "let a moment of false hope make the coming nadir hurt more",
      "keep the heroine acting, even if her move is incomplete or misread",
    ],
    forbiddenElements: [
      "a clean win that defuses the betrayal",
      "the heroine becoming passive or only grieving",
      "an outside party fixing the problem",
    ],
    craftInstructions: [
      "This is the controlled breath between the reveal and the nadir; it must add information, not stall.",
      "Avoid a third straight maximum-intensity chapter; let the dread build through quiet wrongness.",
    ],
    summaryMemoryTags: ["FALSE_HOPE", "COST_RAISED"],
  },
  {
    chapterNumber: 9,
    arc: "break",
    functionName: "no_rescue_nadir",
    wordCountTarget: 2700,
    wordCountRange: [2600, 2900],
    intensity: 0.94,
    dialogueRatio: 0.5,
    hookType: "tension",
    mandatoryElements: [
      "maximum loss with no rescue",
      "the heroine's old strategy fails",
      "the betrayer, rival, family, pack, institution, or captor gains temporary control",
      "strip away one protection the heroine relied on",
    ],
    forbiddenElements: [
      "secret helper appears and fixes the situation",
      "sudden inheritance, rank, power, pregnancy, or authority rescue",
      "revenge begins too early",
    ],
    craftInstructions: [
      "The heroine can survive by observation, discipline, refusal, or sacrifice, but cannot win yet.",
      "Keep prose bare and immediate; this is consequence, not spectacle.",
    ],
    summaryMemoryTags: ["NO_RESCUE_NADIR", "OLD_STRATEGY_FAILS"],
  },
  {
    chapterNumber: 10,
    arc: "pivot",
    functionName: "internal_pivot_private_choice",
    wordCountTarget: 2400,
    wordCountRange: [2300, 2600],
    intensity: 0.66,
    dialogueRatio: 0.42,
    hookType: "curiosity",
    mandatoryElements: [
      "quiet aftermath after the nadir",
      "the heroine names the lie she had been living under",
      "she makes one private irreversible choice",
      "recover one small tool, ally, skill, record, boundary, or truth through her own agency",
    ],
    forbiddenElements: [
      "public victory",
      "romantic rescue",
      "new antagonist introduction",
      "loud confrontation",
    ],
    craftInstructions: [
      "This chapter is pressure-release, not filler. Replace noise with clarity and controlled action.",
      "If romance remains active, make the other lead feel the consequence of cowardice without becoming the solution.",
    ],
    summaryMemoryTags: ["INTERNAL_PIVOT", "PRIVATE_CHOICE"],
  },
  {
    chapterNumber: 11,
    arc: "rise",
    functionName: "countermove_evidence_gathering",
    wordCountTarget: 2600,
    wordCountRange: [2500, 2800],
    intensity: 0.8,
    dialogueRatio: 0.55,
    hookType: "tension",
    mandatoryElements: [
      "the heroine takes a strategic countermove",
      "gather or protect evidence through concrete action",
      "the antagonist notices but misunderstands the heroine's plan",
      "one emotional temptation appears: forgiveness, mate bond, family guilt, contract safety, medical dependence, or survival bargain",
    ],
    forbiddenElements: [
      "full plan explanation",
      "effortless competence without cost",
      "antagonist suddenly becomes stupid",
    ],
    craftInstructions: [
      "Show the trap being built through small choices, not a plan speech.",
      "Keep the heroine's agency visible in decisions, timing, silence, and restraint.",
    ],
    summaryMemoryTags: ["COUNTERMOVE", "EVIDENCE_GATHERED"],
  },
  {
    chapterNumber: 12,
    arc: "rise",
    functionName: "alliance_and_leverage_build",
    wordCountTarget: 2600,
    wordCountRange: [2500, 2800],
    intensity: 0.78,
    dialogueRatio: 0.56,
    hookType: "tension",
    mandatoryElements: [
      "the heroine secures one ally, witness, document, or access she could not reach before",
      "the leverage from chapter 11 is tested and tightened, not just stored",
      "the antagonist makes a confident move that will become their exposure",
      "raise the risk of the heroine's plan so the public confrontation feels earned",
    ],
    forbiddenElements: [
      "the plan succeeding without resistance",
      "a new unrelated subplot that delays the climax",
      "the ally taking over the heroine's agency",
    ],
    craftInstructions: [
      "Keep the rise cumulative: every gain should cost something and narrow the path to one decisive room.",
      "End pointing toward the public arena where the reveal will land.",
    ],
    summaryMemoryTags: ["ALLIANCE_SECURED", "LEVERAGE_TIGHTENED"],
  },
  {
    chapterNumber: 13,
    arc: "climax",
    functionName: "pre_climax_public_setback",
    wordCountTarget: 2700,
    wordCountRange: [2600, 2900],
    intensity: 0.86,
    dialogueRatio: 0.6,
    hookType: "tension",
    mandatoryElements: [
      "the heroine's plan meets a real, public setback that looks like defeat",
      "the antagonist appears to win in front of witnesses",
      "the heroine holds one piece of leverage back instead of spending it early",
      "end on the threshold of the decisive confrontation",
    ],
    forbiddenElements: [
      "the public reveal happening here",
      "the setback being a cheap fake-out with no cost",
      "the heroine losing agency to despair",
    ],
    craftInstructions: [
      "This is the last pressure spike before the reveal; the apparent loss must be plausible and costly.",
      "Withhold the decisive evidence so chapter 14 lands as a designed trap, not a coincidence.",
    ],
    summaryMemoryTags: ["PUBLIC_SETBACK", "LEVERAGE_WITHHELD"],
  },
  {
    chapterNumber: 14,
    arc: "climax",
    functionName: "public_trap_confrontation",
    wordCountTarget: 2800,
    wordCountRange: [2600, 3000],
    intensity: 0.9,
    dialogueRatio: 0.62,
    hookType: "revelation",
    mandatoryElements: [
      "public confrontation in the niche's highest-pressure room: council, wedding, boardroom, gala, classroom, court, hospital hearing, pack ritual, alien tribunal, or family table",
      "the heroine times evidence, witness, rule, or confession pressure without screaming",
      "the antagonist pushes back intelligently",
      "resolve every pressure thread named in the story bible's pressureThreads list here — not only the one backed by the strongest physical evidence; if any thread (social, emotional, dignity, family) still lacks a concrete on-page resolution beat, deliver it in this chapter",
      "end with the decisive truth exposed but emotional outcome unfinished",
    ],
    forbiddenElements: [
      "summary monologue that replaces scene action",
      "the male lead or outside authority takes over the reveal",
      "instant happy ending",
    ],
    craftInstructions: [
      "Every dialogue line should carry subtext, threat, status, denial, or leverage.",
      "Truth should land coldly through evidence and timing, not volume.",
    ],
    summaryMemoryTags: ["PUBLIC_TRAP", "DECISIVE_TRUTH"],
  },
  {
    chapterNumber: 15,
    arc: "resolution",
    functionName: "climax_aftershock_new_equilibrium",
    wordCountTarget: 1900,
    wordCountRange: [1700, 2000],
    intensity: 0.56,
    dialogueRatio: 0.4,
    hookType: "irony",
    mandatoryElements: [
      "resolve the public consequence without opening a new plot thread",
      "show the heroine choosing dignity, power, love, departure, or conditional reconciliation on her own terms",
      "close the romantic/status/family/institutional wound with one precise aftershock scene",
      "leave a clean new equilibrium rather than a second climax",
    ],
    forbiddenElements: [
      "new villain",
      "new betrayal",
      "second climax",
      "carrying an unresolved pressure thread over from the climax chapter — every pressureThreads item must already be closed before this chapter begins",
      "heroine agency transferred to another character",
      "ending over 2,000 words",
    ],
    craftInstructions: [
      "The final chapter should feel earned and quieter than the public reveal.",
      "If the ending is romantic, make love conditional on respect; if it is separation, make it emotionally complete rather than punitive noise.",
    ],
    summaryMemoryTags: ["NEW_EQUILIBRIUM", "DIGNITY_ENDING"],
  },
];

// Template for a chapter inserted into the rise arc when the planner requests 16
// or 17 chapters. It carries generic "sustain the rise" content: add fresh
// leverage/pressure before the climax without resolving anything. Word count and
// intensity match the canonical rise chapters (11/12) so the pacing curve stays
// smooth. Only used for total > 15; total === 15 never inserts anything.
const RISE_SUSTAIN_TEMPLATE: Omit<ChapterArchitecture, "chapterNumber" | "summaryMemoryTags"> = {
  arc: "rise",
  functionName: "rise_sustain_pressure",
  wordCountTarget: 2600,
  wordCountRange: [2500, 2800],
  intensity: 0.8,
  dialogueRatio: 0.55,
  hookType: "tension",
  mandatoryElements: [
    "add one fresh piece of leverage, evidence, ally, or information the heroine did not have before",
    "raise the cost or risk of the heroine's plan so the coming public confrontation feels earned",
    "the antagonist makes a confident move that will later become part of their exposure",
    "keep the heroine's agency visible through a concrete choice, not a plan speech",
  ],
  forbiddenElements: [
    "repeating the previous rise chapter's beat with new wording",
    "resolving the central conflict early",
    "an outside party taking over the heroine's plan",
    "a new unrelated subplot that delays the climax",
  ],
  craftInstructions: [
    "This is an added rise/breathing chapter before the climax: it must add new information and tighten the path to one decisive room, never stall or recap.",
    "Keep the rise cumulative and strategic; every gain should cost something and narrow the path to the public confrontation.",
  ],
};

/**
 * Build the chapter architecture for a given total chapter count (15-17).
 *
 * For total === 15 this returns the canonical array by reference, so the
 * default path is byte-identical to before this feature existed. For 16/17 it
 * inserts extra rise-arc chapters right after the last canonical rise chapter
 * (ch12), then renumbers sequentially. Setup/escalation/break/pivot beats keep
 * their exact positions, so every mandatoryElements text that references a
 * chapter number (3/7/9/10) stays accurate; only the climax + resolution
 * chapters slide down by the delta, matching resolveKeyChapters.
 */
export function buildDrama15ChapterArchitecture(
  total: number = DRAMA15_FIXED_CHAPTER_COUNT,
): ChapterArchitecture[] {
  const clamped = clampChapterCount(total);
  if (clamped === DRAMA15_FIXED_CHAPTER_COUNT) {
    return DRAMA15_CHAPTER_ARCHITECTURE;
  }

  const delta = clamped - DRAMA15_FIXED_CHAPTER_COUNT;
  const lastRiseIndex = DRAMA15_CHAPTER_ARCHITECTURE.map((chapter) => chapter.arc).lastIndexOf("rise");
  const before = DRAMA15_CHAPTER_ARCHITECTURE.slice(0, lastRiseIndex + 1);
  const after = DRAMA15_CHAPTER_ARCHITECTURE.slice(lastRiseIndex + 1);
  const inserted: ChapterArchitecture[] = Array.from({ length: delta }, (_unused, index) => ({
    ...RISE_SUSTAIN_TEMPLATE,
    chapterNumber: 0, // renumbered below
    summaryMemoryTags: [`RISE_SUSTAIN_${index + 1}`, "LEVERAGE_BUILD"],
  }));

  return [...before, ...inserted, ...after].map((chapter, index) => ({
    ...chapter,
    chapterNumber: index + 1,
  }));
}

const ARC_PROSE_PROFILES: Record<string, string> = {
  setup: "sensory grounded, fast commercial entry, clear social rules, concrete status pressure, no lore dump",
  escalation: "dialogue-led status pressure, tighter paragraphing, public comparison, visible cost",
  break: "bare, consequence-heavy prose with short lines and minimal explanation",
  pivot: "quiet, precise interior clarity translated into one concrete action",
  rise: "cooler, more strategic prose where the heroine speaks less and chooses more",
  climax: "high-dialogue confrontation, exact evidence timing, no screaming summary monologue",
  resolution: "short aftershock prose; every sentence carries choice, consequence, or release",
};

const PROMPT_TEMPLATE_STYLE_LOCKS: Record<number, string> = {
  1: "chapter 1 opens in-scene with niche pressure already active; no character biography, no encyclopedic worldbuilding.",
  2: "chapter 2 deepens the central relationship and stakes with a fresh scene; it must not restate chapter 1's hook.",
  3: `chapter ${K.foreshadowPlant} plants one concrete detail for chapter ${K.foreshadowActivate} while deepening public expectation or romantic/status dependence.`,
  4: "chapter 4 gives false safety through an active choice and ends with an ominous detail that only later becomes clear.",
  5: "chapter 5 makes pressure public and costly; the rival or status force wins by plausible rules, not cartoon villainy.",
  6: "chapter 6 tightens the trap and isolates the heroine while leaving one deniable point of hope before the reveal.",
  7: `chapter ${K.foreshadowActivate} activates the chapter ${K.foreshadowPlant} detail and reveals designed betrayal without full revenge or a villain monologue.`,
  8: "chapter 8 offers false hope that curdles and complicates the betrayal; it adds information and avoids a third straight peak.",
  9: `chapter ${K.nadir} is the no-rescue nadir; survival is allowed, victory is not.`,
  10: `chapter ${K.pivot} is the quiet pivot; the heroine makes a private irreversible choice and recovers one usable truth or tool.`,
  11: "chapter 11 builds the countermove through concrete evidence gathering and visible cost, not plan explanation.",
  12: "chapter 12 secures an ally or leverage and tightens the plan toward one decisive public room.",
  13: "chapter 13 is the pre-climax public setback; the antagonist seems to win while the heroine withholds her decisive leverage.",
  14: `chapter ${K.publicReveal} is the public trap; evidence, timing, and rules expose the decisive truth while emotional outcome stays unfinished.`,
  15: `chapter ${K.resolution} is a short aftershock under 2,000 words; no new plot thread, no second climax, and agency stays with the heroine.`,
};

export function renderIntensityInstruction(intensity: number) {
  // Intensity must live in CONTENT and RHYTHM CONTRAST, not in a flat command to
  // keep every sentence short. Ordering the model to make "short sentences
  // dominate" produced choppy, machine-like prose because it collapsed sentence
  // variance. Instead, high intensity now means a sharper mix — long build lines
  // snapping into short punch lines — while the pressure comes from stakes,
  // silence, and consequence. This keeps human length variance (cv ≥ 0.65) alive.
  if (intensity >= 0.9) {
    return `Intensity ${intensity}: keep the pressure high through stakes, silence, and consequence — not through uniformly short sentences. Contrast a few longer, tightening lines with sudden short punch lines; strip decorative adjectives and avoid long explanatory interior monologue.`;
  }

  if (intensity >= 0.84) {
    return `Intensity ${intensity}: drive the scene with contrast — build with longer clause-carrying sentences, then cut to short lines at the pressure points. Do not flatten every sentence to the same short length; keep interior explanation lean.`;
  }

  if (intensity >= 0.75) {
    return `Intensity ${intensity}: mix medium and long sentences with short lines that mark pressure points; let rhythm vary rather than settling into one length.`;
  }

  return `Intensity ${intensity}: allow longer setup sentences, sensory grounding, and calmer scene rhythm, still varying sentence length so the prose never reads flat.`;
}

function renderHookExecution(hookType: ChapterArchitecture["hookType"]) {
  switch (hookType) {
    case "tension":
      return "Hook execution: tension ending; stop before the conflict resolves.";
    case "revelation":
      return "Hook execution: revelation ending; reveal one concrete truth, then stop after a minimal reaction beat.";
    case "curiosity":
      return "Hook execution: curiosity ending; end on a specific odd detail, not an explained mystery.";
    case "irony":
      return "Hook execution: irony ending; let readers understand more than the protagonist without blunt explanation.";
  }
}

function renderDialogueExecution(dialogueRatio: number) {
  return `Dialogue execution: target ${Math.round(dialogueRatio * 100)}% quoted speech; include action beats and silence as part of dialogue. No quoted speech turn over 80 words.`;
}

export function getDrama15ChapterArchitecture(
  chapterNumber: number,
  totalChapters: number = DRAMA15_FIXED_CHAPTER_COUNT,
) {
  return buildDrama15ChapterArchitecture(totalChapters).find(
    (chapter) => chapter.chapterNumber === chapterNumber,
  );
}

export function getDrama15ChapterOperationalWordCountRange(
  chapterNumber: number,
  totalChapters: number = DRAMA15_FIXED_CHAPTER_COUNT,
): [number, number] | undefined {
  const architecture = getDrama15ChapterArchitecture(chapterNumber, totalChapters);
  if (!architecture) {
    return undefined;
  }

  if (architecture.chapterNumber === clampChapterCount(totalChapters)) {
    return architecture.wordCountRange;
  }

  if (architecture.wordCountRange[0] === architecture.wordCountRange[1]) {
    return [
      architecture.wordCountTarget - DRAMA15_EXACT_WORD_COUNT_OPERATIONAL_TOLERANCE,
      architecture.wordCountTarget + DRAMA15_EXACT_WORD_COUNT_OPERATIONAL_TOLERANCE,
    ];
  }

  return architecture.wordCountRange;
}

export function renderDrama15ArchitectureOverview() {
  return [
    `Total architecture: ${DRAMA15_FIXED_CHAPTER_COUNT} chapters, about ${DRAMA15_TOTAL_TARGET_WORDS.toLocaleString("en-US")} words overall.`,
    "Seven arcs: setup ch1-3, escalation ch4-6, break ch7-9, pivot ch10, rise ch11-12, public climax ch13-14, short resolution ch15.",
    `Critical locks: ch${K.foreshadowPlant} plants a concrete foreshadow detail; ch${K.foreshadowActivate} activates it; ch${K.nadir} is maximum loss with no rescue; ch${K.pivot} is earned internal pivot; ch${K.publicReveal} is public reveal; ch${K.resolution} is short new equilibrium.`,
    "Mid-arc durability: chapters 6, 8, 12, and 13 must keep adding fresh pressure or information so the 15-chapter middle never stalls or repeats.",
    "Market inspiration policy: study FictionMe-style niche setup, pacing, stakes, and reader promises; never copy names, chapter events, scene sequence, proprietary twists, or exact plot.",
    `Invariant rules: ${DRAMA15_INVARIANT_RULES.join(" ")}`,
  ].join("\n");
}

// Resolve the template style-lock line for a chapter. For total === 15 this is
// the authored per-chapter lock. For 16/17, inserted rise chapters have no
// authored lock, and the climax/resolution chapters shift down, so we derive a
// lock from the architecture's arc/function instead of reading a fixed index.
function resolveTemplateStyleLock(
  architecture: ChapterArchitecture,
  totalChapters: number,
): string {
  if (clampChapterCount(totalChapters) === DRAMA15_FIXED_CHAPTER_COUNT) {
    return PROMPT_TEMPLATE_STYLE_LOCKS[architecture.chapterNumber] ?? "";
  }

  const keys = resolveKeyChapters(totalChapters);
  if (architecture.chapterNumber === keys.publicReveal) {
    return PROMPT_TEMPLATE_STYLE_LOCKS[K.publicReveal];
  }
  if (architecture.chapterNumber === keys.resolution) {
    return PROMPT_TEMPLATE_STYLE_LOCKS[K.resolution];
  }
  if (PROMPT_TEMPLATE_STYLE_LOCKS[architecture.chapterNumber] && architecture.functionName !== "rise_sustain_pressure") {
    return PROMPT_TEMPLATE_STYLE_LOCKS[architecture.chapterNumber];
  }
  // Inserted rise chapter (or any shifted chapter without an authored lock).
  return `chapter ${architecture.chapterNumber} sustains the rise: add fresh leverage or information and tighten the path to the public confrontation without resolving the conflict or recapping the previous chapter.`;
}

export function renderChapterArchitectureForPrompt(
  chapterNumber: number,
  effectiveTargets?: {
    intensity: number;
    dialogueRatio: number;
    hookDensity: "low" | "medium" | "high";
    hookDensityInstruction?: string;
  },
  totalChapters: number = DRAMA15_FIXED_CHAPTER_COUNT,
) {
  const architecture = getDrama15ChapterArchitecture(chapterNumber, totalChapters);
  if (!architecture) {
    return "";
  }

  const intensity = effectiveTargets?.intensity ?? architecture.intensity;
  const dialogueRatio = effectiveTargets?.dialogueRatio ?? architecture.dialogueRatio;
  const hookDensityLine = effectiveTargets?.hookDensityInstruction
    ? `User hook density (${effectiveTargets.hookDensity}): ${effectiveTargets.hookDensityInstruction}`
    : "";

  return [
    `Chapter ${architecture.chapterNumber} architecture: ${architecture.functionName} (${architecture.arc}).`,
    `Recommended target: ${architecture.wordCountTarget} words, range ${architecture.wordCountRange[0]}-${architecture.wordCountRange[1]}, intensity ${intensity}, dialogue ratio ${dialogueRatio}, hook ${architecture.hookType}.`,
    `Prose profile: ${ARC_PROSE_PROFILES[architecture.arc]}.`,
    renderIntensityInstruction(intensity),
    renderDialogueExecution(dialogueRatio),
    renderHookExecution(architecture.hookType),
    ...(hookDensityLine ? [hookDensityLine] : []),
    `Template style lock: ${resolveTemplateStyleLock(architecture, totalChapters)}`,
    `Mandatory elements: ${architecture.mandatoryElements.join("; ")}.`,
    `Forbidden elements: ${architecture.forbiddenElements.join("; ")}.`,
    `Craft instructions: ${architecture.craftInstructions.join(" ")}`,
  ].join("\n");
}

export function renderChapterPlanArchitectureForPrompt(
  totalChapters: number = DRAMA15_FIXED_CHAPTER_COUNT,
) {
  return buildDrama15ChapterArchitecture(totalChapters).map(
    (chapter) =>
      `Ch.${chapter.chapterNumber} ${chapter.functionName}: ${chapter.mandatoryElements.join("; ")}. Avoid: ${chapter.forbiddenElements.join("; ")}.`,
  ).join("\n");
}
