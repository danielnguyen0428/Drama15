/**
 * Propagation Ledger — tracks "propagation debt" across the co-evolving layers
 * (autonovel state.json propagation tracking).
 *
 * When a higher layer commits to something (a foreshadow plant, a planned plot
 * beat, a late hard fact), lower layers must pay it off. This module turns the
 * continuity tracker's foreshadow / plot-beat / fact data into an explicit list
 * of unpaid debts so the studio can flag chapters that still need attention:
 *
 *  - missed_foreshadow : a plant was never activated.
 *  - pending_foreshadow: a plant exists but its payoff chapter never recorded.
 *  - unachieved_beat   : a planned chapter beat was not marked achieved.
 *  - late_fact         : a hard fact first established late in the book, with no
 *                        earlier setup — earlier chapters may need a plant.
 *
 * Pure and deterministic (no LLM, no I/O) so it is fully unit-testable.
 */

import type { ForeshadowItem, PlotBeat } from "../continuity-tracker";

export type PropagationDebtKind =
  | "missed_foreshadow"
  | "pending_foreshadow"
  | "unachieved_beat"
  | "late_fact";

export type PropagationDebt = {
  kind: PropagationDebtKind;
  detail: string;
  chapters: number[];
  severity: "low" | "medium" | "high";
};

export type LateFactInput = {
  chapterNumber: number;
  fact: string;
  confidence: string;
};

export type PropagationLedgerInput = {
  foreshadow: {
    planted: ForeshadowItem[];
    activated: ForeshadowItem[];
    missed: ForeshadowItem[];
  };
  plotBeats: { beats: PlotBeat[] };
  /** Newly-established hard facts across chapters (for late-fact detection). */
  establishedFacts?: LateFactInput[];
  /** Chapters at/after this index count as "late" for late-fact debt. Default 14. */
  lateFactChapterThreshold?: number;
  totalChapters?: number;
  /** Cap on late_fact debts emitted (avoids flooding from a single busy chapter). Default 5. */
  maxLateFacts?: number;
};

export function buildPropagationLedger(input: PropagationLedgerInput): PropagationDebt[] {
  const debts: PropagationDebt[] = [];

  for (const item of input.foreshadow.missed) {
    debts.push({
      kind: "missed_foreshadow",
      detail: `Mạch gài (chương ${item.plantedInChapter}) không được trả: ${item.detail}`,
      chapters: [item.plantedInChapter],
      severity: "high",
    });
  }

  // A still-"planted" item that was never activated is also a debt (pending).
  for (const item of input.foreshadow.planted) {
    debts.push({
      kind: "pending_foreshadow",
      detail: `Mạch gài ở chương ${item.plantedInChapter} chưa thấy đoạn trả: ${item.detail}`,
      chapters: [item.plantedInChapter],
      severity: "medium",
    });
  }

  for (const beat of input.plotBeats.beats) {
    if (!beat.achieved) {
      debts.push({
        kind: "unachieved_beat",
        detail: `Chương ${beat.chapterNumber} chưa đạt beat đã hoạch định: ${beat.plannedBeat}`,
        chapters: [beat.chapterNumber],
        severity: "medium",
      });
    }
  }

  const lateThreshold = input.lateFactChapterThreshold ?? Math.max(12, (input.totalChapters ?? 15) - 1);
  const maxLateFacts = input.maxLateFacts ?? 5;
  let lateFactCount = 0;
  for (const fact of input.establishedFacts ?? []) {
    if (lateFactCount >= maxLateFacts) {
      break;
    }
    if (fact.chapterNumber >= lateThreshold && isHardConfidence(fact.confidence)) {
      debts.push({
        kind: "late_fact",
        detail: `Sự thật cứng xuất hiện muộn (chương ${fact.chapterNumber}) mà chưa được gài trước: ${fact.fact}`,
        chapters: [fact.chapterNumber],
        severity: "low",
      });
      lateFactCount += 1;
    }
  }

  // Stable, useful ordering: severity desc, then earliest chapter.
  const weight: Record<PropagationDebt["severity"], number> = { high: 3, medium: 2, low: 1 };
  return debts.sort(
    (a, b) => weight[b.severity] - weight[a.severity] || (a.chapters[0] ?? 0) - (b.chapters[0] ?? 0),
  );
}

function isHardConfidence(confidence: string): boolean {
  const normalized = confidence.toLowerCase();
  return normalized === "explicit" || normalized === "established" || normalized === "high";
}
