import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import type {
  EffectiveLlmSettings,
  LlmSettingsResult,
  LlmSettingsSpec,
  PublicLlmSettings,
  SaveLlmSettingsInput,
} from './spec.js';

type RouteDependencies = {
  handler: LlmSettingsSpec;
  authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null>;
  testConnection(
    settings: EffectiveLlmSettings,
  ): Promise<{ ok: boolean; detail: string }>;
};

export const LLM_PROVIDER_CATALOG = {
  tabs: [
    { id: 'c', label: 'C-PROVIDER' },
    { id: 's', label: 'S-PROVIDER' },
    { id: 'other', label: 'OTHER' },
  ],
  presets: [
    { id: 'c', label: 'C-PROVIDER', provider: 'c', model: 'mainnewnol/deepseek-v4-flash' },
    { id: 's', label: 'S-PROVIDER', provider: 's' },
    { id: 'openai', label: 'OpenAI', provider: 'other', baseUrl: 'https://api.openai.com/v1' },
    { id: 'openrouter', label: 'OpenRouter', provider: 'other', baseUrl: 'https://openrouter.ai/api/v1' },
    {
      id: 'gemini-openai',
      label: 'Gemini (OpenAI-compatible)',
      provider: 'other',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    },
  ],
} as const;

export function registerLlmSettingsRoutes(
  app: FastifyInstance,
  dependencies: RouteDependencies,
) {
  app.get('/llm/providers', async (_request, reply) => reply.send(LLM_PROVIDER_CATALOG));

  app.get('/llm/settings', async (request, reply) => {
    const userId = await dependencies.authenticate(request, reply);
    if (!userId) return reply;
    return sendResult(reply, await dependencies.handler.getPublic(userId));
  });

  app.put('/llm/settings', async (request, reply) => {
    const userId = await dependencies.authenticate(request, reply);
    if (!userId) return reply;
    return sendResult(
      reply,
      await dependencies.handler.save(userId, request.body as SaveLlmSettingsInput),
    );
  });

  app.post('/llm/settings/test', async (request, reply) => {
    const userId = await dependencies.authenticate(request, reply);
    if (!userId) return reply;
    const resolved = await dependencies.handler.resolveDraft(
      userId,
      request.body as SaveLlmSettingsInput,
    );
    if (resolved.success === false) return sendFailure(reply, resolved);
    return reply.send(await dependencies.testConnection(resolved.data));
  });
}

function sendResult(
  reply: FastifyReply,
  result: LlmSettingsResult<PublicLlmSettings>,
) {
  if (result.success === false) return sendFailure(reply, result);
  return reply.send(result.data);
}

function sendFailure(
  reply: FastifyReply,
  result: Extract<LlmSettingsResult<unknown>, { success: false }>,
) {
  const statusCode = result.error.code === 'NOT_CONFIGURED'
    ? 400
    : result.error.code === 'INVALID_INPUT' || result.error.code === 'BASE_URL_NOT_ALLOWED'
      ? 422
      : 500;
  return reply.code(statusCode).send({ error: result.error });
}
