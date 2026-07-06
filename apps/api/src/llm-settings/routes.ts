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
    { id: 'c', label: 'C-PROVIDER', provider: 'c', model: 'tanynguyen97/deepseek-v4-flash [cheap]' },
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
    const result = await dependencies.testConnection(resolved.data);
    // A successful test now also persists the tested draft, so it becomes the
    // settings story generation reads via resolve(). Previously "Test
    // connection" only validated the draft in-memory: a user could test a new
    // key, see "OK", forget to press the separate "Save" button, and then hit
    // a 401 on story generation because it still read the old saved key. Only
    // persist on success so a failing key never overwrites a working one.
    if (result.ok) {
      const saveResult = await dependencies.handler.save(userId, request.body as SaveLlmSettingsInput);
      if (saveResult.success === false) {
        return reply.send({
          ok: false,
          detail: `Kết nối OK nhưng không lưu được cấu hình: ${saveResult.error.message}`,
        });
      }
    }
    return reply.send(result);
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
