import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StoryHistoryStore } from "../../src/modules/session/story-history-store";
import { StoryPayloadSchema } from "../../src/schemas/story";
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
      chapterCount: 10,
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
    chapterPlan: Array.from({ length: 10 }, (_, index) => ({
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

test("StoryHistoryStore imports valid entries from legacy portable history roots", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-primary-"));
  const legacyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-portable-data-legacy-"));
  const legacyStory = makeStory("Legacy Portable Story");
  const legacyEntry = {
    id: "legacy-portable-story-20260505010101",
    title: legacyStory.title,
    linePreset: legacyStory.request.linePreset,
    outputLanguage: legacyStory.request.outputLanguage,
    chapterCount: legacyStory.chapters.length,
    createdAt: "2026-05-05T01:01:01.000Z",
    updatedAt: "2026-05-05T01:02:01.000Z",
    storyPayload: legacyStory,
    exports: {
      chapterMarkdownDirectories: [],
      pdfFiles: [],
      voiceDirectories: [],
      posterImages: [],
    },
  };
  await fs.writeFile(path.join(legacyRoot, "drama15-story-history.json"), `${JSON.stringify([legacyEntry], null, 2)}\n`, "utf8");

  const store = new StoryHistoryStore({ configRoot, maxEntries: 5, legacyHistoryRoots: [legacyRoot] });

  const entries = await store.list();
  const persisted = JSON.parse(await fs.readFile(path.join(configRoot, "drama15-story-history.json"), "utf8")) as unknown[];

  assert.equal(entries[0]?.title, "Legacy Portable Story");
  assert.equal(persisted.length, 1);
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

test("StoryHistoryStore records completed poster images from story metadata", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 5 });
  const story = makeStory();
  story.meta.poster = {
    status: "completed",
    title: story.title,
    model: "gpt-image-2",
    size: "1536x1024",
    generatedAt: "2026-05-07T16:45:00.000Z",
    filePath: "D:/outputs/posters/fake-wife-of-a-billionaire-poster.png",
  };

  const entry = await store.upsertStory(story);
  const loaded = await store.get(entry.id);

  assert.equal(loaded?.exports.posterImages[0]?.filePath, "D:/outputs/posters/fake-wife-of-a-billionaire-poster.png");
  assert.equal(loaded?.exports.posterImages[0]?.model, "gpt-image-2");
  assert.equal(loaded?.exports.posterImages[0]?.title, "Fake Wife Of A Billionaire");
});

test("StoryPayloadSchema strips legacy thumbnail metadata", () => {
  const story = makeStory();
  const parsed = StoryPayloadSchema.parse({
    ...story,
    meta: {
      ...story.meta,
      thumbnails: {
        status: "completed",
        model: "gpt-image-2",
        size: "1536x864",
        generatedAt: "2026-05-11T04:00:00.000Z",
        story: {
          status: "completed",
          kind: "story",
          title: story.title,
          model: "gpt-image-2",
          size: "1536x864",
          generatedAt: "2026-05-11T04:00:00.000Z",
          filePath: "D:/outputs/thumbnails/fake-wife-of-a-billionaire/story.png",
        },
        chapters: [
          {
            status: "completed",
            kind: "chapter",
            title: "The Dinner Seat",
            chapterNumber: 1,
            model: "gpt-image-2",
            size: "1536x864",
            generatedAt: "2026-05-11T04:00:00.000Z",
            filePath: "D:/outputs/thumbnails/fake-wife-of-a-billionaire/chapters/01-the-dinner-seat.png",
          },
        ],
      },
    },
  });

  assert.equal("thumbnails" in parsed.meta, false);
});

test("StoryHistoryStore does not record legacy thumbnail images or prompt packs", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 5 });
  const story = makeStory();
  (story.meta as StoryPayload["meta"] & { thumbnails: unknown }).thumbnails = {
    status: "prompt_pack",
    model: "gpt-image-2",
    size: "1536x864",
    generatedAt: "2026-05-11T04:00:00.000Z",
    promptPackPath: "D:/outputs/thumbnails/fake-wife-of-a-billionaire/thumbnail-prompts.jsonl",
    story: {
      status: "completed",
      kind: "story",
      title: story.title,
      model: "gpt-image-2",
      size: "1536x864",
      generatedAt: "2026-05-11T04:00:00.000Z",
      filePath: "D:/outputs/thumbnails/fake-wife-of-a-billionaire/story.png",
    },
    chapters: [
      {
        status: "completed",
        kind: "chapter",
        title: "The Dinner Seat",
        chapterNumber: 1,
        model: "gpt-image-2",
        size: "1536x864",
        generatedAt: "2026-05-11T04:00:00.000Z",
        filePath: "D:/outputs/thumbnails/fake-wife-of-a-billionaire/chapters/01-the-dinner-seat.png",
      },
    ],
  };

  const entry = await store.upsertStory(story);
  const loaded = await store.get(entry.id);

  assert.equal(loaded ? "thumbnailImages" in loaded.exports : true, false);
  assert.equal(loaded ? "thumbnailPromptPacks" in loaded.exports : true, false);
});
