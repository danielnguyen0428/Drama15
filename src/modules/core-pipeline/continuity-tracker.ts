/**
 * Continuity Tracker — enhanced version of createContinuityLite().
 *
 * Tracks character state progression, foreshadow items, plot beats, and
 * established facts across all 15 chapters. Renders to prompt-friendly context
 * for LLM chapter drafting.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

import type { StoryBible, ChapterPlanItem, ContinuityLite } from "./pipeline-types";
import type { CharacterFactSheet } from "./character-memory-store";
import { DRAMA15_KEY_CHAPTERS } from "../prompts/drama15-chapter-architecture";

export interface ForeshadowItem {
  plantedInChapter: number;
  detail: string;
  activatedInChapter?: number;
  status: "planted" | "activated" | "missed";
}

export interface PlotBeat {
  chapterNumber: number;
  plannedBeat: string;
  achieved: boolean;
  summary?: string;
}

export interface ContinuityTrackerOptions {
  storyBible: StoryBible;
  chapterPlan: ChapterPlanItem[];
}

/** Minimal chapter shape needed by the continuity tracker — avoids PipelineChapter coupling. */
export interface MinimalChapterRef {
  chapterNumber: number;
  title: string;
  summary: string;
  text: string;
}

export class ContinuityTracker {
  private heroineName: string;
  private betrayerName: string;
  private rivalName: string;
  private coreReveal: string;
  private endingMode: string;
  private foreshadowItems: ForeshadowItem[] = [];
  private plotBeats: PlotBeat[] = [];
  private characterFacts: Map<number, CharacterFactSheet> = new Map();
  private chapterStates: Map<number, { heroineAgency: number; emotionalTemperature: string }> = new Map();
  private canonFacts: string[] = [];

  constructor(options: ContinuityTrackerOptions) {
    this.heroineName = options.storyBible.heroine.name;
    this.betrayerName = options.storyBible.betrayer.name;
    this.rivalName = options.storyBible.rival.name;
    this.coreReveal = options.storyBible.betrayalEngine;
    this.endingMode = options.storyBible.endingMode;

    // Initialize plot beats from chapter plan
    for (const plan of options.chapterPlan) {
      this.plotBeats.push({
        chapterNumber: plan.chapterNumber,
        plannedBeat: plan.mainBeat,
        achieved: false,
      });
    }

    // Identify foreshadow: the plant chapter sets it up, the activation chapter pays it off.
    const plantChapterNumber = DRAMA15_KEY_CHAPTERS.foreshadowPlant;
    const plantChapter = options.chapterPlan.find((chapter) => chapter.chapterNumber === plantChapterNumber);
    if (plantChapter) {
      this.foreshadowItems.push({
        plantedInChapter: plantChapterNumber,
        detail: plantChapter.hook, // The foreshadow detail should be in the hook
        status: "planted",
      });
    }
  }

  /** Lock the canon hard-facts that every chapter must respect. */
  setCanonFacts(facts: string[]): void {
    this.canonFacts = Array.isArray(facts)
      ? facts.filter((f) => typeof f === "string" && f.trim().length > 0)
      : [];
  }

  recordChapter(chapter: MinimalChapterRef, factSheet: CharacterFactSheet): void {
    this.chapterStates.set(chapter.chapterNumber, {
      heroineAgency: Math.min(100, 18 + chapter.chapterNumber * 5),
      emotionalTemperature: chapter.summary,
    });

    this.characterFacts.set(chapter.chapterNumber, factSheet);

    // Check if this chapter achieved its planned beat
    const beat = this.plotBeats.find((b) => b.chapterNumber === chapter.chapterNumber);
    if (beat) {
      beat.achieved = true;
      beat.summary = chapter.summary;
    }

    // Check foreshadow activation (the activation chapter pays off the plant)
    if (chapter.chapterNumber === DRAMA15_KEY_CHAPTERS.foreshadowActivate && this.foreshadowItems.length > 0) {
      for (const item of this.foreshadowItems) {
        if (item.status === "planted") {
          item.activatedInChapter = DRAMA15_KEY_CHAPTERS.foreshadowActivate;
          item.status = "activated";
        }
      }
    }
  }

  getContinuityContext(_nextChapterNumber: number): ContinuityLite {
    return {
      heroineName: this.heroineName,
      betrayerName: this.betrayerName,
      rivalName: this.rivalName,
      coreReveal: this.coreReveal,
      endingMode: this.endingMode,
      speechPatterns: this.buildSpeechPatterns(),
      canonFacts: this.canonFacts,
      chapterState: Array.from(this.chapterStates.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([ch, state]) => ({
          chapter: ch,
          heroineAgency: state.heroineAgency,
          emotionalTemperature: state.emotionalTemperature,
        })),
    };
  }

  getForeshadowReport(): { planted: ForeshadowItem[]; activated: ForeshadowItem[]; missed: ForeshadowItem[] } {
    return {
      planted: this.foreshadowItems.filter((f) => f.status === "planted"),
      activated: this.foreshadowItems.filter((f) => f.status === "activated"),
      missed: this.foreshadowItems.filter((f) => f.status === "missed"),
    };
  }

  getPlotBeatReport(): { achieved: number; total: number; beats: PlotBeat[] } {
    const achieved = this.plotBeats.filter((b) => b.achieved).length;
    return {
      achieved,
      total: this.plotBeats.length,
      beats: this.plotBeats,
    };
  }

  /** Flatten every newly-established fact across all chapters (for propagation
   * debt analysis). */
  getAllEstablishedFacts(): Array<{ chapterNumber: number; fact: string; confidence: string }> {
    const results: Array<{ chapterNumber: number; fact: string; confidence: string }> = [];
    for (const [chapterNumber, factSheet] of this.characterFacts) {
      for (const character of factSheet.characters) {
        for (const fact of character.newlyEstablishedFacts) {
          results.push({ chapterNumber, fact: fact.fact, confidence: fact.confidence });
        }
      }
    }
    return results.sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  getCharacterArc(characterName: string): Array<{
    chapterNumber: number;
    emotionalState: string;
    socialPosition: string;
    relationshipChanges: Array<{ target: string; change: string }>;
    establishedFacts: Array<{ fact: string; confidence: string }>;
  }> {
    const results: Array<{
      chapterNumber: number;
      emotionalState: string;
      socialPosition: string;
      relationshipChanges: Array<{ target: string; change: string }>;
      establishedFacts: Array<{ fact: string; confidence: string }>;
    }> = [];

    for (const [chapterNumber, factSheet] of this.characterFacts) {
      const charFact = factSheet.characters.find((c) => c.characterName === characterName);
      if (charFact) {
        results.push({
          chapterNumber,
          emotionalState: charFact.emotionalState,
          socialPosition: charFact.socialPosition,
          relationshipChanges: charFact.relationshipChanges.map((r) => ({
            target: r.targetCharacter,
            change: r.change,
          })),
          establishedFacts: charFact.newlyEstablishedFacts.map((f) => ({
            fact: f.fact,
            confidence: f.confidence,
          })),
        });
      }
    }

    return results.sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  toPromptContext(): string {
    const lines: string[] = [
      "=== CONTINUITY CONTEXT ===",
      `Heroine: ${this.heroineName}`,
      `Betrayer: ${this.betrayerName}`,
      `Rival: ${this.rivalName}`,
      `Core Reveal: ${this.coreReveal}`,
      `Ending Mode: ${this.endingMode}`,
      "",
    ];

    // Character arcs
    for (const charName of [this.heroineName, this.betrayerName, this.rivalName]) {
      const arc = this.getCharacterArc(charName);
      if (arc.length > 0) {
        lines.push(`Character Arc: ${charName}`);
        for (const entry of arc) {
          lines.push(`  Chapter ${entry.chapterNumber}:`);
          lines.push(`    Emotional state: ${entry.emotionalState}`);
          lines.push(`    Social position: ${entry.socialPosition}`);
          if (entry.relationshipChanges.length > 0) {
            lines.push(`    Relationship changes:`);
            for (const rel of entry.relationshipChanges) {
              lines.push(`      - ${rel.target}: ${rel.change}`);
            }
          }
        }
        lines.push("");
      }
    }

    // Foreshadow status
    const foreshadow = this.getForeshadowReport();
    if (foreshadow.activated.length > 0) {
      lines.push("Activated foreshadow:");
      for (const item of foreshadow.activated) {
        lines.push(`  - Ch${item.plantedInChapter} → Ch${item.activatedInChapter}: ${item.detail}`);
      }
    }
    if (foreshadow.planted.length > 0) {
      lines.push("Pending foreshadow:");
      for (const item of foreshadow.planted) {
        lines.push(`  - Planted Ch${item.plantedInChapter}: ${item.detail}`);
      }
    }

    lines.push("=== END CONTINUITY CONTEXT ===");

    return lines.join("\n");
  }

  private buildSpeechPatterns(): Record<string, {
    fillers: string[];
    syntaxQuirk: string;
    vocabularyBand: string;
    avoidedPhrases: string[];
  }> {
    const patterns: Record<string, {
      fillers: string[];
      syntaxQuirk: string;
      vocabularyBand: string;
      avoidedPhrases: string[];
    }> = {};
    // Note: Speech patterns come from the StoryBible, which the caller should provide
    // This is a simplified version — the actual implementation should receive speechPatterns
    return patterns;
  }
}
