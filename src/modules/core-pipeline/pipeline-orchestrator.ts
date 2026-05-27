/**
 * Pipeline Orchestrator — thin wrapper around StoryOrchestrator.
 *
 * This file exists for backward compatibility. All real generation logic
 * lives in StoryOrchestrator (src/modules/orchestrator/story-orchestrator.ts).
 *
 * Both desktop and web use StoryOrchestrator as their single source of truth.
 */

export {
  StoryOrchestrator as PipelineOrchestrator,
} from "../orchestrator/story-orchestrator";

// Re-export types that consumers expect from the pipeline module
export type {
  ProgressReporter,
  ProgressReporterCallback,
  StageDescriptor,
} from "./pipeline-progress";

export type {
  ProgressEvent,
  OperationType,
  PipelineStage,
  ProgressStatus,
} from "./pipeline-types";

export {
  emitProgress,
  runProgressStage,
  resolveProgressOptions,
  createDesktopProgressReporter,
  createSseProgressReporter,
} from "./pipeline-progress";
