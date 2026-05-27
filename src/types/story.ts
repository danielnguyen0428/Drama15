import type { z } from "zod";

import type {
  AudienceSchema,
  ChapterPlanItemSchema,
  ChapterSchema,
  ConceptSchema,
  CustomCreativeInputsSchema,
  ContinuityLiteSchema,
  DraftControlsSchema,
  ExportMarkdownRequestSchema,
  FullGenerateRequestInputSchema,
  GeneratedSettingSeedSchema,
  GenerateSettingSeedRequestSchema,
  GenerateChapterRequestSchema,
  NormalizedFullGenerateRequestSchema,
  NormalizedOutlineRequestSchema,
  OutlineRequestInputSchema,
  OutputLanguageSchema,
  PreserveConstraintsSchema,
  RegenerateChapterRequestSchema,
  RegenerateModeSchema,
  StoryBibleSchema,
  StoryControlsSchema,
  StoryPayloadSchema,
} from "../schemas/story";

export type Audience = z.infer<typeof AudienceSchema>;
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;
export type StoryControls = z.infer<typeof StoryControlsSchema>;
export type CustomCreativeInputs = z.infer<typeof CustomCreativeInputsSchema>;
export type DraftControls = z.infer<typeof DraftControlsSchema>;
export type OutlineRequestInput = z.infer<typeof OutlineRequestInputSchema>;
export type NormalizedOutlineRequest = z.infer<typeof NormalizedOutlineRequestSchema>;
export type FullGenerateRequestInput = z.infer<typeof FullGenerateRequestInputSchema>;
export type NormalizedFullGenerateRequest = z.infer<typeof NormalizedFullGenerateRequestSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type StoryBible = z.infer<typeof StoryBibleSchema>;
export type ChapterPlanItem = z.infer<typeof ChapterPlanItemSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type ContinuityLite = z.infer<typeof ContinuityLiteSchema>;
export type StoryPayload = z.infer<typeof StoryPayloadSchema>;
export type GenerateChapterRequest = z.infer<typeof GenerateChapterRequestSchema>;
export type GenerateSettingSeedRequest = z.infer<typeof GenerateSettingSeedRequestSchema>;
export type GeneratedSettingSeed = z.infer<typeof GeneratedSettingSeedSchema>;
export type RegenerateMode = z.infer<typeof RegenerateModeSchema>;
export type PreserveConstraints = z.infer<typeof PreserveConstraintsSchema>;
export type RegenerateChapterRequest = z.infer<typeof RegenerateChapterRequestSchema>;
export type ExportMarkdownRequest = z.infer<typeof ExportMarkdownRequestSchema>;
