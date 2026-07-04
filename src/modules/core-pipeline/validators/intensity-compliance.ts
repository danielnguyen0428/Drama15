/**
 * Intensity-Compliance Detector — Shared Core
 *
 * The chapter architecture and the user's intensity slider resolve to a target
 * intensity per chapter, but until now intensity was a *soft instruction only*:
 * the prompt asked for it, yet nothing measured whether the drafted prose
 * actually matched. Dialogue ratio and hook density both have gates; intensity
 * had none, so it silently drifted.
 *
 * Intensity in this system is expressed mainly through sentence rhythm: high
 * intensity => short, clipped sentences and little interior explanation; low
 * intensity => longer setup sentences and calmer rhythm (see
 * `renderIntensityInstruction`). Mean sentence length in words is therefore a
 * reasonable, language-light proxy for delivered intensity.
 *
 * This detector maps the target intensity to an expected mean-sentence-length
 * band, then flags only a CLEAR mismatch (prose much slower/longer than a high
 * target asks, or much choppier than a low target asks). It is deliberately
 * lenient — a soft tie-breaker, never a hard block — so it nudges without
 * fighting legitimate stylistic variation.
 *
 * Mirrors the sibling detectors: a report + `needsRepair` + repair builder.
 * Shared by both the desktop orchestrator and the web API engine.
 */

import { analyzeSentenceVariance } from "./sentence-variance";

export type IntensityComplianceReport = {
  targetIntensity: number;
  meanSentenceLengthWords: number;
  expectedMaxMeanWords: number;
  expectedMinMeanWords: number;
  direction: "too_slow" | "too_choppy" | "ok";
  needsRepair: boolean;
};

// Map a target intensity to an acceptable mean-sentence-length window (words).
// Higher intensity => shorter mean. The windows are wide on purpose: we only
// want to catch prose that clearly ignores the intensity dial, not to police
// every sentence. Bands mirror the tiers in `renderIntensityInstruction`
// (0.90 / 0.84 / 0.75).
function expectedMeanWindow(intensity: number): { min: number; max: number } {
  if (intensity >= 0.9) return { min: 6, max: 16 };
  if (intensity >= 0.84) return { min: 7, max: 18 };
  if (intensity >= 0.75) return { min: 8, max: 21 };
  return { min: 9, max: 26 };
}

// Only flag when the mean sits well outside the window, so ordinary variation
// does not trip the gate. A chapter needs enough sentences to measure reliably.
const MIN_SENTENCES_TO_JUDGE = 8;
const SLACK_WORDS = 3;

export function detectIntensityCompliance(
  text: string,
  targetIntensity: number,
): IntensityComplianceReport {
  const variance = analyzeSentenceVariance(text);
  const { min, max } = expectedMeanWindow(targetIntensity);
  const mean = variance.meanLengthWords;

  let direction: IntensityComplianceReport["direction"] = "ok";
  let needsRepair = false;

  if (variance.sentenceCount >= MIN_SENTENCES_TO_JUDGE) {
    if (mean > max + SLACK_WORDS) {
      direction = "too_slow";
      needsRepair = true;
    } else if (mean < min - SLACK_WORDS) {
      direction = "too_choppy";
      needsRepair = true;
    }
  }

  return {
    targetIntensity,
    meanSentenceLengthWords: Math.round(mean * 10) / 10,
    expectedMaxMeanWords: max,
    expectedMinMeanWords: min,
    direction,
    needsRepair,
  };
}

export function buildIntensityComplianceRepairInstructions(
  report: IntensityComplianceReport,
): string {
  if (!report.needsRepair) return "";

  const header = [
    "INTENSITY-COMPLIANCE REPAIR INSTRUCTION",
    "",
    `Target intensity for this chapter is ${report.targetIntensity.toFixed(2)}. `
      + `Mean sentence length is ${report.meanSentenceLengthWords} words `
      + `(expected roughly ${report.expectedMinMeanWords}-${report.expectedMaxMeanWords}).`,
    "",
  ];

  if (report.direction === "too_slow") {
    header.push(
      "The prose is too slow for this intensity. Cut sentences shorter:",
      "- Break long, clause-heavy sentences into clipped ones.",
      "- Remove interior explanation and decorative description.",
      "- Let short lines mark the pressure points; raise the pace to match the target.",
    );
  } else if (report.direction === "too_choppy") {
    header.push(
      "The prose is too choppy for this intensity. Let it breathe:",
      "- Merge some fragments into fuller sentences with subordinate clauses.",
      "- Allow calmer setup rhythm and sensory grounding.",
      "- Reserve very short lines for genuine pressure points, not every line.",
    );
  }

  header.push(
    "",
    "Keep all plot facts, character names, and dialogue meaning identical. Only adjust sentence rhythm and pacing to match the target intensity.",
  );

  return header.join("\n");
}
