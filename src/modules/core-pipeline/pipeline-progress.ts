/**
 * Progress Reporter — platform-agnostic progress tracking.
 *
 * Provides a unified interface for reporting pipeline stage progress that works
 * with both desktop Electron callbacks and web API SSE streaming.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

import type { ProgressEvent, ProgressStatus, OperationType, PipelineStage } from "./pipeline-types";

export type ProgressReporterCallback = (event: ProgressEvent) => void;

export interface ProgressReporter {
  operation: OperationType;
  totalStages: number;
  stageOffset: number;
  callback: ProgressReporterCallback | null;
}

export interface StageDescriptor {
  id: string;
  label: string;
  detail: string;
}

/**
 * Emit a progress event to the reporter's callback (if present).
 */
export function emitProgress(
  reporter: ProgressReporter,
  stageNumber: number,
  stage: StageDescriptor,
  status: ProgressStatus,
  detailOverride?: string,
  meta?: Record<string, unknown>,
): void {
  if (!reporter.callback) return;

  reporter.callback({
    operation: reporter.operation,
    stage: stage.id as PipelineStage,
    stageNumber,
    label: stage.label,
    detail: detailOverride ?? stage.detail,
    current: stageNumber - reporter.stageOffset,
    total: reporter.totalStages - reporter.stageOffset,
    status,
    meta,
  });
}

/**
 * Run a pipeline stage with progress tracking, timing, and error handling.
 *
 * Usage:
 *   const result = await runProgressStage(
 *     reporter, 3,
 *     { id: "chapter-plan", label: "Lập kế hoạch chương", detail: "Đang lập..." },
 *     async () => { /* actual work *\/ },
 *     (result) => `Completed: ${result.modelUsed}`
 *   );
 */
export async function runProgressStage<T>(
  reporter: ProgressReporter,
  stageNumber: number,
  stage: StageDescriptor,
  work: () => Promise<T>,
  completionMessage: string | ((result: T) => string),
): Promise<T> {
  emitProgress(reporter, stageNumber, stage, "started");

  try {
    const result = await work();
    const message = typeof completionMessage === "function"
      ? completionMessage(result)
      : completionMessage;
    emitProgress(reporter, stageNumber, stage, "completed", message);
    return result;
  } catch (error) {
    emitProgress(
      reporter,
      stageNumber,
      stage,
      "completed",
      `Stage failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Resolve progress options with sensible defaults.
 */
export function resolveProgressOptions(
  options: { callback?: ProgressReporterCallback; operation?: OperationType; totalStages?: number; stageOffset?: number } | undefined,
  defaultOperation: OperationType,
  defaultTotalStages: number,
): ProgressReporter {
  return {
    callback: options?.callback ?? null,
    operation: options?.operation ?? defaultOperation,
    totalStages: options?.totalStages ?? defaultTotalStages,
    stageOffset: options?.stageOffset ?? 0,
  };
}

/**
 * Create a desktop-compatible progress reporter.
 */
export function createDesktopProgressReporter(
  onProgress?: (event: ProgressEvent) => void,
): ProgressReporter {
  return {
    callback: onProgress ?? null,
    operation: "full",
    totalStages: 21, // seed + concept + bible + plan + 15 chapters + finalize
    stageOffset: 0,
  };
}

/**
 * Create a web-compatible SSE progress reporter.
 */
export function createSseProgressReporter(
  sendEvent: (event: string, data: unknown) => void,
  jobId: string,
): ProgressReporter {
  const callback: ProgressReporterCallback = (event) => {
    sendEvent("stage", {
      stage: event.stage,
      stageNumber: event.stageNumber,
      label: event.label,
      detail: event.detail,
      current: event.current,
      total: event.total,
      status: event.status,
      jobId,
    });
  };

  return {
    callback,
    operation: "full",
    totalStages: 21,
    stageOffset: 0,
  };
}
