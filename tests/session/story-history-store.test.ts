import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StoryHistoryStore } from "../../src/modules/session/story-history-store";
import type { StoryPayload } from "../../src/types/story";

function makeStory(title = "Fake Wife Of A Billionaire"): StoryPayload {
  return {
    title,
    request: {
      titleHint: title,
      linePreset: "billionaire_rich_poor_romance",
      stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
      outputLanguage: "english",
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: {
        betrayalType: "contract marriage pressure",
        shameType: "rich family dinner shame",
        revengeMode: "quiet value reveal",
        endingMode: "respect before love",
        intensity: 0.84,
      },
      chapterCount: 15,
      draftControls: {
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    concept: {
      title,
      titleCandidates: [title],
      logline: "A poor bride survives a rich family's contempt.",
      promise: "Dignity first.",
      conflictEngine: "Class shame in a billionaire family.",
    },
    storyBible: {
      premise: "A contract bride is treated as disposable.",
      heroine: {
        name: "Maya",
        wound: "She thinks endurance is love.",
        strengths: ["observant"],
        blindSpots: ["waits too long"],
      },
      betrayer: {
        name: "Adrian",
        wound: "He fears family judgment.",
        cowardiceVector: "He stays silent in public.",
      },
      rival: {
        name: "Celeste",
        socialPower: "old money",
        demeanor: "polished contempt",
      },
      classHierarchy: ["rich family", "contract bride"],
      betrayalEngine: "He lets his family humiliate her.",
      classShameEngine: "Dinner etiquette becomes a weapon.",
      revengeEngine: "Her competence becomes necessary.",
      endingMode: "respect before love",
    },
    chapterPlan: Array.from({ length: 15 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Plan ${index + 1}`,
      hook: `Hook ${index + 1}`,
      mainBeat: `Beat ${index + 1}`,
      humiliationProgression: `Shame ${index + 1}`,
      revengeProgression: `Revenge ${index + 1}`,
      endingBeat: `Ending ${index + 1}`,
    })),
    chapters: [
      {
        chapterNumber: 1,
        title: "The Dinner Seat",
        summary: "Maya is moved away from the family table.",
        text: "Maya saw the empty chair before anyone said her name.",
      },
    ],
    continuityLite: {
      heroineName: "Maya",
      betrayerName: "Adrian",
      rivalName: "Celeste",
      coreReveal: "Maya owns the rescue fund.",
      endingMode: "respect before love",
      chapterState: [],
    },
    meta: {
      generatedAt: "2026-05-02T00:00:00.000Z",
      modelAliases: {
        planner: "cx/gpt-5.5",
        bible: "cx/gpt-5.5",
        drafter: "cx/gpt-5.5",
      },
    },
  };
}

test("StoryHistoryStore upserts stories and records export artifacts", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 5 });
  const story = makeStory();

  const entry = await store.upsertStory(story);
  await store.recordChapterMarkdownExport(story, "D:/exports/story-md", ["D:/exports/story-md/01.md"]);
  await store.recordPdfExport(story, "D:/exports/story.pdf");

  const loaded = await store.get(entry.id);

  assert.equal(loaded?.title, "Fake Wife Of A Billionaire");
  assert.equal(loaded?.chapterCount, 1);
  assert.equal(loaded?.exports.chapterMarkdownDirectories[0]?.directoryPath, "D:/exports/story-md");
  assert.equal(loaded?.exports.pdfFiles[0]?.filePath, "D:/exports/story.pdf");
  assert.equal(loaded?.storyPayload.title, story.title);
});

test("StoryHistoryStore prepends newest stories, caps entries, and deletes by id", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 2 });

  const first = await store.upsertStory(makeStory("First Story"));
  await store.upsertStory(makeStory("Second Story"));
  await store.upsertStory(makeStory("Third Story"));
  await store.delete(first.id);

  const entries = await store.list();

  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["Third Story", "Second Story"],
  );
  assert.equal(await store.get(first.id), null);
});

test("StoryHistoryStore records voice export directories and keeps legacy exports valid", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 5 });
  const story = makeStory();

  const entry = await store.recordVoiceExport(story, {
    directoryPath: "D:/exports/story-voice",
    filePaths: ["D:/exports/story-voice/chapter-01.wav"],
    voiceId: "main-voice",
    generatedAt: "2026-05-06T00:00:00.000Z",
  });
  const loaded = await store.get(entry.id);

  assert.equal(loaded?.exports.voiceDirectories[0]?.directoryPath, "D:/exports/story-voice");
  assert.equal(loaded?.exports.voiceDirectories[0]?.voiceId, "main-voice");
  assert.deepEqual(loaded?.exports.voiceDirectories[0]?.filePaths, ["D:/exports/story-voice/chapter-01.wav"]);
});
