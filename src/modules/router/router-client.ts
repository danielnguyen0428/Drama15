import { env } from "../../lib/env";
import { AppError, isAppError } from "../../lib/errors";
import { parseJsonText } from "../../lib/json";

export type RouterRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  source: "env" | "user";
  temperature?: number;
  maxTokens?: number;
};
type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type GenerateJsonParams = {
  model: string;
  fallbackModel?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
};

type HealthResult = {
  status: "healthy" | "degraded";
  baseUrl: string;
  details?: string;
};

type RouterRuntimeConfigProvider = () => Promise<RouterRuntimeConfig> | RouterRuntimeConfig;

export class RouterClient {
  private availableModelsCache: string[] | null = null;

  constructor(
    private readonly runtimeConfigProvider: RouterRuntimeConfigProvider = () => ({
      apiKey: env.routerApiKey,
      baseUrl: env.routerBaseUrl,
      source: "env",
    }),
  ) {}

  clearAvailableModelsCache() {
    this.availableModelsCache = null;
  }

  async checkHealth(): Promise<HealthResult> {
    const runtimeConfig = await this.getRuntimeConfig();
    try {
      const response = await this.fetchModelsPayload(runtimeConfig);

      if (response && typeof response === "object" && "data" in response) {
        return {
          status: "healthy",
          baseUrl: runtimeConfig.baseUrl,
        };
      }

      return {
        status: "degraded",
        baseUrl: runtimeConfig.baseUrl,
        details: "Router did not return the expected models payload.",
      };
    } catch (error) {
      return {
        status: "degraded",
        baseUrl: runtimeConfig.baseUrl,
        details: error instanceof Error ? error.message : "Router check failed.",
      };
    }
  }

  async generateJson<T>(params: GenerateJsonParams): Promise<{ data: T; modelUsed: string }> {
    const candidateModels = await this.resolveCandidateModels(params.model, params.fallbackModel);

    let lastError: unknown;
    for (const model of candidateModels) {
      for (let attempt = 0; attempt <= env.routerMaxRetries; attempt += 1) {
        try {
          const raw = await this.createCompletion({
            model,
            messages: [
              {
                role: "system",
                content: params.systemPrompt,
              },
              {
                role: "user",
                content: params.userPrompt,
              },
            ],
            temperature: params.temperature ?? 0.7,
            timeoutMs: params.timeoutMs ?? env.routerDefaultTimeoutMs,
          });

          return {
            data: parseJsonText<T>(raw),
            modelUsed: model,
          };
        } catch (error) {
          lastError = error;
          if (isModelUnavailableError(error)) {
            break;
          }

          if (attempt === env.routerMaxRetries) {
            break;
          }
        }
      }
    }

    throw normalizeRouterError(lastError);
  }

  private async resolveCandidateModels(model: string, fallbackModel?: string) {
    const candidates = [model];
    if (env.routerFallbackEnabled && fallbackModel && fallbackModel !== model) {
      candidates.push(fallbackModel);
    }

    const availableModels = await this.getAvailableModels().catch(() => []);
    if (availableModels.length > 0) {
      const availableSet = new Set(availableModels);
      const hasKnownModel = candidates.some((candidate) => availableSet.has(candidate));
      if (!hasKnownModel) {
        const compatibleModel = pickCompatibleRouterModel(availableModels);
        if (compatibleModel) {
          candidates.push(compatibleModel);
        }
      }
    }

    return [...new Set(candidates.filter(Boolean))];
  }

  private async createCompletion(params: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    timeoutMs: number;
  }) {
    const runtimeConfig = await this.getRuntimeConfig();
    const payload: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: true,
      ...(supportsJsonResponseFormat(params.model) ? { response_format: { type: "json_object" } } : {}),
      ...(runtimeConfig.source === "env"
        ? { temperature: params.temperature ?? runtimeConfig.temperature ?? 0.7 }
        : {}),
    };
    if (runtimeConfig.source === "env" && runtimeConfig.maxTokens) {
      payload.max_tokens = runtimeConfig.maxTokens;
    }
    const response = await this.fetchText("/chat/completions", {
      method: "POST",
      timeoutMs: params.timeoutMs,
      body: payload,
    }, runtimeConfig);

    const choice = extractCompletionContent(response);
    if (!choice) {
      throw new AppError("MODEL_OUTPUT_INVALID", "Router response was missing message content.", 502, {
        response,
      });
    }

    return choice;
  }

  async testConnection(model: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const text = await this.createCompletion({
        model,
        messages: [
          { role: "system", content: "You are a connectivity probe." },
          { role: "user", content: "Reply with the single word: OK" },
        ],
        temperature: 0,
        timeoutMs: 15_000,
      });
      return { ok: true, detail: text.trim().slice(0, 80) || "OK" };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "Connection test failed.",
      };
    }
  }

  private async fetchJson(
    endpoint: string,
    params: {
      method: "GET" | "POST";
      timeoutMs: number;
      body?: unknown;
    },
    runtimeConfig: RouterRuntimeConfig,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const response = await fetch(`${runtimeConfig.baseUrl}${endpoint}`, {
        method: params.method,
        headers: {
          Authorization: `Bearer ${runtimeConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new AppError("ROUTER_UNAVAILABLE", buildRouterErrorMessage(response.status, text), 502, {
          endpoint,
          status: response.status,
          body: text,
        });
      }

      return text ? (JSON.parse(text) as unknown) : {};
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("ROUTER_TIMEOUT", "Router request timed out.", 504, {
          endpoint,
          timeoutMs: params.timeoutMs,
        });
      }

      throw new AppError("ROUTER_UNAVAILABLE", "Router request failed.", 502, {
        endpoint,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchText(
    endpoint: string,
    params: {
      method: "GET" | "POST";
      timeoutMs: number;
      body?: unknown;
    },
    runtimeConfig: RouterRuntimeConfig,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const response = await fetch(`${runtimeConfig.baseUrl}${endpoint}`, {
        method: params.method,
        headers: {
          Authorization: `Bearer ${runtimeConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new AppError("ROUTER_UNAVAILABLE", buildRouterErrorMessage(response.status, text), 502, {
          endpoint,
          status: response.status,
          body: text,
        });
      }

      return text;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("ROUTER_TIMEOUT", "Router request timed out.", 504, {
          endpoint,
          timeoutMs: params.timeoutMs,
        });
      }

      throw new AppError("ROUTER_UNAVAILABLE", "Router request failed.", 502, {
        endpoint,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getRuntimeConfig() {
    return this.runtimeConfigProvider();
  }

  private async fetchModelsPayload(runtimeConfig?: RouterRuntimeConfig) {
    const resolvedRuntimeConfig = runtimeConfig ?? (await this.getRuntimeConfig());
    return this.fetchJson("/models", {
      method: "GET",
      timeoutMs: 5_000,
    }, resolvedRuntimeConfig);
  }

  private async getAvailableModels() {
    if (this.availableModelsCache) {
      return this.availableModelsCache;
    }

    const response = await this.fetchModelsPayload();
    const modelIds = extractModelIds(response);
    this.availableModelsCache = modelIds;
    return modelIds;
  }
}

function extractChoiceContent(response: unknown) {
  if (!response || typeof response !== "object" || !("choices" in response) || !Array.isArray(response.choices)) {
    return null;
  }

  const firstChoice = response.choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || !("message" in firstChoice)) {
    return null;
  }

  const message = firstChoice.message;
  if (!message || typeof message !== "object" || !("content" in message)) {
    return null;
  }

  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("\n");
  }

  return null;
}

function extractCompletionContent(rawResponse: string) {
  if (!rawResponse.trim()) {
    return null;
  }

  if (!isServerSentEventPayload(rawResponse)) {
    return extractChoiceContent(JSON.parse(rawResponse));
  }

  let content = "";
  for (const eventData of readServerSentEventData(rawResponse)) {
    if (eventData === "[DONE]") {
      break;
    }

    const parsed = JSON.parse(eventData) as unknown;
    const chunkContent = extractChoiceContent(parsed) ?? extractChoiceDeltaContent(parsed);
    if (chunkContent) {
      content += chunkContent;
    }
  }

  return content || null;
}

function isServerSentEventPayload(value: string) {
  return /^\s*data:/m.test(value);
}

function readServerSentEventData(value: string) {
  return value
    .split(/\r?\n\r?\n/)
    .flatMap((event) =>
      event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim()),
    )
    .filter(Boolean);
}

function extractChoiceDeltaContent(response: unknown) {
  if (!response || typeof response !== "object" || !("choices" in response) || !Array.isArray(response.choices)) {
    return null;
  }

  const firstChoice = response.choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || !("delta" in firstChoice)) {
    return null;
  }

  const delta = firstChoice.delta;
  if (!delta || typeof delta !== "object" || !("content" in delta)) {
    return null;
  }

  return typeof delta.content === "string" ? delta.content : null;
}

function supportsJsonResponseFormat(model: string) {
  const normalized = model.toLowerCase();
  // Some providers (Anthropic Claude, certain Korean models) do not support the
  // OpenAI-style response_format json_object. Match anywhere in the model id, not
  // just the namespace prefix, so bare ids like "claude-opus-4.8" are covered.
  const unsupportedMarkers = ["anthropic", "claude"];
  if (unsupportedMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }
  const prefix = normalized.split("/")[0] || "";
  return prefix !== "kr";
}

function extractModelIds(response: unknown) {
  if (!response || typeof response !== "object" || !("data" in response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data
    .map((entry) => {
      if (entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string") {
        return entry.id;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function pickCompatibleRouterModel(models: string[]) {
  const priorityPatterns = [/gpt-5\.5/i, /gpt-5\.4/i, /gpt-5\.2/i, /gpt-5/i, /codex/i];
  for (const pattern of priorityPatterns) {
    const match = models.find((model) => pattern.test(model));
    if (match) {
      return match;
    }
  }

  return models[0] ?? null;
}

function buildRouterErrorMessage(status: number, rawBody: string) {
  const generic = `Router returned HTTP ${status}.`;
  if (!rawBody?.trim()) {
    return generic;
  }

  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        message?: string;
        code?: string;
      };
    };

    const message = parsed.error?.message?.trim();
    const code = parsed.error?.code?.trim();
    if (message && code) {
      return `${generic} ${message} (${code})`;
    }

    if (message) {
      return `${generic} ${message}`;
    }
  } catch {
    return `${generic} ${rawBody.trim()}`;
  }

  return generic;
}

function normalizeRouterError(error: unknown) {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("UNKNOWN_ERROR", error.message, 500);
  }

  return new AppError("UNKNOWN_ERROR", "Unknown router error.", 500);
}

function isModelUnavailableError(error: unknown) {
  if (!isAppError(error) || error.code !== "ROUTER_UNAVAILABLE") {
    return false;
  }

  const details = error.details as { endpoint?: unknown; status?: unknown; body?: unknown } | undefined;
  if (details?.endpoint !== "/chat/completions" || typeof details.body !== "string") {
    return false;
  }

  const status = details.status as number | undefined;

  // Classic 404 model-not-found
  if (status === 404 && /model\b.*\b(not available|not found|does not exist)/i.test(details.body)) {
    return true;
  }

  // Upstream errors from ckey.vn proxy: 401 (auth rejected), 403 (permission), 502 (upstream down)
  if (status === 401 || status === 403 || status === 502) {
    return true;
  }

  return false;
}
