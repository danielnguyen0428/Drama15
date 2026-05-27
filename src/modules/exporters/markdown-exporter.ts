import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { slugify } from "../../lib/slug";
import type { Chapter, StoryPayload } from "../../types/story";

export type ChapterMarkdownFile = {
  chapterNumber: number;
  title: string;
  filename: string;
  markdown: string;
};

export function renderStoryMarkdown(story: StoryPayload) {
  const metadata = [
    `- Niche: ${story.request.linePreset}`,
    `- Ngôn ngữ đầu ra: ${story.request.outputLanguage}`,
  ];

  const concept = [
    `# ${story.title}`,
    "",
    "## Metadata",
    ...metadata,
    "",
    "## Concept",
    `- Logline: ${story.concept.logline}`,
    `- Promise: ${story.concept.promise}`,
    `- Conflict Engine: ${story.concept.conflictEngine}`,
    "",
    "## Story Bible",
    `- Premise: ${story.storyBible.premise}`,
    `- Heroine: ${story.storyBible.heroine.name} (${story.storyBible.heroine.wound})`,
    `- Betrayer: ${story.storyBible.betrayer.name} (${story.storyBible.betrayer.wound})`,
    `- Rival: ${story.storyBible.rival.name} (${story.storyBible.rival.socialPower})`,
    `- Class Shame Engine: ${story.storyBible.classShameEngine}`,
    `- Revenge Engine: ${story.storyBible.revengeEngine}`,
    `- Ending Mode: ${story.storyBible.endingMode}`,
    "",
    "## Chapter Plan",
  ];

  const planSections = story.chapterPlan.flatMap((chapter) => [
    `### Chapter ${chapter.chapterNumber} — ${chapter.title}`,
    `- Hook: ${chapter.hook}`,
    `- Main Beat: ${chapter.mainBeat}`,
    `- Shame Progression: ${chapter.humiliationProgression}`,
    `- Revenge Progression: ${chapter.revengeProgression}`,
    `- Ending Beat: ${chapter.endingBeat}`,
    "",
  ]);

  const chapterSections =
    story.chapters.length > 0
      ? [
          "## Full Draft",
          "",
          ...story.chapters.flatMap((chapter) => [
            `### Chapter ${chapter.chapterNumber} — ${chapter.title}`,
            "",
            chapter.text.trim(),
            "",
          ]),
        ]
      : [];

  return [...concept, ...planSections, ...chapterSections].join("\n").trimEnd() + "\n";
}

export function renderChapterMarkdownFiles(story: StoryPayload): ChapterMarkdownFile[] {
  return story.chapters.map((chapter) => ({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    filename: `${String(chapter.chapterNumber).padStart(2, "0")}-${slugify(chapter.title)}.md`,
    markdown: renderChapterMarkdown(story, chapter),
  }));
}

export function renderChapterMarkdown(story: StoryPayload, chapter: Chapter) {
  return [
    `# Chương ${chapter.chapterNumber} - ${chapter.title}`,
    "",
    `- Truyện: ${story.title}`,
    `- Niche: ${story.request.linePreset}`,
    "",
    "## Nội dung",
    chapter.text.trim(),
    "",
  ].join("\n");
}

export function renderStoryPdfHtml(story: StoryPayload) {
  const chapterHtml = story.chapters
    .map(
      (chapter) => `
        <section class="chapter">
          <h2>Chương ${chapter.chapterNumber} - ${escapeHtml(chapter.title)}</h2>
          ${chapter.text
            .trim()
            .split(/\n{2,}|\n/)
            .filter(Boolean)
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join("\n")}
        </section>
      `,
    )
    .join("\n");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(story.title)}</title>
    <style>
      @page { margin: 18mm 16mm; }
      body {
        color: #191512;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 12pt;
        line-height: 1.62;
      }
      h1 {
        font-size: 28pt;
        line-height: 1.1;
        margin: 0 0 10mm;
      }
      h2 {
        break-after: avoid;
        font-size: 18pt;
        margin: 0 0 5mm;
      }
      .meta {
        color: #5f534c;
        font-family: "Segoe UI", sans-serif;
        font-size: 9.5pt;
        margin-bottom: 12mm;
      }
      .chapter {
        break-before: page;
      }
      .chapter:first-of-type {
        break-before: auto;
      }
      p {
        margin: 0 0 4mm;
        orphans: 3;
        widows: 3;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(story.title)}</h1>
    <div class="meta">
          <div>Niche: ${escapeHtml(story.request.linePreset)}</div>
      <div>Số chương đã viết: ${story.chapters.length}</div>
    </div>
    ${chapterHtml}
  </body>
</html>`;
}

export async function writeChapterMarkdownFiles(story: StoryPayload, outputDirectory: string) {
  const files = renderChapterMarkdownFiles(story);
  try {
    await fs.mkdir(outputDirectory, { recursive: true });
    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(outputDirectory, file.filename);
        await fs.writeFile(filePath, file.markdown, "utf-8");
      }),
    );
  } catch (error) {
    throw new AppError("EXPORT_FAILED", "Failed to write chapter markdown export files.", 500, {
      cause: error,
      outputDirectory,
    });
  }

  return files.map((file) => path.join(outputDirectory, file.filename));
}

export async function maybeWriteMarkdownFile(
  story: StoryPayload,
  markdown: string,
  options?: {
    filename?: string;
    writeToFile?: boolean;
  },
) {
  const shouldWrite = options?.writeToFile ?? env.writeExportFiles;
  if (!shouldWrite) {
    return null;
  }

  const filename = options?.filename?.trim() || `${slugify(story.title)}.story.md`;
  const filePath = path.resolve(env.outputDir, filename);

  try {
    await fs.mkdir(env.outputDir, { recursive: true });
    await fs.writeFile(filePath, markdown, "utf-8");
    return filePath;
  } catch (error) {
    throw new AppError("EXPORT_FAILED", "Failed to write markdown export file.", 500, {
      cause: error,
      filePath,
    });
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
