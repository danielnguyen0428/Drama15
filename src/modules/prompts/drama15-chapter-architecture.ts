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

export const DRAMA15_TOTAL_TARGET_WORDS = 25_000;
export const DRAMA15_FIXED_CHAPTER_COUNT = 10;
export const DRAMA15_EXACT_WORD_COUNT_OPERATIONAL_TOLERANCE = 100;

export const DRAMA15_INVARIANT_RULES = [
  "No direct cloning from outside novels: borrow only commercial setup patterns, premise energy, social pressure, and pacing logic; all names, scenes, twists, evidence, and outcomes must be original.",
  "FictionMe-style niche pressure: every story should lean into fast hooks, high-status romance tension, betrayal, public humiliation, hidden power, second-chance pressure, and a heroine-led reversal appropriate to its niche.",
  "No deus ex machina: chapters 6 and 7 cannot be rescued by an outside character, sudden money, secret inheritance, or lucky coincidence.",
  "Foreshadow must activate: chapter 2 plants one concrete detail that chapter 5 reuses with a new meaning.",
  "Chapter 10 is a short climax-and-aftershock resolution with a hard cap near 2,000 words.",
  "No three consecutive high-intensity chapters. Chapter 7 acts as the pressure-release/internal-pivot chapter.",
  "Protagonist agency: chapters 7, 8, 9, and 10 must prove the heroine stands up through her own action.",
];

export const DRAMA15_CHAPTER_ARCHITECTURE: ChapterArchitecture[] = [
  {
    chapterNumber: 1,
    arc: "setup",
    functionName: "commercial_hook_world_entry",
    wordCountTarget: 2400,
    wordCountRange: [2300, 2600],
    intensity: 0.68,
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
    functionName: "threat_surface_and_foreshadow",
    wordCountTarget: 2500,
    wordCountRange: [2400, 2700],
    intensity: 0.72,
    dialogueRatio: 0.52,
    hookType: "tension",
    mandatoryElements: [
      "introduce the betrayer, rival, council, family, institution, captor, or status gatekeeper with a positive or neutral surface",
      "plant one concrete foreshadow detail for chapter 5",
      "make the detail ordinary enough that first-time readers do not notice it",
      "deepen attraction, dependence, or public expectation so rejection will hurt more later",
    ],
    forbiddenElements: [
      "revealing the antagonist's true nature",
      "making the heroine clearly suspicious",
      "using a vague feeling as the foreshadow detail",
    ],
    craftInstructions: [
      "The foreshadow must be an action, sentence, object, mismatch, record, scent, document, scar, mark, message, or reaction that can physically reappear in chapter 5.",
      "The chapter surface should still read as normal social, romantic, institutional, or family drama.",
    ],
    summaryMemoryTags: ["FORESHADOW_CH2", "PUBLIC_EXPECTATION"],
  },
  {
    chapterNumber: 3,
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
    chapterNumber: 4,
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
    chapterNumber: 5,
    arc: "break",
    functionName: "betrayal_reveal_foreshadow_activation",
    wordCountTarget: 2700,
    wordCountRange: [2600, 2900],
    intensity: 0.9,
    dialogueRatio: 0.58,
    hookType: "revelation",
    mandatoryElements: [
      "activate the chapter 2 foreshadow detail with a new meaning",
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
    chapterNumber: 6,
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
    chapterNumber: 7,
    arc: "pivot",
    functionName: "internal_pivot_private_choice",
    wordCountTarget: 2400,
    wordCountRange: [2300, 2600],
    intensity: 0.68,
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
    chapterNumber: 8,
    arc: "rise",
    functionName: "countermove_evidence_gathering",
    wordCountTarget: 2600,
    wordCountRange: [2500, 2800],
    intensity: 0.82,
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
    chapterNumber: 9,
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
    chapterNumber: 10,
    arc: "resolution",
    functionName: "climax_aftershock_new_equilibrium",
    wordCountTarget: 1900,
    wordCountRange: [1700, 2000],
    intensity: 0.58,
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
  2: "chapter 2 plants one concrete detail for chapter 5 while deepening public expectation or romantic/status dependence.",
  3: "chapter 3 gives false safety through an active choice and ends with an ominous detail that only later becomes clear.",
  4: "chapter 4 makes pressure public and costly; the rival or status force wins by plausible rules, not cartoon villainy.",
  5: "chapter 5 activates the chapter 2 detail and reveals designed betrayal without full revenge or a villain monologue.",
  6: "chapter 6 is the no-rescue nadir; survival is allowed, victory is not.",
  7: "chapter 7 is quiet pivot; the heroine makes a private irreversible choice and recovers one usable truth or tool.",
  8: "chapter 8 builds the countermove through concrete evidence gathering and visible cost, not plan explanation.",
  9: "chapter 9 is the public trap; evidence, timing, and rules expose the decisive truth while emotional outcome stays unfinished.",
  10: "chapter 10 is a short aftershock under 2,000 words; no new plot thread, no second climax, and agency stays with the heroine.",
};

function renderIntensityInstruction(intensity: number) {
  if (intensity >= 0.9) {
    return `Intensity ${intensity}: very short sentences, no exterior decoration, no spare adjectives, and no explanatory interior monologue.`;
  }

  if (intensity >= 0.84) {
    return `Intensity ${intensity}: short sentences should dominate; keep interior explanation minimal.`;
  }

  if (intensity >= 0.75) {
    return `Intensity ${intensity}: mix medium and short sentences; let short lines mark pressure points.`;
  }

  return `Intensity ${intensity}: allow longer setup sentences, sensory grounding, and calmer scene rhythm.`;
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

export function getDrama15ChapterArchitecture(chapterNumber: number) {
  return DRAMA15_CHAPTER_ARCHITECTURE.find((chapter) => chapter.chapterNumber === chapterNumber);
}

export function getDrama15ChapterOperationalWordCountRange(chapterNumber: number): [number, number] | undefined {
  const architecture = getDrama15ChapterArchitecture(chapterNumber);
  if (!architecture) {
    return undefined;
  }

  if (architecture.chapterNumber === DRAMA15_FIXED_CHAPTER_COUNT) {
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
    "Seven arcs: setup ch1-2, escalation ch3-4, break ch5-6, pivot ch7, rise ch8, public climax ch9, short resolution ch10.",
    "Critical locks: ch2 plants a concrete foreshadow detail; ch5 activates it; ch6 is maximum loss with no rescue; ch7 is earned internal pivot; ch9 is public reveal; ch10 is short new equilibrium.",
    "Market inspiration policy: study FictionMe-style niche setup, pacing, stakes, and reader promises; never copy names, chapter events, scene sequence, proprietary twists, or exact plot.",
    `Invariant rules: ${DRAMA15_INVARIANT_RULES.join(" ")}`,
  ].join("\n");
}

export function renderChapterArchitectureForPrompt(chapterNumber: number) {
  const architecture = getDrama15ChapterArchitecture(chapterNumber);
  if (!architecture) {
    return "";
  }

  return [
    `Chapter ${architecture.chapterNumber} architecture: ${architecture.functionName} (${architecture.arc}).`,
    `Recommended target: ${architecture.wordCountTarget} words, range ${architecture.wordCountRange[0]}-${architecture.wordCountRange[1]}, intensity ${architecture.intensity}, dialogue ratio ${architecture.dialogueRatio}, hook ${architecture.hookType}.`,
    `Prose profile: ${ARC_PROSE_PROFILES[architecture.arc]}.`,
    renderIntensityInstruction(architecture.intensity),
    renderDialogueExecution(architecture.dialogueRatio),
    renderHookExecution(architecture.hookType),
    `Template style lock: ${PROMPT_TEMPLATE_STYLE_LOCKS[architecture.chapterNumber]}`,
    `Mandatory elements: ${architecture.mandatoryElements.join("; ")}.`,
    `Forbidden elements: ${architecture.forbiddenElements.join("; ")}.`,
    `Craft instructions: ${architecture.craftInstructions.join(" ")}`,
  ].join("\n");
}

export function renderChapterPlanArchitectureForPrompt() {
  return DRAMA15_CHAPTER_ARCHITECTURE.map(
    (chapter) =>
      `Ch.${chapter.chapterNumber} ${chapter.functionName}: ${chapter.mandatoryElements.join("; ")}. Avoid: ${chapter.forbiddenElements.join("; ")}.`,
  ).join("\n");
}
