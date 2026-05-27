import fs from "node:fs";
import path from "node:path";

import { env } from "../../lib/env";
import { getConfigRoot } from "../../lib/runtime";
import { StoryOrchestrator } from "../orchestrator/story-orchestrator";
import { getLocalProsePolishConfig } from "../presets/prose-polish-config";
import { PresetLoader } from "../presets/preset-loader";
import { RouterAuthConfig } from "../router/router-auth-config";
import { RouterClient } from "../router/router-client";
import { AutomationConfigStore } from "../session/automation-config-store";
import { SeedHistoryStore } from "../session/seed-history-store";
import { SessionStore } from "../session/session-store";
import { StoryHistoryStore } from "../session/story-history-store";
import { OmniVoiceApiClient } from "../tts/omnivoice-api-client";
import { OmniVoiceTtsConfigStore } from "../tts/omnivoice-tts-config-store";
import { StoryTtsService } from "../tts/story-tts-service";

export function createAppServices() {
  const presetLoader = new PresetLoader();
  const routerAuthConfig = new RouterAuthConfig();
  const routerClient = new RouterClient(() => routerAuthConfig.resolveRuntimeConfig());
  const seedHistoryStore = new SeedHistoryStore();
  const prosePolishConfig = getLocalProsePolishConfig();
  const storyOrchestrator = new StoryOrchestrator(presetLoader, routerClient, env.modelPreset, seedHistoryStore, undefined, prosePolishConfig);
  const sessionStore = new SessionStore();
  const storyHistoryStore = new StoryHistoryStore({
    legacyHistoryRoots: discoverLegacyStoryHistoryRoots(getConfigRoot()),
  });
  const automationConfigStore = new AutomationConfigStore();
  const ttsConfigStore = new OmniVoiceTtsConfigStore();
  const omniVoiceApiClientFactory = (apiBase: string) => new OmniVoiceApiClient({ apiBase });
  const storyTtsServiceFactory = (apiBase: string) => {
    const client = omniVoiceApiClientFactory(apiBase);
    return new StoryTtsService({ client });
  };

  return {
    presetLoader,
    routerAuthConfig,
    routerClient,
    storyOrchestrator,
    prosePolishConfig,
    seedHistoryStore,
    sessionStore,
    storyHistoryStore,
    automationConfigStore,
    ttsConfigStore,
    omniVoiceApiClientFactory,
    storyTtsServiceFactory,
  };
}

function discoverLegacyStoryHistoryRoots(configRoot: string, envVars: NodeJS.ProcessEnv = process.env) {
  const roots: string[] = [];
  const releaseGuiRoot = path.join(configRoot, "release", "gui");
  if (hasStoryHistoryFile(releaseGuiRoot)) {
    roots.push(releaseGuiRoot);
  }

  for (const tempRoot of [envVars.TEMP, envVars.TMP]) {
    if (!tempRoot) {
      continue;
    }

    try {
      const entries = fs.readdirSync(tempRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^(drama15-portable-data-|drama15-pack-state-)/i.test(entry.name)) {
          continue;
        }

        const root = path.join(tempRoot, entry.name);
        if (hasStoryHistoryFile(root)) {
          roots.push(root);
        }
      }
    } catch {
      // Legacy history import is best-effort; the active config root remains authoritative.
    }
  }

  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function hasStoryHistoryFile(root: string) {
  try {
    return fs.statSync(path.join(root, "drama15-story-history.json")).isFile();
  } catch {
    return false;
  }
}
