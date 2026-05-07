import { env } from "../../lib/env";
import { StoryOrchestrator } from "../orchestrator/story-orchestrator";
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
  const storyOrchestrator = new StoryOrchestrator(presetLoader, routerClient, env.modelPreset, seedHistoryStore);
  const sessionStore = new SessionStore();
  const storyHistoryStore = new StoryHistoryStore();
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
    seedHistoryStore,
    sessionStore,
    storyHistoryStore,
    automationConfigStore,
    ttsConfigStore,
    omniVoiceApiClientFactory,
    storyTtsServiceFactory,
  };
}
