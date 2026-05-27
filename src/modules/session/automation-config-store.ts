import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../../lib/env";
import { getConfigRoot } from "../../lib/runtime";

export type AutomationConfig = {
  pdfOutputDirectory: string;
};

type AutomationConfigStoreOptions = {
  configRoot?: string;
};

const AUTOMATION_CONFIG_FILE_NAME = "drama15-automation-config.json";

export class AutomationConfigStore {
  private readonly configRoot: string;

  constructor(options: AutomationConfigStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
  }

  async load(): Promise<AutomationConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return normalizeAutomationConfig(JSON.parse(raw), this.configRoot);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return getDefaultAutomationConfig(this.configRoot);
      }

      if (error instanceof SyntaxError) {
        return getDefaultAutomationConfig(this.configRoot);
      }

      throw error;
    }
  }

  async save(input: Partial<AutomationConfig>): Promise<AutomationConfig> {
    const config = normalizeAutomationConfig(input, this.configRoot);
    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return config;
  }

  private get configPath() {
    return path.join(this.configRoot, AUTOMATION_CONFIG_FILE_NAME);
  }
}

function normalizeAutomationConfig(input: unknown, configRoot: string): AutomationConfig {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const pdfOutputDirectory = String(value.pdfOutputDirectory || "").trim();
  return {
    pdfOutputDirectory: pdfOutputDirectory
      ? path.resolve(pdfOutputDirectory)
      : getDefaultAutomationConfig(configRoot).pdfOutputDirectory,
  };
}

function getDefaultAutomationConfig(_configRoot: string): AutomationConfig {
  return {
    pdfOutputDirectory: path.join(env.outputDir, "automation-pdfs"),
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
