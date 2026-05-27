import assert from "node:assert/strict";
import test from "node:test";

import { analyzeChapterQuality, needsChapterRetry } from "../../src/modules/validators/chapter-quality";

const balancedSentenceBank = [
  "\"Stay,\" she said.",
  "The elevator doors closed.",
  "The investors kept watching from the next table, their forks suspended above untouched dessert, while the chairman read the wrong name again and waited for her to flinch.",
  "\"I stayed because the truth needed a witness tonight, and because you were counting on my silence,\" Lina said.",
  "No one moved.",
  "\"Then listen while I finish the story you tried to bury,\" she said, opening the folder with both hands.",
];

function repeatSentences(sentences: string[], count: number) {
  return Array.from({ length: count }, (_, index) => sentences[index % sentences.length]).join(" ");
}

test("analyzeChapterQuality ignores chapter word-count drift as a retry gate", () => {
  const veryShortText = Array.from({ length: 20 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");
  const veryLongText = Array.from({ length: 500 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const shortMetrics = analyzeChapterQuality(
    veryShortText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
    "english",
    7,
  );
  const longMetrics = analyzeChapterQuality(
    veryLongText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
    "english",
    7,
  );

  assert.equal(shortMetrics.wordCount, 200);
  assert.equal(longMetrics.wordCount, 5000);
  assert.equal(shortMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(longMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(shortMetrics), false);
  assert.equal(needsChapterRetry(longMetrics), false);
});

test("analyzeChapterQuality flags drafts that miss the dialogue floor", () => {
  const text = [
    ...Array.from({ length: 260 }, () => "She stood very still and thought about the humiliation."),
    "\"Only one short line of dialogue,\" he said.",
  ].join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(needsChapterRetry(metrics), true);
  assert.match(metrics.failures.join(" "), /dialogue ratio/i);
});

test("analyzeChapterQuality leaves balanced drafts alone", () => {
  const text = repeatSentences(balancedSentenceBank, 84);

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.wordCount >= 1020 && metrics.wordCount <= 1440, true);
  assert.equal(metrics.dialogueRatio >= 0.25, true);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality does not fail ultra-short paragraph streaks", () => {
  const text = Array.from({ length: 10 }, () => "\"Stay,\" she said.").join("\n\n");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.maxShortParagraphStreak, 10);
  assert.equal(metrics.failures.includes("too many ultra-short fragment paragraphs in a row"), false);
});

test("analyzeChapterQuality counts smart-quoted dialogue as dialogue", () => {
  const text = repeatSentences([
    "\u201cStay,\u201d she said.",
    "The elevator doors closed.",
    "The investors kept watching from the next table, their forks suspended above untouched dessert, while the chairman read the wrong name again and waited for her to flinch.",
    "\u201cI stayed because the truth needed a witness tonight, and because you were counting on my silence,\u201d Lina said.",
    "No one moved.",
    "\u201cThen listen while I finish the story you tried to bury,\u201d she said, opening the folder with both hands.",
  ], 84);

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.dialogueRatio > 0.25, true);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality scales the dialogue threshold from requested controls", () => {
  const text = repeatSentences([
    "\"Please do not leave me alone at this table tonight,\" Lina said softly.",
    "The investors watched her silent face from across the ballroom without offering rescue, while the chairman kept reading the wrong name from the card.",
    "Rain fell.",
    "A waiter moved the untouched champagne away from her hand as if even the glass had learned to obey the family.",
  ], 80);

  const lowDialogueTarget = analyzeChapterQuality(text, {
    targetWordsPerChapter: 900,
    dialogueRatio: 0.2,
    hookDensity: "medium",
  });
  const highDialogueTarget = analyzeChapterQuality(text, {
    targetWordsPerChapter: 900,
    dialogueRatio: 0.6,
    hookDensity: "medium",
  });

  assert.equal(needsChapterRetry(lowDialogueTarget), false);
  assert.equal(needsChapterRetry(highDialogueTarget), true);
  assert.match(highDialogueTarget.failures.join(" "), /dialogue ratio/i);
});

test("analyzeChapterQuality tolerates a small word-count overflow buffer", () => {
  const text = Array.from({ length: 145 }, () =>
    "\"Yes\" one two three four five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.2,
    hookDensity: "medium",
  });

  assert.equal(metrics.wordCount, 1450);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality does not reject drafts beyond the previous maximum chapter size", () => {
  const text = Array.from({ length: 151 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.2,
    hookDensity: "medium",
  });

  assert.equal(metrics.wordCount, 1510);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality accepts a 2500-word target near the long chapter ceiling", () => {
  const text = Array.from({ length: 300 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 2500,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.wordCount, 3000);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality accepts 2500-word chapters between 2750 and 3000 words", () => {
  const text = Array.from({ length: 290 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 2500,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.wordCount, 2900);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality does not fail 2500-word chapters below the previous floor", () => {
  const acceptedText = Array.from({ length: 200 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");
  const tooShortText = Array.from({ length: 199 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const acceptedMetrics = analyzeChapterQuality(acceptedText, {
    targetWordsPerChapter: 2500,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });
  const tooShortMetrics = analyzeChapterQuality(tooShortText, {
    targetWordsPerChapter: 2500,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(acceptedMetrics.wordCount, 2000);
  assert.equal(acceptedMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(acceptedMetrics), false);
  assert.equal(tooShortMetrics.wordCount, 1990);
  assert.equal(tooShortMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(tooShortMetrics), false);
});

test("analyzeChapterQuality counts Japanese prose by word-like CJK units instead of whitespace", () => {
  const japaneseSentence = "「私はもうあなたの影ではありません」と美奈は静かに言った。会場の視線が彼女の背筋をまっすぐにした。";
  const text = Array.from({ length: 100 }, () => japaneseSentence).join("");

  const metrics = analyzeChapterQuality(
    text,
    {
      targetWordsPerChapter: 1200,
      dialogueRatio: 0.2,
      hookDensity: "medium",
    },
    "japanese",
  );

  assert.equal(metrics.wordCount >= 1020 && metrics.wordCount <= 1500, true);
  assert.equal(metrics.dialogueRatio > 0.2, true);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality does not reject a 2500-word target beyond the previous long chapter ceiling", () => {
  const text = Array.from({ length: 301 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(text, {
    targetWordsPerChapter: 2500,
    dialogueRatio: 0.55,
    hookDensity: "high",
  });

  assert.equal(metrics.wordCount, 3010);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality does not enforce the chapter 10 short ending cap as a retry gate", () => {
  const acceptedText = Array.from({ length: 190 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");
  const tooLongText = Array.from({ length: 201 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const acceptedMetrics = analyzeChapterQuality(
    acceptedText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.35,
      hookDensity: "medium",
    },
    "english",
    10,
  );
  const tooLongMetrics = analyzeChapterQuality(
    tooLongText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.35,
      hookDensity: "medium",
    },
    "english",
    10,
  );

  assert.equal(acceptedMetrics.wordCount, 1900);
  assert.equal(acceptedMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(acceptedMetrics), false);
  assert.equal(tooLongMetrics.wordCount, 2010);
  assert.equal(tooLongMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(tooLongMetrics), false);
});

test("analyzeChapterQuality reports word count without enforcing chapter architecture length", () => {
  const legacyControls = {
    targetWordsPerChapter: 1200,
    dialogueRatio: 0.55,
    hookDensity: "high" as const,
  };
  const architectureLengthText = Array.from({ length: 250 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");
  const legacyLengthText = Array.from({ length: 120 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const acceptedMetrics = analyzeChapterQuality(architectureLengthText, legacyControls, "english", 7);
  const rejectedMetrics = analyzeChapterQuality(legacyLengthText, legacyControls, "english", 7);

  assert.equal(acceptedMetrics.wordCount, 2500);
  assert.equal(acceptedMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(acceptedMetrics), false);
  assert.equal(rejectedMetrics.wordCount, 1200);
  assert.equal(rejectedMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(rejectedMetrics), false);
});

test("analyzeChapterQuality allows small measurement drift for exact architecture targets", () => {
  const nearExactText = Array.from({ length: 253 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const metrics = analyzeChapterQuality(
    nearExactText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
    "english",
    7,
  );

  assert.equal(metrics.wordCount, 2530);
  assert.equal(metrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(metrics), false);
});

test("analyzeChapterQuality allows production drift for exact 2500-word architecture chapters", () => {
  const acceptedText = Array.from({ length: 275 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");
  const tooLongText = Array.from({ length: 276 }, () =>
    "\"Yes one two three four\" five six seven eight nine",
  ).join(" ");

  const acceptedMetrics = analyzeChapterQuality(
    acceptedText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
    "english",
    7,
  );
  const tooLongMetrics = analyzeChapterQuality(
    tooLongText,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
    "english",
    7,
  );

  assert.equal(acceptedMetrics.wordCount, 2750);
  assert.equal(acceptedMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(acceptedMetrics), false);
  assert.equal(tooLongMetrics.wordCount, 2760);
  assert.equal(tooLongMetrics.failures.includes("word count drifted outside the allowed chapter range"), false);
  assert.equal(needsChapterRetry(tooLongMetrics), false);
});

test("analyzeChapterQuality uses chapter architecture dialogue ratio over global controls", () => {
  const text = Array.from({ length: 230 }, () =>
    "\"one two\" three four five six seven eight nine ten",
  ).join(" ");

  const metrics = analyzeChapterQuality(
    text,
    {
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.65,
      hookDensity: "high",
    },
    "english",
    10,
  );

  assert.equal(metrics.wordCount, 2300);
  assert.equal(Math.round(metrics.dialogueRatio * 100), 20);
  assert.equal(metrics.failures.includes("dialogue ratio is materially below the requested target"), false);
  assert.equal(needsChapterRetry(metrics), false);
});
