import fs from "node:fs/promises";
import path from "node:path";

import { getConfigRoot } from "../../lib/runtime";

type SessionStoreOptions = {
  configRoot?: string;
};

const SESSION_FILE_NAME = "drama15-session.json";

export class SessionStore {
  private readonly configRoot: string;

  constructor(options: SessionStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.sessionPath, "utf8");
      return JSON.parse(raw) as unknown;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      if (error instanceof SyntaxError) {
        return null;
      }

      throw error;
    }
  }

  async save(snapshot: unknown) {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      snapshot,
    };

    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(this.sessionPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  }

  private get sessionPath() {
    return path.join(this.configRoot, SESSION_FILE_NAME);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
