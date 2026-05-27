export type ProsePolishMode = "off" | "light" | "strong";

export type ProsePolishTarget = "settingSeed" | "concept" | "chapter" | "regenerate";

export type LocalProsePolishConfig = {
  mode: ProsePolishMode;
  applyTo: Record<ProsePolishTarget, boolean>;
  postProcess: {
    enabled: boolean;
    applyTo: Record<ProsePolishTarget, boolean>;
  };
  rules: {
    preserve: string[];
    removeAiTells: string[];
    addHumanTexture: string[];
  };
};

export const LOCAL_PROSE_POLISH_CONFIG: LocalProsePolishConfig = {
  mode: "light",
  applyTo: {
    settingSeed: true,
    concept: true,
    chapter: true,
    regenerate: true,
  },
  postProcess: {
    enabled: true,
    applyTo: {
      settingSeed: true,
      concept: false,
      chapter: true,
      regenerate: true,
    },
  },
  rules: {
    preserve: [
      "plot facts",
      "character names",
      "chapter number",
      "continuity",
      "reveal timing",
      "required JSON keys",
      "target output language",
    ],
    removeAiTells: [
      "inflated significance",
      "promotional adjectives",
      "vague attribution",
      "superficial -ing analysis",
      "forced rule-of-three",
      "synonym cycling",
      "not-only-but-also phrasing",
      "em dash overuse",
      "stock AI words such as crucial, pivotal, vibrant, showcases, underscores, and tapestry",
    ],
    addHumanTexture: [
      "varied sentence rhythm",
      "concrete behavior",
      "specific social detail",
      "emotion shown through action and silence",
      "dialogue that carries status, threat, denial, or subtext",
    ],
  },
};

export function getLocalProsePolishConfig(): LocalProsePolishConfig {
  return JSON.parse(JSON.stringify(LOCAL_PROSE_POLISH_CONFIG)) as LocalProsePolishConfig;
}

export function renderProsePolishInstructions(
  config: LocalProsePolishConfig | undefined,
  target: ProsePolishTarget,
  outputLanguage: string,
) {
  if (!config || config.mode === "off" || !config.applyTo[target]) {
    return "";
  }

  const modeInstruction = config.mode === "strong"
    ? "Strong mode: rewrite stiff phrasing aggressively while still preserving every story fact."
    : "Light mode: polish sentence rhythm and remove obvious AI tells without changing story logic.";

  return [
    "Humanizer / prose polish pass:",
    `Mode: ${config.mode}. Output language: ${outputLanguage}.`,
    "Preserve plot facts, character names, chapter number, continuity, reveal timing, required JSON keys, and target output language.",
    "Make prose sound written by a person: varied sentence rhythm, concrete behavior, specific social detail, less neutral summary, and emotion shown through action or silence.",
    `Remove common AI tells: ${config.rules.removeAiTells.join("; ")}.`,
    "Keep commercial drama pace: sharp scenes, emotionally legible dialogue, and no literary padding.",
    "Do not add new plot beats, new characters, new setting logic, new moral commentary, or extra aftermath.",
    modeInstruction,
  ].join("\n");
}

export function shouldRunProsePostProcess(
  config: LocalProsePolishConfig | undefined,
  target: ProsePolishTarget,
) {
  return Boolean(
    config &&
      config.mode !== "off" &&
      config.postProcess.enabled &&
      config.postProcess.applyTo[target],
  );
}
