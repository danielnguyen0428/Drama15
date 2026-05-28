import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

import { getAppRoot } from "./runtime";

const appRoot = getAppRoot();

for (const envPath of uniqueEnvPaths([
  path.join(appRoot, ".env"),
  path.join(process.cwd(), ".env"),
])) {
  if (!fs.existsSync(envPath)) {
    continue;
  }

  dotenv.config({ path: envPath });
  break;
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z.string().default("https://drama.novelkit.cc"),
  OPENAI_BASE_URL: z.string().url().default("http://localhost:20128/v1"),
  OPENAI_API_KEY: z.string().min(1).default("dummy"),
  ROUTER_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  ROUTER_PLANNING_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
  ROUTER_CHAPTER_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  ROUTER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  ROUTER_FALLBACK_ENABLED: z.string().optional().transform((value) => value !== "false"),
  DEFAULT_LINE_PRESET: z.string().default("billionaire_rich_poor_romance"),
  DEFAULT_STYLE_PRESET: z.string().default("co_man_warm_modern_blueprint"),
  DEFAULT_CHAPTER_COUNT: z.coerce.number().int().default(10),
  OUTPUT_DIR: z.string().optional(),
  WRITE_EXPORT_FILES: z.string().optional().transform((value) => value === "true"),
  MODEL_PRESET: z.string().default("default"),
});

const parsedEnv = EnvSchema.parse(process.env);

export const env = {
  port: parsedEnv.PORT,
  host: parsedEnv.HOST,
  logLevel: parsedEnv.LOG_LEVEL,
  corsOrigins: parsedEnv.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  routerBaseUrl: parsedEnv.OPENAI_BASE_URL.replace(/\/+$/, ""),
  routerApiKey: parsedEnv.OPENAI_API_KEY,
  routerDefaultTimeoutMs: parsedEnv.ROUTER_DEFAULT_TIMEOUT_MS,
  routerPlanningTimeoutMs: parsedEnv.ROUTER_PLANNING_TIMEOUT_MS,
  routerChapterTimeoutMs: parsedEnv.ROUTER_CHAPTER_TIMEOUT_MS,
  routerMaxRetries: parsedEnv.ROUTER_MAX_RETRIES,
  routerFallbackEnabled: parsedEnv.ROUTER_FALLBACK_ENABLED,
  defaultLinePreset: parsedEnv.DEFAULT_LINE_PRESET,
  defaultStylePreset: parsedEnv.DEFAULT_STYLE_PRESET,
  defaultChapterCount: parsedEnv.DEFAULT_CHAPTER_COUNT,
  outputDir: resolveOutputDir(parsedEnv.OUTPUT_DIR),
  writeExportFiles: parsedEnv.WRITE_EXPORT_FILES,
  modelPreset: parsedEnv.MODEL_PRESET,
} as const;

function resolveOutputDir(value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed) {
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(appRoot, trimmed);
  }

  return path.resolve(appRoot, "local-output");
}

function uniqueEnvPaths(values: string[]) {
  return [...new Set(values)];
}
