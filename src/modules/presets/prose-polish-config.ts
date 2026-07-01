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
  const config = JSON.parse(JSON.stringify(LOCAL_PROSE_POLISH_CONFIG)) as LocalProsePolishConfig;
  // A1: the chapter post-process humanizer is a second full-length model pass
  // per chapter that roughly doubles chapter latency. Keep it off unless
  // CHAPTER_POST_PROCESS_ENABLED=true. Inline-prompt prose polish (applyTo) and
  // post-process for shorter targets (settingSeed) are unaffected.
  if (!chapterPostProcessEnabledFromEnv()) {
    config.postProcess.applyTo.chapter = false;
    config.postProcess.applyTo.regenerate = false;
  }
  return config;
}

function chapterPostProcessEnabledFromEnv(): boolean {
  // Read directly from process.env to avoid coupling this preset module to the
  // server env loader (and to stay usable in tests/tools without env setup).
  return process.env.CHAPTER_POST_PROCESS_ENABLED === "true";
}

const VIETNAMESE_AI_TELLS = [
  'sáo ngữ cảm xúc kiểu dịch máy: "trái tim thắt lại", "tim đập loạn nhịp", "khóe mắt cay cay", "nước mắt lăn dài trên má", "thế giới như sụp đổ", "không thể tin vào mắt mình", "một cảm giác khó tả"',
  'trạng từ gượng kiểu "một cách + tính từ" (vd "nói một cách lạnh lùng"); thay bằng động từ mạnh và hành vi cụ thể',
  'lạm dụng "sự", "việc", "điều", "rằng", "khiến cho" làm câu nặng và mang hơi văn dịch',
  'mở câu lặp: "Và rồi", "Bỗng nhiên", "Đột nhiên", "Ngay lúc đó", "Không khí trở nên..."',
  'câu chêm sáo rỗng: "không chỉ... mà còn...", "chính là...", "có thể nói rằng..."',
  'mọi câu cùng một độ dài và một nhịp; thiếu câu ngắn cắt nhịp',
  'giải thích lại cảm xúc vừa tả (vd "cô cảm thấy vô cùng đau khổ") thay vì để hành động, im lặng, cử chỉ tự nói',
];

function isVietnameseOutput(outputLanguage: string): boolean {
  return outputLanguage.trim().toLowerCase().startsWith("viet");
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

  const lines = [
    "Humanizer / prose polish pass:",
    `Mode: ${config.mode}. Output language: ${outputLanguage}.`,
    "Preserve plot facts, character names, chapter number, continuity, reveal timing, required JSON keys, and target output language.",
    "Make prose sound written by a person: varied sentence rhythm, concrete behavior, specific social detail, less neutral summary, and emotion shown through action or silence.",
    `Remove common AI tells: ${config.rules.removeAiTells.join("; ")}.`,
  ];

  if (isVietnameseOutput(outputLanguage)) {
    lines.push(
      `Vì bản thảo viết bằng tiếng Việt, loại bỏ các dấu hiệu văn AI/dịch máy tiếng Việt: ${VIETNAMESE_AI_TELLS.join("; ")}.`,
    );
  }

  lines.push(
    "Keep commercial drama pace: sharp scenes, emotionally legible dialogue, and no literary padding.",
    "Do not add new plot beats, new characters, new setting logic, new moral commentary, or extra aftermath.",
    modeInstruction,
  );

  return lines.join("\n");
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
