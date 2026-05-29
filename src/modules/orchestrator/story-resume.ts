import type { StoryPayload } from "../../types/story";

export function getRemainingChapterPlanItems(storyPayload: Pick<StoryPayload, "chapterPlan" | "chapters">) {
  const draftedChapterNumbers = new Set(storyPayload.chapters.map((chapter) => chapter.chapterNumber));
  return storyPayload.chapterPlan
    .filter((chapter) => !draftedChapterNumbers.has(chapter.chapterNumber))
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

export function hasResumableStoryPayload(storyPayload: Pick<StoryPayload, "chapterPlan" | "chapters">) {
  return storyPayload.chapters.length > 0 && getRemainingChapterPlanItems(storyPayload).length > 0;
}
