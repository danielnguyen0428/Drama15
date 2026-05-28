import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { buildCorsHeaders, buildStreamHeaders } from './streamHeaders.js';
import { consumeStoryQuota, getQuotaSnapshot, getSupabaseAdmin, isAdminRequest, requireUser } from './supabaseServer.js';
import { StoryStore } from './storyStore.js';
import type {
  Chapter,
  NormalizedFullGenerateRequest,
  NormalizedOutlineRequest,
  RegenerateMode,
  StoryPayload,
} from '../../../src/types/story.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..', '..');

process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;

const { env } = await import('../../../src/lib/env.js');
const { isAppError } = await import('../../../src/lib/errors.js');
const { StoryOrchestrator } = await import('../../../src/modules/orchestrator/story-orchestrator.js');
const { PresetLoader } = await import('../../../src/modules/presets/preset-loader.js');
const { RouterClient } = await import('../../../src/modules/router/router-client.js');
const { SeedHistoryStore } = await import('../../../src/modules/session/seed-history-store.js');
const {
  NormalizedFullGenerateRequestSchema,
  NormalizedOutlineRequestSchema,
  StoryControlsSchema,
  StoryPayloadSchema,
} = await import('../../../src/schemas/story.js');

type ClientChapter = {
  index: number;
  title?: string;
  content: string;
};

type StreamPayload = Record<string, unknown> & {
  stage: 'progress' | 'overview' | 'bible' | 'plan' | 'relationshipGraph' | 'chapter' | 'done' | 'error';
};

type StoryJob = {
  id: string;
  userId: string;
  createdAt: string;
  request: NormalizedFullGenerateRequest;
  events: StreamPayload[];
  clients: Set<(payload: StreamPayload) => void>;
  promise?: Promise<StoryPayload>;
  saveChain?: Promise<void>;
  storyPayload?: StoryPayload;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
};

const RenameStorySchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const UpdateTierSchema = z.object({
  tier: z.enum(['free', 'pro', 'premium']),
});

const StoryConfigSchema = z.object({
  niche: z.string().trim().min(1).default(env.defaultLinePreset),
  customNiche: z.string().trim().default(''),
  title: z.string().trim().default(''),
  seed: z.string().trim().default(''),
  outputLanguage: z
    .enum(['english', 'vietnamese', 'japanese', 'korean', 'portuguese', 'spanish'])
    .default('vietnamese'),
  intensity: z.coerce.number().min(0).max(1).default(0.84),
  dialogueRatio: z.coerce.number().min(0.2).max(0.85).default(0.56),
  hookDensity: z.coerce.number().min(0).max(1).default(0.67),
  stylePreset: z.string().trim().min(1).default(env.defaultStylePreset),
  storyControls: StoryControlsSchema.optional(),
});

const RewriteBodySchema = z.object({
  chapterIndex: z.coerce.number().int().min(1).max(10),
  mode: z.string().trim().min(1).default('full_chapter'),
  instruction: z.string().trim().min(1),
});

const modeMap: Record<string, RegenerateMode> = {
  full_chapter: 'rewrite_chapter',
  opening_hook: 'rewrite_hook',
  closing_beat: 'rewrite_ending_beat',
  dialogue_tone: 'rewrite_dialogue_tone',
  class_humiliation: 'rewrite_class_shame',
  retaliation_sharpness: 'rewrite_revenge_sharpness',
};

const jobs = new Map<string, StoryJob>();
const orchestrator = new StoryOrchestrator(
  new PresetLoader(),
  new RouterClient(),
  env.modelPreset,
  new SeedHistoryStore(),
);

function getStoryStore() {
  return new StoryStore(getSupabaseAdmin());
}

const app = fastify({
  bodyLimit: 1024 * 1024,
  logger: { level: env.logLevel },
});

app.addHook('onRequest', (request, reply, done) => {
  for (const [key, value] of Object.entries(buildCorsHeaders(request.headers.origin, env.corsOrigins))) {
    reply.header(key, value);
  }

  if (request.method === 'OPTIONS') {
    void reply.code(204).send();
    return;
  }

  done();
});

app.get('/healthz', async () => ({
  ok: true,
  service: 'drama15-local-api',
  routerBaseUrl: env.routerBaseUrl,
}));

app.get('/story/style-presets', async (_request, reply) => {
  try {
    return reply.send({ presets: await listStylePresets() });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.get('/auth/me', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const quota = await getQuotaSnapshot(user);
    return reply.send({ user, quota });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.post('/story/setup-suggest', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const config = StoryConfigSchema.parse(request.body);
    const suggestionRequest = normalizeOutlineRequest(config);
    const result = await orchestrator.generateSettingSeed(suggestionRequest);

    return reply.send({
      title: result.seedPackage.titleHint,
      seed: result.seedPackage.settingSeed,
      linePreset: result.seedPackage.linePreset,
      storyControls: result.seedPackage.storyControls,
      draftControls: result.seedPackage.draftControls,
    });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.get('/stories', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const stories = await getStoryStore().listStories(user);
    return reply.send({ stories });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.post('/stories', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const config = StoryConfigSchema.parse(request.body);
    const storyRequest = normalizeFullRequest(config);
    const quota = await consumeStoryQuota(user);
    if (!quota.allowed) {
      return reply.code(429).send({
        error: {
          code: 'quota_exceeded',
          message: `Bạn đã dùng hết ${quota.limit} bộ drama hôm nay. Nâng cấp Pro hoặc Premium để có thêm bộ drama có thể sáng tác.`,
        },
        quota,
      });
    }

    const id = randomUUID();
    const job: StoryJob = {
      id,
      userId: user.id,
      createdAt: new Date().toISOString(),
      request: storyRequest,
      events: [],
      clients: new Set(),
      status: 'queued',
    };

    await getStoryStore().createQueuedStory({
      id,
      user,
      title: config.title || 'Drama chưa đặt tên',
      config,
      request: storyRequest,
    });
    jobs.set(id, job);

    return reply.code(201).send({ storyId: id, status: job.status, quota });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.get('/stories/:id', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const story = await getStoryStore().getStory(user, id);
    if (!story) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy truyện.' } });
    }
    return reply.send({ story });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.get('/stories/:id/stream', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const job = jobs.get(id);

  if (!job || job.userId !== user.id) {
    return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy phiên viết truyện.' } });
  }

  reply.raw.writeHead(200, buildStreamHeaders(request.headers.origin, env.corsOrigins));

  const write = (payload: StreamPayload) => {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  for (const payload of job.events) {
    write(payload);
  }

  job.clients.add(write);
  request.raw.on('close', () => {
    job.clients.delete(write);
  });

  if (!job.promise) {
    job.promise = runStoryJob(job);
  }

  return reply;
});

app.post('/stories/:id/rewrite', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const job = jobs.get(id);
    if (job && job.userId !== user.id) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy truyện.' } });
    }
    const storedStory = job?.storyPayload ? null : await getStoryStore().getStory(user, id);
    const storyPayload = job?.storyPayload ?? storedStory?.storyPayload;

    if (!storyPayload) {
      return reply.code(409).send({
        error: { code: 'story_not_ready', message: 'Cần tạo xong bản thảo trước khi viết lại chương.' },
      });
    }

    const body = RewriteBodySchema.parse(request.body);
    const mode = modeMap[body.mode] ?? 'rewrite_chapter';
    const result = await orchestrator.regenerateChapter({
      storyPayload,
      targetChapter: body.chapterIndex,
      mode,
      instruction: body.instruction,
      preserveConstraints: {
        preserveNames: true,
        preserveMainReveal: true,
        preserveEndingMode: true,
      },
    });

    if (job) job.storyPayload = result.storyPayload;
    await getStoryStore().saveStoryPayload(user.id, id, result.storyPayload, 'completed');

    return reply.send({
      chapter: toClientChapter(result.chapter),
      storyPayload: result.storyPayload,
      relationshipGraph: result.storyPayload.relationshipGraph,
    });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.patch('/stories/:id', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = RenameStorySchema.parse(request.body);
    const story = await getStoryStore().renameStory(user, id, body.title);
    if (!story) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy truyện.' } });
    }
    return reply.send({ story });
  } catch (error) {
    return sendError(reply, error);
  }
});

app.delete('/stories/:id', async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return reply;

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const story = await getStoryStore().getStory(user, id);
    if (!story) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy truyện.' } });
    }
    await getStoryStore().deleteStory(user, id);
    jobs.delete(id);
    return reply.code(204).send();
  } catch (error) {
    return sendError(reply, error);
  }
});

app.patch('/admin/users/:id/tier', async (request, reply) => {
  if (!isAdminRequest(request)) {
    return reply.code(401).send({ error: { code: 'unauthorized', message: 'Admin API key không hợp lệ.' } });
  }

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = UpdateTierSchema.parse(request.body);
    const user = await getStoryStore().updateUserTier(id, body.tier);
    if (!user) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy người dùng.' } });
    }
    return reply.send({ user });
  } catch (error) {
    return sendError(reply, error);
  }
});

async function runStoryJob(job: StoryJob) {
  job.status = 'running';
  await getStoryStore().updateStatus(job.userId, job.id, 'running');
  const sent = {
    outline: false,
    chapters: new Set<number>(),
  };

  try {
    const storyPayload = await orchestrator.generateFull(job.request, {
      onProgress: (event) => {
        broadcast(job, {
          stage: 'progress',
          label: event.label,
          detail: event.detail,
          current: event.current,
          total: event.total,
          status: event.status,
        });

        if (event.storyPayload) {
          emitStoryPayload(job, event.storyPayload, sent);
          job.storyPayload = event.storyPayload;
          job.saveChain = (job.saveChain ?? Promise.resolve())
            .then(() => getStoryStore().saveStoryPayload(job.userId, job.id, event.storyPayload!, 'running'))
            .catch((error) => {
              app.log.error({ error, storyId: job.id }, 'failed to save partial story payload');
            });
        }

        if (event.chapter && !sent.chapters.has(event.chapter.chapterNumber)) {
          sent.chapters.add(event.chapter.chapterNumber);
          broadcast(job, {
            stage: 'chapter',
            chapter: toClientChapter(event.chapter),
          });
        }
      },
    });

    job.storyPayload = storyPayload;
    emitStoryPayload(job, storyPayload, sent);
    job.status = 'completed';
    await job.saveChain;
    await getStoryStore().saveStoryPayload(job.userId, job.id, storyPayload, 'completed');
    broadcast(job, { stage: 'done', title: storyPayload.title });
    return storyPayload;
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Story generation failed.';
    await getStoryStore().updateStatus(job.userId, job.id, 'failed', job.error).catch((storeError) => {
      app.log.error({ error: storeError, storyId: job.id }, 'failed to save failed story status');
    });
    broadcast(job, { stage: 'error', error: job.error });
    throw error;
  }
}

function emitStoryPayload(
  job: StoryJob,
  storyPayload: StoryPayload,
  sent: { outline: boolean; chapters: Set<number> },
) {
  if (!sent.outline) {
    sent.outline = true;
    broadcast(job, {
      stage: 'overview',
      title: storyPayload.title,
      concept: formatConcept(storyPayload),
    });
    broadcast(job, { stage: 'bible', bible: storyPayload.storyBible });
    broadcast(job, { stage: 'plan', plan: formatPlan(storyPayload) });
    broadcast(job, { stage: 'relationshipGraph', relationshipGraph: storyPayload.relationshipGraph });
  }

  for (const chapter of storyPayload.chapters) {
    if (sent.chapters.has(chapter.chapterNumber)) {
      continue;
    }

    sent.chapters.add(chapter.chapterNumber);
    broadcast(job, { stage: 'chapter', chapter: toClientChapter(chapter) });
  }
}

function broadcast(job: StoryJob, payload: StreamPayload) {
  job.events.push(payload);
  for (const client of job.clients) {
    client(payload);
  }
}

function normalizeOutlineRequest(config: z.infer<typeof StoryConfigSchema>): NormalizedOutlineRequest {
  const dramaBranch = config.customNiche.trim();
  const linePreset = config.niche === 'custom' ? env.defaultLinePreset : config.niche;

  return NormalizedOutlineRequestSchema.parse({
    titleHint: config.title || undefined,
    linePreset,
    stylePreset: config.stylePreset || env.defaultStylePreset,
    outputLanguage: config.outputLanguage,
    audience: {
      genderFocus: 'female',
      ageBand: '18_34',
      market: 'global',
    },
    storyControls: config.storyControls ?? {
      betrayalType: 'hidden_relationship_replaced_by_fiancee',
      shameType: 'polite_class_exclusion',
      revengeMode: 'strategic_withdrawal_status_reversal',
      endingMode: 'bittersweet_dignity_first',
      intensity: config.intensity,
    },
    customCreativeInputs: dramaBranch
      ? { dramaBranch, stylePreset: config.stylePreset }
      : { stylePreset: config.stylePreset },
    settingSeed: config.seed || undefined,
    chapterCount: 10,
  });
}

function normalizeFullRequest(config: z.infer<typeof StoryConfigSchema>): NormalizedFullGenerateRequest {
  return NormalizedFullGenerateRequestSchema.parse({
    ...normalizeOutlineRequest(config),
    draftControls: {
      dialogueRatio: config.dialogueRatio,
      hookDensity: toHookDensity(config.hookDensity),
    },
  });
}

function toHookDensity(value: number): 'low' | 'medium' | 'high' {
  if (value < 0.34) {
    return 'low';
  }

  if (value < 0.67) {
    return 'medium';
  }

  return 'high';
}

async function listStylePresets() {
  const stylesRoot = path.join(projectRoot, 'presets', 'styles');
  const files = (await fs.readdir(stylesRoot)).filter((file) => file.endsWith('.json'));
  const presets = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(stylesRoot, file), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    presets.push({
      id: String(parsed.id ?? path.basename(file, '.json')),
      displayName: String(parsed.displayName ?? parsed.id ?? path.basename(file, '.json')),
      description: String(parsed.description ?? ''),
    });
  }

  return presets.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function toClientChapter(chapter: Chapter): ClientChapter {
  return {
    index: chapter.chapterNumber,
    title: chapter.title,
    content: chapter.text,
  };
}

function formatConcept(storyPayload: StoryPayload) {
  return [
    `Nhan đề: ${storyPayload.title}`,
    `Tóm tắt một câu: ${storyPayload.concept.logline}`,
    `Lời hứa thể loại: ${storyPayload.concept.promise}`,
    `Xung đột: ${storyPayload.concept.conflictEngine}`,
  ].join('\n');
}

function formatPlan(storyPayload: StoryPayload) {
  return storyPayload.chapterPlan
    .map((chapter) => [
      `${chapter.chapterNumber}. ${chapter.title}`,
      `Nhịp chính: ${chapter.mainBeat}`,
      `Móc câu: ${chapter.hook}`,
      `Kết chương: ${chapter.endingBeat}`,
    ].join('\n'))
    .join('\n\n');
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'validation_error',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        issues: error.issues,
      },
    });
  }

  if (isAppError(error)) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  return reply.code(500).send({
    error: {
      code: 'unknown_error',
      message: error instanceof Error ? error.message : 'API gặp lỗi ngoài dự kiến.',
    },
  });
}

async function start() {
  if (env.supabaseUrl && env.supabaseServiceRoleKey) {
    await getStoryStore().markStaleRunningStoriesFailed();
  }

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`Drama15 API listening on http://${env.host}:${env.port}`);
}

process.on('SIGINT', () => {
  void app.close().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void app.close().finally(() => process.exit(0));
});

await start();
