/**
 * Development boot script - starts the API on plain HTTP (no TLS required).
 *
 * Usage: `npx tsx src/startDev.ts`
 *
 * This is NOT for production. Production uses `start.ts` which enforces HTTPS.
 */
import process from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { buildServer } from './server.js';
import { InMemoryChallengeStore, OAuthStartService } from './auth/oauth/index.js';
import { signJwt, verifyJwt } from './lib/hsJwt.js';
import { registerSecurity, EXPENSIVE_BUCKET, PUBLISH_BUCKET, } from './lib/securityPlugin.js';
import { createAtomicJsonStore } from './lib/atomicJsonStore.js';
import { createDailyQuota } from './lib/dailyQuota.js';
import { CreateStorySchema, SetupSuggestSchema, resolveNicheKey, RewriteSchema, } from './lib/storyValidation.js';
import { createSeedBlueprint, renderSeedBlueprintForPrompt, renderRecentSeedHistoryForPrompt, renderRecentCharacterNamesForPrompt, renderTrendAwareSeedEngineForPrompt, renderNicheAwareTitleGrammarForPrompt,
// Full pipeline prompt builders
buildConceptSystemPrompt, buildConceptUserPrompt, buildStoryBibleSystemPrompt, buildStoryBibleUserPrompt, buildChapterPlanSystemPrompt, buildChapterPlanUserPrompt, buildChapterDraftSystemPrompt, buildChapterDraftUserPrompt, buildChapterRepairUserPrompt,
// Quality validation
analyzeChapterQuality, needsChapterRetry, summarizeChapter, TEMPERATURE_CONCEPT, TEMPERATURE_BIBLE, TEMPERATURE_PLAN, TEMPERATURE_CHAPTER_DRAFT, TEMPERATURE_CHAPTER_REPAIR, MAX_CHAPTER_REPAIR_ATTEMPTS,
// Style resolution
resolveStyle,
// Extended repair loop for character drift
buildChapterRepairUserPromptWithDrift, MAX_CHAPTER_REPAIR_ATTEMPTS_WITH_DRIFT,
// Fact sheet extraction
buildFactExtractionSystemPrompt, buildFactExtractionUserPrompt, validateCharacterFactSheet, extractCharacterNamesFallback, TEMPERATURE_FACT_EXTRACTION, TEMPERATURE_FACT_EXTRACTION_RETRY,
// Bible name extraction (for seed-history character-name dedup)
extractBibleCharacterNames,
// Desktop-parity helpers
buildContinuityLiteFromBible, renderContinuityLiteForPrompt, renderChapterPlanItemForPrompt, getPlannedChapterTitle, alignChapterTitle, validateChapterDraftShape, } from './storyEngine.js';
import { buildValidationSystemPrompt, buildValidationUserPrompt, parseDriftReport, hasCriticalViolations, TEMPERATURE_VALIDATION, buildIdiolectRepairInstruction, } from './stories/consistencyValidator.js';
import { memoryStoreToPromptContext, createEmptyMemoryStore, addFactSheet, } from './stories/characterMemoryStore.js';
import { buildCharacterSummarySystemPrompt, buildCharacterSummaryUserPrompt, validateCharacterSummary, characterSummaryToString, } from './stories/characterSummary.js';
import { parseConcept, parseStoryBible, parseChapterPlan, parseChapterDraft, ensureChapterPlanIntegrity, hasOnlySoftChapterQualityFailures, loadStylePreset, listAvailableStylePresetIds, renderStylePresetForPrompt, } from './stories/desktopParity.js';
import { createFilePendingStoriesStore, defaultPendingStoresPath, } from './stories/pendingStoriesStore.js';
import { createCircuitBreaker, UpstreamUnavailableError } from './lib/circuitBreaker.js';
import { detectAiTells, buildAiTellRepairInstruction, } from './stories/vietnameseAiTells.js';
import { streamAndCollect } from './stories/callLLMStream.js';
import { createPhraseReuseIndex, indexChapter, scoreCandidate, buildReuseRepairInstruction, } from './stories/phraseReuseTracker.js';
import { analyzeSentenceVariance, buildVarianceRepairInstruction, } from './stories/sentenceVarianceAnalyzer.js';
import { createLrtDetector, noopDetector, buildHumanizationRepairInstruction, } from './stories/aiDetector.js';
// Load .env
import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5173/auth/google/callback';
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const HOST = '127.0.0.1';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'http://localhost:20128/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'dummy';
const ROUTER_MODEL = process.env.ROUTER_MODEL ?? 'cx/gpt-5.5';
// --- Security configuration ----------------------------------------------
//
// JWT signing secret. Required in production (NODE_ENV=production); in dev
// we generate one at boot if missing so local runs don't fail. A boot-time
// secret invalidates all outstanding tokens on every restart, which is
// desirable behaviour for development.
const JWT_SECRET = (() => {
    const fromEnv = process.env.JWT_SECRET;
    if (fromEnv && fromEnv.length >= 32)
        return fromEnv;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set (>= 32 chars) in production');
    }
    // eslint-disable-next-line no-console
    console.warn('[security] JWT_SECRET not set - generating ephemeral dev secret. Set JWT_SECRET to keep sessions across restarts.');
    return randomBytes(48).toString('hex');
})();
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'https://api.vibify.work';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'https://drama.novelkit.cc';
const JWT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Allowed Web_Client origins (exact match, no wildcards). Add via
// `ALLOWED_ORIGINS` env (comma-separated) for staging hosts.
const DEFAULT_ALLOWED_ORIGINS = [
    'https://drama.novelkit.cc',
];
const ALLOWED_ORIGINS = (() => {
    const fromEnv = (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const isProd = process.env.NODE_ENV === 'production';
    const set = new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]);
    if (!isProd) {
        set.add('http://localhost:5173');
        set.add('http://localhost:5174');
        set.add('http://127.0.0.1:5173');
    }
    return Array.from(set);
})();
// Feature flags (Wave 5-7)
const FEATURE_PHRASE_REUSE_TRACKER = process.env.FEATURE_PHRASE_REUSE_TRACKER !== 'false'; // default: true
const FEATURE_IDIOLECT = process.env.FEATURE_IDIOLECT !== 'false'; // default: true
const FEATURE_HUMANIZATION_RULES = process.env.FEATURE_HUMANIZATION_RULES !== 'false'; // default: true
const FEATURE_HUMANIZATION_DETECTOR = process.env.FEATURE_HUMANIZATION_DETECTOR === 'true'; // default: false

// SSE reconnect support: cache frames and track running pipelines
const sseFrameCache = new Map<string, string[]>();
const ssePipelinePromises = new Map<string, Promise<void>>();

async function main() {
    // Module-level circuit breaker around the LLM router. 3 failures within
    // 30s trip it OPEN for 30s; one HALF_OPEN probe afterwards. Prevents the
    // 13-call story pipeline from hanging up to 39 minutes when the router
    // is down (180s timeout - 13 calls).
    const llmCircuitBreaker = createCircuitBreaker({
        failureThreshold: 3,
        windowMs: 30_000,
        cooldownMs: 30_000,
    });
    // AI Detector instance (Wave 7). Created once at startup based on feature flag.
    // When FEATURE_HUMANIZATION_DETECTOR is off, uses noopDetector (always returns null).
    const aiDetector = FEATURE_HUMANIZATION_DETECTOR
        ? createLrtDetector({
            baseUrl: OPENAI_BASE_URL,
            apiKey: OPENAI_API_KEY,
            model: ROUTER_MODEL,
        })
        : noopDetector;
    // Helper to call LLM (supports both OpenAI and Anthropic response formats)
    async function callLLM(systemPrompt, userPrompt, maxTokens, temperature = 0.85) {
        return llmCircuitBreaker.exec(async () => {
            const resp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: ROUTER_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    stream: false,
                }),
                signal: AbortSignal.timeout(180000),
            });
            if (!resp.ok) {
                throw new Error(`LLM returned ${resp.status}: ${await resp.text()}`);
            }
            const data = await resp.json();
            // OpenAI format: data.choices[0].message.content
            if (data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
            // Anthropic format: data.content[].type === 'text'
            if (Array.isArray(data.content)) {
                const textBlock = data.content.find((c) => c.type === 'text');
                if (textBlock?.text)
                    return textBlock.text;
            }
            return '';
        });
    }
    /** Extract JSON from LLM response (handles markdown fences) */
    function extractJson(raw) {
        // Try stripping markdown fences first
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fenced?.[1] ?? raw;
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[0]);
        }
        catch {
            return null;
        }
    }
    const app = await buildServer({
        enforceHttps: false, // Allow plain HTTP in dev - Cloudflare Tunnel terminates TLS at the edge
        logger: {
            level: 'info',
            transport: { target: 'pino-pretty' }
        },
        // Cap request body size. Story config and chaptersData are the only
        // legitimately large payloads, and 256 KB comfortably fits 10 chapters
        // of ~25 KB each. Anything larger is malicious or buggy.
        bodyLimit: 256 * 1024,
    });
    // ----------------------------------------------------------------------
    // Security: CORS + JWT + per-IP/user rate limiting.
    // Public routes opt out of JWT; SSE uses authOptional + capability ID.
    // ----------------------------------------------------------------------
    const PUBLIC_PREFIXES = [
        { method: 'GET', path: '/healthz' },
        { method: 'GET', path: '/auth/oauth/start' },
        { method: 'GET', path: '/auth/oauth/callback' },
        { method: 'POST', path: '/auth/logout' },
        { method: 'POST', path: '/auth/refresh' },
        { method: 'GET', path: '/story/style-presets' },
        { method: 'GET', path: '/published-stories' },
        { method: 'GET', path: '/voices' },
    ];
    function classify(method, url) {
        const pathOnly = url.split('?')[0] ?? url;
        for (const entry of PUBLIC_PREFIXES) {
            if (entry.method !== method)
                continue;
            if (typeof entry.path === 'string') {
                if (pathOnly === entry.path)
                    return 'public';
            }
            else if (entry.path.test(pathOnly)) {
                return 'public';
            }
        }
        // SSE stream: EventSource cannot send Authorization, so it relies on the
        // unguessable storyId in the path as the capability. JWT is optional -
        // if present we pin the stream to the owner; if absent we fall back to
        // the IP-based rate limit and the storyId binding.
        if (method === 'GET' && /^\/stories\/[^/]+\/stream$/.test(pathOnly))
            return 'authOptional';
        return 'protected';
    }
    function selectBucket(req) {
        const url = req.url.split('?')[0] ?? req.url;
        // Skip rate-limit for the SSE stream itself (one long-lived connection).
        if (req.method === 'GET' && /^\/stories\/[^/]+\/stream$/.test(url))
            return null;
        // Expensive LLM-backed endpoints
        if (req.method === 'POST' && (url === '/stories' ||
            url === '/story/setup-suggest' ||
            /^\/stories\/[^/]+\/rewrite$/.test(url) ||
            /^\/stories\/[^/]+\/resume$/.test(url) ||
            url === '/voices/generate' ||
            url === '/export/pdf')) {
            return EXPENSIVE_BUCKET;
        }
        if ((req.method === 'POST' || req.method === 'PATCH') && /^\/published-stories(\/.+)?$/.test(url)) {
            return PUBLISH_BUCKET;
        }
        return null;
    }
    await registerSecurity(app, {
        allowedOrigins: ALLOWED_ORIGINS,
        jwtSecret: JWT_SECRET,
        jwtAudience: JWT_AUDIENCE,
        jwtIssuer: JWT_ISSUER,
        classify,
        selectBucket,
    });
    // --- Pending stories persistent store ---
    // Survives `tsx watch` reloads so POST /stories config does not vanish
    // before GET /stories/:id/stream picks it up.
    const pendingStoriesStore = createFilePendingStoriesStore(defaultPendingStoresPath());
    // --- Server-authoritative daily quota ---
    // Mirrors the web client's localStorage `DAILY_QUOTA_KEY` (2 stories/day)
    // but server-side so a hostile user cannot bypass it by clearing storage.
    // Identity = verified `sub` for authenticated callers, `ip:<addr>` for anonymous.
    const DAILY_STORY_LIMIT = Number.parseInt(process.env.DAILY_STORY_LIMIT ?? '5', 10);
    const dailyStoryQuota = createDailyQuota({
        filePath: path.resolve(process.cwd(), 'daily-quota.json'),
        limit: DAILY_STORY_LIMIT,
    });
    // Best-effort cleanup of expired entries every 30 minutes.
    const pendingCleanupTimer = setInterval(() => {
        pendingStoriesStore.cleanupExpired().catch((err) => {
            app.log.warn({ err: err.message }, 'pending stories cleanup failed');
        });
    }, 30 * 60 * 1000);
    // Allow the process to exit cleanly when SIGINT - node leaves intervals
    // pinned otherwise.
    if (typeof pendingCleanupTimer.unref === 'function')
        pendingCleanupTimer.unref();
    // --- OAuth Start Route ---
    const challengeStore = new InMemoryChallengeStore();
    const oauthStartService = new OAuthStartService({ store: challengeStore });
    app.get('/auth/oauth/start', async (request, reply) => {
        const result = await oauthStartService.start({
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: GOOGLE_REDIRECT_URI,
            scope: 'openid email profile',
            fingerprint: undefined
        });
        return reply.send(result);
    });
    // --- OAuth Callback Route (simplified for dev - exchanges code with Google) ---
    app.get('/auth/oauth/callback', async (request, reply) => {
        const { code, state } = request.query;
        if (!code || !state) {
            return reply.code(400).send({ error: { code: 'missing_params', message: 'code and state are required' } });
        }
        // Look up the challenge
        const challenge = await challengeStore.take(state);
        if (!challenge) {
            return reply.code(400).send({ error: { code: 'state_not_found', message: 'OAuth state expired or invalid' } });
        }
        // Exchange code for tokens with Google
        const tokenUrl = 'https://oauth2.googleapis.com/token';
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code',
                code_verifier: challenge.codeVerifier
            })
        });
        if (!tokenResponse.ok) {
            const err = await tokenResponse.text();
            request.log.error({ err }, 'Google token exchange failed');
            return reply.code(502).send({ error: { code: 'token_exchange_failed', message: 'Failed to exchange code with Google' } });
        }
        const tokens = await tokenResponse.json();
        // Decode the ID token (without full verification for dev - production uses the full OAuthCallbackHandler)
        const idToken = tokens.id_token;
        if (!idToken) {
            return reply.code(502).send({ error: { code: 'no_id_token', message: 'Google did not return an ID token' } });
        }
        // Decode JWT payload (base64url)
        const payloadB64 = idToken.split('.')[1];
        if (!payloadB64) {
            return reply.code(502).send({ error: { code: 'malformed_id_token', message: 'ID token is malformed' } });
        }
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (!payload.email_verified) {
            return reply.code(403).send({ error: { code: 'email_not_verified', message: 'Google email is not verified' } });
        }
        // Mint a real HS256 JWT bound to this user. The web client puts it in
        // sessionStorage and sends it as `Authorization: Bearer <jwt>`.
        const accessToken = signJwt({
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
        }, {
            secret: JWT_SECRET,
            ttlSeconds: JWT_TTL_SECONDS,
            audience: JWT_AUDIENCE,
            issuer: JWT_ISSUER,
        });
        reply.header('Cache-Control', 'no-store');
        return reply.send({
            accessToken,
            expiresIn: JWT_TTL_SECONDS,
            profile: {
                googleSub: payload.sub,
                email: payload.email,
                name: payload.name,
                picture: payload.picture
            },
            message: 'Login successful.'
        });
    });
    app.post('/auth/refresh', async (request, reply) => {
        const auth = request.headers.authorization;
        const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
        if (!token) {
            return reply.code(401).send({ error: { code: 'unauthenticated', message: 'Missing bearer token.' } });
        }
        try {
            let claims;
            try {
                claims = verifyJwt(token, { secret: JWT_SECRET, audience: JWT_AUDIENCE, issuer: JWT_ISSUER });
            }
            catch (verifyErr) {
                if (verifyErr?.reason === 'expired') {
                    // Allow refresh within 7-day grace period
                    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
                    const nowSec = Math.floor(Date.now() / 1000);
                    const graceDays = 7 * 24 * 60 * 60;
                    if (nowSec - payload.exp > graceDays)
                        throw verifyErr;
                    claims = payload;
                }
                else {
                    throw verifyErr;
                }
            }
            const accessToken = signJwt({
                sub: claims.sub,
                email: claims.email,
                name: claims.name,
                role: claims.role,
            }, {
                secret: JWT_SECRET,
                ttlSeconds: JWT_TTL_SECONDS,
                audience: JWT_AUDIENCE,
                issuer: JWT_ISSUER,
            });
            reply.header('Cache-Control', 'no-store');
            return reply.send({ accessToken, expiresIn: JWT_TTL_SECONDS });
        }
        catch {
            return reply.code(401).send({ error: { code: 'unauthenticated', message: 'Invalid or expired bearer token.' } });
        }
    });
    // --- Health check (already registered by buildServer) ---
    // --- Utility: strip concrete Vietnamese character names from seed text ---
    // The setup-suggest LLM sometimes ignores the "no names" rule and writes
    // seeds like "Linh là trợ lý..." or "CEO Hạo Minh ký lệnh...". This
    // function replaces detected Vietnamese proper names with role placeholders
    // so the concept stage doesn't lock in those names.
    function stripVietnameseNamesFromSeed(seedText) {
        if (!seedText)
            return seedText;
        // Vietnamese proper names: 2-4 capitalized syllables in a row
        // e.g. "Trần Hạo Minh", "Linh", "Nguy-&n Th-9 Mai"
        // We replace sequences of 2+ capitalized Vietnamese words that look like
        // proper names with role-based placeholders.
        // Common Vietnamese surname set for detection:
        const surnames = new Set([
            'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
            'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đào', 'Đinh', 'Lâm',
            'Tạ', 'Trương', 'Lương', 'Hà', 'Tô', 'Cao', 'Châu', 'Quách', 'Thái',
        ]);
        // Overused given/middle names that signal a hardcoded character name:
        const bannedTokens = new Set([
            'Linh', 'Mai', 'Lan', 'Hoa', 'Ngọc', 'Anh', 'Hằng', 'Huyền', 'Trang',
            'Phương', 'Thảo', 'Yến', 'Khải', 'Hoàng', 'Tuấn', 'Quân', 'Hùng',
            'Long', 'Phúc', 'Minh', 'Thị', 'Văn', 'Hồng', 'Thanh', 'Thu', 'Kim',
            'Hạo', 'Châu',
        ]);
        // Strategy: find sequences of 2-4 capitalized Vietnamese words and replace
        // with "[nhân vật]". Also replace single banned tokens when they appear as
        // standalone names (preceded by space/start and followed by space/punct).
        let result = seedText;
        // Replace multi-word proper names (Surname + 1-3 more capitalized words)
        // Pattern: a surname followed by 1-3 capitalized Vietnamese syllables
        const multiWordNameRegex = /(?<![A-Zì-Ỹa-zà-ỹ])([A-Zì-Ỹ][a-zà-ỹ]+(?:\s+[A-Zì-Ỹ][a-zà-ỹ]+){1,3})(?![a-zà-ỹ])/g;
        result = result.replace(multiWordNameRegex, (match) => {
            const parts = match.trim().split(/\s+/);
            // If first word is a surname OR any word is a banned token -  likely a name
            if ((parts[0] && surnames.has(parts[0])) || parts.some(p => bannedTokens.has(p))) {
                return '[nhân vật]';
            }
            return match;
        });
        // Replace single banned tokens that look like standalone character names
        // (after "là", at sentence start, or after common role-introducing words)
        for (const token of bannedTokens) {
            const singleNameRegex = new RegExp(`(?<=(?:^|[.!?]\\s*|là\\s+|tên\\s+|gọi\\s+|CEO\\s+|sếp\\s+|anh\\s+|chị\\s+|cô\\s+|bà\\s+|ông\\s+))${token}(?=\\s|[,.]|$)`, 'gm');
            result = result.replace(singleNameRegex, '[nhân vật]');
        }
        // Clean up multiple consecutive [nhân vật] placeholders
        result = result.replace(/(\[nhân vật\]\s*){2,}/g, '[nhân vật] ');
        return result.trim();
    }
    // --- Seed history file for dedup (mirrors desktop SeedHistoryStore) ---
    const SEED_HISTORY_PATH = path.resolve(process.cwd(), 'drama15-web-seed-history.json');
    async function loadSeedHistory() {
        try {
            const raw = await fs.readFile(SEED_HISTORY_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed.filter((e) => e && typeof e === 'object' && typeof e.fingerprint === 'string' && typeof e.linePreset === 'string').slice(0, 200);
        }
        catch {
            return [];
        }
    }
    async function appendSeedHistory(entry) {
        const current = await loadSeedHistory();
        const next = [entry, ...current.filter((e) => e.fingerprint !== entry.fingerprint)].slice(0, 200);
        await fs.writeFile(SEED_HISTORY_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
    }
    // --- Story setup-suggest route (uses desktop seed engine + LLM) ---
    app.post('/story/setup-suggest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const parsed = SetupSuggestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid input' },
            });
        }
        const niche = (resolveNicheKey(parsed.data.niche)
            ?? (typeof parsed.data.customNiche === 'string' && parsed.data.customNiche.length > 0
                ? parsed.data.customNiche
                : 'billionaire_rich_poor_romance'));
        const outputLanguage = (parsed.data.outputLanguage ?? 'vietnamese');
        const userTitle = parsed.data.title ?? '';
        const userSeed = parsed.data.seed ?? '';
        // 1. Generate seed blueprint using the SAME engine as desktop
        const recentSeedHistory = await loadSeedHistory();
        const seedBlueprint = createSeedBlueprint({
            linePreset: niche,
            history: recentSeedHistory,
        });
        // 2. Build the full prompt with diversity locks (mirrors buildSettingSeedPrompt)
        const blueprintBlock = renderSeedBlueprintForPrompt(seedBlueprint);
        const historyBlock = renderRecentSeedHistoryForPrompt(recentSeedHistory);
        const trendEngine = renderTrendAwareSeedEngineForPrompt();
        const titleGrammar = renderNicheAwareTitleGrammarForPrompt(niche);
        const systemPrompt = [
            'You are a specialized fiction-generation engine for commercial short drama optimized for female readership ages 18-34, global market readability, mobile/serial reading behavior, strong emotional hooks, high retention, and emotionally satisfying payoff.',
            'You write like a highly disciplined story engine that understands emotional pacing, humiliation psychology, strategic delayed payoff, female-reader fantasy of dignity recovery, and commercially readable hook-driven storytelling.',
        ].join('\n');
        const userPrompt = [
            'Generate a complete story settings package for the web form.',
            `Output language: ${outputLanguage}. All text fields (titleHint, settingSeed) MUST be written in ${outputLanguage}.`,
            'Return JSON with a single top-level key named seedPackage.',
            'seedPackage must include: titleHint, linePreset, settingSeed, storyControls, draftControls.',
            'storyControls must include hidden config values: betrayalType, shameType, revengeMode, endingMode, intensity.',
            'draftControls must include: dialogueRatio, hookDensity.',
            'Write the four storyControls values as concrete hidden config text, not internal option ids.',
            titleGrammar,
            'Use the app-selected seed blueprint as the plot DNA. Treat topicAnchor as the market-signal shape, then transform it into an original plot. Do not replace this blueprint with a generic contract marriage, wedding, restaurant, or hidden-heiress motif.',
            'The app-selected topicAnchor comes from an expanded bank of at least 30 hot motif anchors per Niche. Use that motif as direction, not as a title to copy.',
            'Do not default back to fake wife or contract marriage unless the seed blueprint topicAnchor explicitly points there.',
            'Do not reuse the same story skeleton from Recent seed history. Treat relationshipDynamic, protagonistAgency, antagonistWeb, revealMechanism, and endingShape as hard diversity locks.',
            'Honor the seed blueprint arena and publicRevealVenue as hard context locks. Do not default to hospital, wedding, gala, boardroom, or restaurant settings unless the selected arena or publicRevealVenue explicitly says so.',
            'For billionaire_rich_poor_romance, the engine must be a love story across class lines. Hit at least four of these courtship beats: first meeting / hiểu lầm / rung động / dằn vặt / hy sinh / thú nhận / public choice in front of the disapproving family. Vary class pressure through family opposition, social manners, donor circles, scholarship, hidden identity, and public legitimacy reveals - not through contract, divorce, secret baby, or hostile takeover. The dignity payoff is the rich-side lover publicly choosing the poor-side lover (or the poor-side lover walking away first to protect him), never a signed clause or boardroom vote.',
            'For workplace_ceo_power_struggle, the engine is corporate power, paperwork, custody, and documented justice. Contract wife, paper marriage, pregnant secretary buyout, ex-wife divorce regret, female billionaire comeback, hostile takeover, and one-night-with-the-wrong-CEO scandals belong here. Romance can appear, but it never replaces the office / contract / board reveal as the spine.',
            'Before writing seedPackage, silently choose a diversity card with five different axes: pressure engine, arena, humiliation method, leverage object, and reveal venue. The five-axis combination must not match any recent seed or any single reference sample.',
            'If the most obvious market pattern is contract wife, secret baby, sold bride, hidden heiress, or revenge ex-wife, transform it with at least two unusual axes from the seed blueprint, such as nonstandard workplace, medical/legal leverage, child-safety logic, public institution, care labor, audit trail, or ownership paperwork.',
            'Reject generic setups where the only conflict is rich family hates poor heroine. Make each seed specific through job role, institution, evidence trail, status force, and consequence.',
            'Avoid recent output similarity: do not reuse the same title nouns, premise spine, opening humiliation, relationship setup, proof object, public reveal venue, or final justice shape from recent stories.',
            'The seed must fit the generated niche and content angle, while staying original.',
            'Do not copy, rename, or closely imitate any recognizable existing internet novel, short drama, film, or viral plot.',
            'Use realistic social conflicts and genre systems: family status pressure, workplace power, money, reputation, public shame, private dependence, social media, contracts, care labor, class-coded manners, pack law, mate-bond politics, alien captivity law, consent restoration, or empire contracts.',
            'Make the situation emotionally specific, socially plausible, deep enough for sympathy, and strong enough to pull readers into a 10-chapter revenge or dignity arc.',
            'The settingSeed should be 120-260 words and include the world, heroine pressure, betrayer motive, rival/status force, public humiliation engine, and comeback possibility.',
            'CRITICAL: Do NOT use any concrete character names in settingSeed. Refer to characters by role only - "nữ chính", "CEO", "chồng/vị hôn phu", "tình địch", "mẹ chồng", "luật sư", etc. Character naming happens in a later pipeline stage. If you write a Vietnamese name like "Linh", "Khải", "Minh", "Hạo" in the settingSeed, the output is INVALID.',
            'Keep titleHint short enough for a form field.',
            'Use intensity between 0.72 and 0.95.',
            'Use dialogueRatio between 0.45 and 0.65, tuned to the chosen branch and style.',
            'Use hookDensity as one of: low, medium, high.',
            `\nCurrent request:\n${JSON.stringify({ niche, outputLanguage, title: userTitle || undefined, seed: userSeed || undefined }, null, 2)}`,
            `\n${blueprintBlock}`,
            `\n${historyBlock}`,
            `\nTrend-aware seed engine:\n${trendEngine}`,
        ].join('\n\n');
        // 3. Call LLM with the full prompt
        try {
            const upstreamResp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: ROUTER_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.92,
                    max_tokens: 2000,
                    stream: false,
                }),
                signal: AbortSignal.timeout(90000),
            });
            if (upstreamResp.ok) {
                const data = await upstreamResp.json();
                let content = '';
                if (data.choices?.[0]?.message?.content) {
                    content = data.choices[0].message.content;
                }
                else if (Array.isArray(data.content)) {
                    const textBlock = data.content.find((c) => c.type === 'text');
                    if (textBlock?.text)
                        content = textBlock.text;
                }
                // Parse seedPackage JSON from LLM response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        const seedPackage = parsed.seedPackage ?? parsed;
                        const resultTitle = seedPackage.titleHint ?? seedPackage.title ?? '';
                        const resultSeed = seedPackage.settingSeed ?? seedPackage.seed ?? '';
                        const intensity = seedPackage.storyControls?.intensity ?? seedPackage.config?.intensity ?? 0.84;
                        const dialogueRatio = seedPackage.draftControls?.dialogueRatio ?? 0.56;
                        const hookDensity = seedPackage.draftControls?.hookDensity ?? 'medium';
                        // 4. Save to seed history for future dedup
                        await appendSeedHistory({
                            fingerprint: seedBlueprint.fingerprint,
                            linePreset: niche,
                            titleHint: resultTitle,
                            createdAt: new Date().toISOString(),
                            blueprint: seedBlueprint,
                        });
                        return reply.send({
                            title: resultTitle,
                            seed: stripVietnameseNamesFromSeed(resultSeed),
                            config: { intensity, dialogueRatio, hookDensity },
                        });
                    }
                    catch { /* fall through */ }
                }
                // If can't parse JSON, use raw content as seed
                await appendSeedHistory({
                    fingerprint: seedBlueprint.fingerprint,
                    linePreset: niche,
                    titleHint: '',
                    createdAt: new Date().toISOString(),
                    blueprint: seedBlueprint,
                });
                return reply.send({
                    title: seedBlueprint.topicAnchor,
                    seed: content.slice(0, 500),
                    config: { intensity: 0.84, dialogueRatio: 0.56, hookDensity: 'medium' },
                });
            }
            request.log.warn({ status: upstreamResp.status }, 'upstream LLM returned non-OK for setup-suggest');
        }
        catch (err) {
            request.log.warn({ err: err.message }, 'upstream LLM unreachable for setup-suggest');
        }
        // Fallback: return the seed blueprint directly as structured data
        // (still much better than the old hardcoded "Thành ph- hi-!n -ại" string)
        await appendSeedHistory({
            fingerprint: seedBlueprint.fingerprint,
            linePreset: niche,
            titleHint: seedBlueprint.topicAnchor,
            createdAt: new Date().toISOString(),
            blueprint: seedBlueprint,
        });
        return reply.send({
            title: seedBlueprint.topicAnchor,
            seed: [
                `Arena: ${seedBlueprint.arena}`,
                `Motif: ${seedBlueprint.motifFamily}`,
                `Social pain: ${seedBlueprint.socialPain}`,
                `Inciting humiliation: ${seedBlueprint.incitingHumiliation}`,
                `Hidden leverage: ${seedBlueprint.hiddenLeverage}`,
                `Reveal venue: ${seedBlueprint.publicRevealVenue}`,
                `Relationship dynamic: ${seedBlueprint.relationshipDynamic}`,
                `Protagonist agency: ${seedBlueprint.protagonistAgency}`,
            ].join('. '),
            config: { intensity: 0.84, dialogueRatio: 0.56, hookDensity: 'medium' },
        });
    });
    // --- Style preset list (desktop parity - exposes the named writing styles
    // shipped in `presets/styles/*.json` so the web client can let the user
    // pick a voice instead of hard-coding the wharton default).
    app.get('/story/style-presets', async (_request, reply) => {
        reply.header('Cache-Control', 'public, max-age=300');
        const ids = listAvailableStylePresetIds();
        const presets = ids.map((id) => {
            const p = loadStylePreset(id);
            return {
                id: p.id,
                displayName: p.displayName,
                description: p.description,
                dialogueRatioTarget: p.dialogueRatioTarget,
                emotionalDirectness: p.emotionalDirectness,
                hookSharpness: p.hookSharpness,
                melodramaLevel: p.melodramaLevel,
            };
        });
        return reply.send({ presets });
    });
    // --- Stories CRUD (dev stubs) ---
    app.get('/stories', async (_request, reply) => {
        return reply.send({ stories: [], total: 0 });
    });
    app.post('/stories', async (request, reply) => {
        // Validate input. Failures here mean the body never reaches the LLM.
        const parsedInput = CreateStorySchema.safeParse(request.body);
        if (!parsedInput.success) {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: parsedInput.error.issues[0]?.message ?? 'invalid input' },
            });
        }
        const { mode, config: validatedConfig } = parsedInput.data;
        const config = validatedConfig;
        // Server-authoritative daily quota. Counts both `full` and `single_chapter`
        // requests against the same bucket because both spend router credit.
        const quotaIdentity = request.currentUser?.sub ?? `ip:${request.ip ?? 'unknown'}`;
        const quotaDecision = await dailyStoryQuota.consume(quotaIdentity);
        if (!quotaDecision.allowed) {
            reply.header('Retry-After', String(quotaDecision.retryAfterSeconds ?? 3600));
            reply.header('Cache-Control', 'no-store');
            return reply.code(429).send({
                error: {
                    code: 'daily_quota_exceeded',
                    message: `daily limit ${quotaDecision.limit} reached, resets at UTC midnight`,
                },
                used: quotaDecision.used,
                limit: quotaDecision.limit,
            });
        }
        // Use an unguessable id so the SSE stream endpoint can authenticate by
        // capability rather than session (EventSource cannot send Authorization).
        const storyId = `story-${randomUUID()}`;
        // Bind the pending entry to the authenticated owner so the SSE stream
        // and pending-stories store can refuse other users' ids if a token leaks.
        const ownerSub = request.currentUser?.sub ?? null;
        if (mode === 'full') {
            // Persist config so `tsx watch` reloads or process restarts cannot
            // strand the SSE consumer with default niche/style. Survives crashes
            // for up to PENDING_STORY_TTL_MS (2 hours).
            try {
                await pendingStoriesStore.set(storyId, { ...(config ?? {}), __ownerSub: ownerSub });
            }
            catch (err) {
                request.log.warn({ err: err.message }, 'pending stories persist failed; falling back to memory');
                app.__pendingStories = app.__pendingStories ?? {};
                app.__pendingStories[storyId] = { ...config, __ownerSub: ownerSub };
            }
            return reply.code(201).send({ storyId, streaming: true });
        }
        // single_chapter mode - uses full desktop pipeline for one chapter
        const niche = (resolveNicheKey(typeof config?.niche === 'string' ? config.niche : undefined)
            ?? (typeof config?.customNiche === 'string' && config.customNiche.length > 0
                ? config.customNiche
                : 'billionaire_rich_poor_romance'));
        const outputLanguage = (config?.outputLanguage ?? 'vietnamese');
        const seed = (config?.seed ?? '');
        const title = (config?.title ?? '');
        const chapterIndex = parsedInput.data.chapterIndex ?? 1;
        const dialogueRatio = Number(config?.dialogueRatio) || 0.55;
        const hookDensity = (config?.hookDensity ?? 'medium');
        const intensity = Number(config?.intensity) || 0.84;
        // Generate seed blueprint if no seed provided
        const seedBlueprint = createSeedBlueprint({ linePreset: niche });
        const effectiveSeed = stripVietnameseNamesFromSeed(seed || `Arena: ${seedBlueprint.arena}. Motif: ${seedBlueprint.motifFamily}. Social pain: ${seedBlueprint.socialPain}. Inciting humiliation: ${seedBlueprint.incitingHumiliation}. Hidden leverage: ${seedBlueprint.hiddenLeverage}. Relationship dynamic: ${seedBlueprint.relationshipDynamic}. Protagonist agency: ${seedBlueprint.protagonistAgency}.`);
        try {
            // Resolve style before chapter generation (defaults to drama15_with_gu_man_overlay)
            const styleResolution = resolveStyle({});
            const chapterContent = await callLLM(buildChapterDraftSystemPrompt(styleResolution.styleBlock), buildChapterDraftUserPrompt({
                chapterNumber: chapterIndex,
                outputLanguage,
                title: title || seedBlueprint.topicAnchor,
                storyBible: '(single chapter mode - no full bible available)',
                chapterPlan: `Chapter ${chapterIndex}: ${effectiveSeed}`,
                previousSummaries: [],
                dialogueRatio,
                hookDensity,
                intensity,
                niche,
            }), 5000, TEMPERATURE_CHAPTER_DRAFT);
            // Try to extract structured chapter JSON
            const parsed = extractJson(chapterContent);
            const text = parsed?.text ?? chapterContent;
            return reply.code(201).send({
                storyId,
                streaming: false,
                chapter: { index: chapterIndex, content: text },
            });
        }
        catch (err) {
            request.log.error({ err }, 'LLM chapter generation failed');
            return reply.code(201).send({
                storyId,
                streaming: false,
                chapter: { index: chapterIndex, content: `[Lỗi tạo chương - 9router không phản hồi]` },
            });
        }
    });
    // --- Story stream SSE (full desktop pipeline: seed -  concept -  bible -  plan -  chapters with repair) ---
    app.get('/stories/:id/stream', async (request, reply) => {
        const storyId = request.params.id;
        // Validate the storyId looks like ours so we never use a malicious id
        // to probe internal stores.
        if (!/^story-[0-9a-f-]{36}$/i.test(storyId)) {
            return reply.code(400).send({ error: { code: 'invalid_story_id', message: 'invalid story id' } });
        }
        // Try persistent store first; fall back to legacy in-memory dict for
        // any entry created before the persistent store landed.
        let config;
        try {
            const persisted = await pendingStoriesStore.get(storyId);
            if (persisted)
                config = persisted;
        }
        catch (err) {
            request.log.warn({ err: err.message }, 'pending stories read failed');
        }
        if (!config) {
            config = app.__pendingStories?.[storyId];
        }
        if (!config) {
            return reply.code(404).send({ error: { code: 'story_not_found', message: 'pending story not found' } });
        }
        // Ownership check. The SSE endpoint is `authOptional`: a token from a
        // query param is decoded by the security plugin if present. If the
        // pending entry recorded an owner, the caller must match it.
        const ownerSub = config.__ownerSub ?? null;
        if (ownerSub && request.currentUser?.sub && request.currentUser.sub !== ownerSub) {
            return reply.code(403).send({ error: { code: 'forbidden', message: 'not your story' } });
        }
        if (ownerSub && !request.currentUser?.sub && process.env.NODE_ENV === 'production') {
            // In production, an entry that was created authenticated MUST be
            // streamed authenticated. In dev we relax this so localhost EventSource
            // continues to work without query-param tokens.
            return reply.code(401).send({ error: { code: 'unauthenticated', message: 'token required' } });
        }

        // Check if pipeline is already running for this story (reconnect scenario)
        if (ssePipelinePromises.has(storyId)) {
            // Pipeline still running — serve already-cached frames immediately,
            // then stream new frames as the running pipeline produces them.
            const frames = sseFrameCache.get(storyId) || [];
            reply.raw.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            });
            // Serve frames we already have
            for (const frame of frames) {
                try { reply.raw.write(frame); } catch { /* client disconnected */ }
            }
            // Keep-alive to prevent tunnel timeout while pipeline is still running
            const reconnectKeepAlive = setInterval(() => {
                try { reply.raw.write(': keep-alive\n\n'); } catch { clearInterval(reconnectKeepAlive); }
            }, 5000);
            // Poll for new frames until pipeline completes
            let lastFrameCount = frames.length;
            const pollInterval = setInterval(() => {
                const currentFrames = sseFrameCache.get(storyId) || [];
                for (let i = lastFrameCount; i < currentFrames.length; i++) {
                    try { reply.raw.write(currentFrames[i]); } catch { clearInterval(pollInterval); clearInterval(reconnectKeepAlive); }
                }
                lastFrameCount = currentFrames.length;
            }, 200);
            // When pipeline completes, send final frames and close
            ssePipelinePromises.get(storyId)!.then(() => {
                clearInterval(pollInterval);
                clearInterval(reconnectKeepAlive);
                // Flush any remaining frames
                const finalFrames = sseFrameCache.get(storyId) || [];
                for (let i = lastFrameCount; i < finalFrames.length; i++) {
                    try { reply.raw.write(finalFrames[i]); } catch { /* closed */ }
                }
                try { reply.raw.end(); } catch { /* closed */ }
            }).catch(() => {
                clearInterval(pollInterval);
                clearInterval(reconnectKeepAlive);
                try { reply.raw.end(); } catch { /* closed */ }
            });
            return;
        }

        // Create deferred promise so subsequent reconnects can await completion
        let pipelineResolve: () => void;
        let pipelineReject: (err: Error) => void;
        const pipelinePromise = new Promise<void>((resolve, reject) => {
            pipelineResolve = resolve;
            pipelineReject = reject;
        });
        ssePipelinePromises.set(storyId, pipelinePromise);

        const niche = (resolveNicheKey(typeof config?.niche === 'string' ? config.niche : undefined) ?? 'billionaire_rich_poor_romance');
        const outputLanguage = (config?.outputLanguage ?? 'vietnamese');
        const seed = (config?.seed ?? '');
        const title = (config?.title ?? '');
        const dialogueRatio = Number(config?.dialogueRatio) || 0.55;
        const hookDensity = (config?.hookDensity ?? 'medium');
        const intensity = Number(config?.intensity) || 0.84;
        // Generate seed blueprint for diversity
        const recentHistory = await loadSeedHistory();
        const seedBlueprint = createSeedBlueprint({ linePreset: niche, history: recentHistory });
        const rawEffectiveSeed = seed || `Arena: ${seedBlueprint.arena}. Motif: ${seedBlueprint.motifFamily}. Social pain: ${seedBlueprint.socialPain}. Inciting humiliation: ${seedBlueprint.incitingHumiliation}. Hidden leverage: ${seedBlueprint.hiddenLeverage}. Relationship dynamic: ${seedBlueprint.relationshipDynamic}. Protagonist agency: ${seedBlueprint.protagonistAgency}. Reveal venue: ${seedBlueprint.publicRevealVenue}. Freshness angle: ${seedBlueprint.freshnessAngle}.`;
        // Strip concrete Vietnamese character names from user-provided seeds so
        // the concept stage doesn't lock in "Linh" / "Khải" / "Hạo Minh" defaults.
        const effectiveSeed = stripVietnameseNamesFromSeed(rawEffectiveSeed);
        // CORS headers were already set by the security plugin in the onRequest
        // hook. For SSE we still need text/event-stream-specific headers, but
        // never echo `Origin` here - the gateway already validated it.
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        });
        const sendEvent = (stage: string, chapterIndex: number | undefined, content: string | undefined, meta?: Record<string, unknown>) => {
            const data: Record<string, unknown> = { stage };
            if (chapterIndex !== undefined)
                data.chapterIndex = chapterIndex;
            if (content !== undefined)
                data.content = content;
            // Map content to the field names the web client expects
            if (stage === 'overview' && content)
                data.concept = content;
            if (stage === 'plan' && content)
                data.plan = content;
            // Spread meta fields to top level so client can read event.title, etc.
            // Strip any `stage` key from meta so it cannot overwrite the canonical stage above.
            if (meta) {
                for (const [key, value] of Object.entries(meta)) {
                    if (key === 'stage')
                        continue;
                    data[key] = value;
                }
            }
            // Cache the frame for reconnect support
            const frame = `data: ${JSON.stringify(data)}\n\n`;
            if (!sseFrameCache.has(storyId)) sseFrameCache.set(storyId, []);
            sseFrameCache.get(storyId)!.push(frame);
            // Use unnamed SSE event (no "event:" line) so EventSource.onmessage fires
            try { reply.raw.write(frame); } catch { /* client disconnected — pipeline continues */ }
        };
        // Run pipeline in background. Handler returns immediately after starting
        // the pipeline, allowing Fastify to handle other requests. Pipeline writes
        // to cache and reply.raw (with try/catch to survive disconnects).
        const keepAlive = setInterval(() => {
            try {
                reply.raw.write(': keep-alive\n\n');
            }
            catch { /* connection dropped — pipeline continues via cache */ }
        }, 5000);

        // Start pipeline async - handler will return before pipeline completes
        (async () => {
        try {
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            // STAGE 1: CONCEPT (mirrors desktop buildConceptPrompt)
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            const conceptRaw = await callLLM(buildConceptSystemPrompt(), buildConceptUserPrompt({
                niche,
                outputLanguage,
                title,
                seed: effectiveSeed,
                seedBlueprint,
                recentTitles: recentHistory.map(h => h.titleHint).filter(Boolean),
            }), 1500, TEMPERATURE_CONCEPT);
            // Desktop-parity strict parse with tolerant fallback. parseConcept
            // unwraps `{concept:{...}}` envelopes and coerces missing fields to
            // sensible defaults so the SSE stream cannot stall on malformed JSON.
            const conceptRawJson = extractJson(conceptRaw);
            let conceptJson = null;
            try {
                conceptJson = parseConcept(conceptRawJson);
            }
            catch (parseErr) {
                request.log.warn({ err: parseErr.message }, 'concept parse failed - falling back to raw JSON');
                conceptJson = conceptRawJson;
            }
            const conceptText = conceptJson
                ? JSON.stringify(conceptJson, null, 2)
                : conceptRaw;
            sendEvent('overview', undefined, conceptText);
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            // STAGE 2: STORY BIBLE (mirrors desktop buildStoryBiblePrompt)
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            // Build a "recent character names to avoid" block from history so the
            // LLM stops defaulting to Linh / Minh-prefixed names. recentHistory was
            // already loaded above for seed-fingerprint dedup.
            const recentCharacterNamesBlock = renderRecentCharacterNamesForPrompt(recentHistory);
            const bibleRaw = await callLLM(buildStoryBibleSystemPrompt(), buildStoryBibleUserPrompt({
                niche,
                outputLanguage,
                concept: conceptText,
                seedBlueprint,
                recentCharacterNamesBlock,
            }), 2000, TEMPERATURE_BIBLE);
            const bibleRawJson = extractJson(bibleRaw);
            let bibleJson = null;
            try {
                bibleJson = parseStoryBible(bibleRawJson);
            }
            catch (parseErr) {
                request.log.warn({ err: parseErr.message }, 'story bible parse failed - falling back to raw JSON');
                bibleJson = bibleRawJson;
            }
            const bibleText = bibleJson
                ? JSON.stringify(bibleJson, null, 2)
                : bibleRaw;
            // Capture character names from the bible so they get persisted into
            // seed history and excluded from the next generation.
            const bibleCharacterNames = extractBibleCharacterNames(bibleJson);
            sendEvent('bible', undefined, bibleText);
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            // STAGE 3: CHAPTER PLAN (mirrors desktop buildChapterPlanPrompt)
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            const planRaw = await callLLM(buildChapterPlanSystemPrompt(), buildChapterPlanUserPrompt({
                niche,
                outputLanguage,
                concept: conceptText,
                storyBible: bibleText,
            }), 2000, TEMPERATURE_PLAN);
            const planRawJson = extractJson(planRaw);
            let planJson = null;
            try {
                const parsedPlan = parseChapterPlan(planRawJson);
                const integrity = ensureChapterPlanIntegrity(parsedPlan, 10);
                if (!integrity.ok) {
                    request.log.warn({ reason: integrity.reason }, 'chapter plan integrity check failed');
                }
                planJson = parsedPlan;
            }
            catch (parseErr) {
                request.log.warn({ err: parseErr.message }, 'chapter plan parse failed - falling back to raw JSON');
                planJson = planRawJson;
            }
            const planText = Array.isArray(planJson)
                ? JSON.stringify(planJson, null, 2)
                : planJson
                    ? JSON.stringify(planJson, null, 2)
                    : planRaw;
            sendEvent('plan', undefined, planText);
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            // STAGES 4-13: CHAPTER DRAFTS with quality repair loop
            // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
            const chapterSummaries = [];
            const storyTitle = (conceptJson && typeof conceptJson === 'object' && 'title' in conceptJson)
                ? conceptJson.title ?? title ?? seedBlueprint.topicAnchor
                : title ?? seedBlueprint.topicAnchor;
            // Style preset (desktop parity). Read from config.stylePreset, fall
            // back to the desktop default. The preset's notes get appended to the
            // existing styleResolver block so the chapter system prompt carries
            // both the Drama15 architecture overlay AND the named-style overlay.
            const requestedStylePresetId = config?.stylePreset
                ?? 'wharton_class_shame_elegance';
            const stylePresetData = loadStylePreset(requestedStylePresetId);
            const stylePresetBlock = renderStylePresetForPrompt(stylePresetData);
            const styleResolution = resolveStyle({});
            // Compose final style block: legacy resolveStyle output + named preset.
            const composedStyleBlock = [styleResolution.styleBlock, stylePresetBlock]
                .filter(Boolean)
                .join('\n\n');
            // Initialize Character Memory Store for consistency validation
            let memoryStore = createEmptyMemoryStore();
            // Build Continuity_Lite tracker once (desktop parity). When the bible /
            // plan are malformed, falls back to null and the chapter prompt uses
            // only previousSummaries / memoryStoreContext, matching legacy behaviour.
            const continuityLite = buildContinuityLiteFromBible(bibleJson, planJson);
            const continuityLiteBlock = renderContinuityLiteForPrompt(continuityLite);
            // Phrase-Reuse Tracker index (Wave 5). Created once per story job,
            // accumulates trigrams across all chapters for cross-chapter reuse detection.
            const phraseReuseIndex = createPhraseReuseIndex();
            for (let i = 1; i <= 10; i++) {
                // Per-chapter beat + plan-locked title (desktop parity).
                const chapterPlanItemBlock = renderChapterPlanItemForPrompt(planJson, i);
                const plannedChapterTitle = getPlannedChapterTitle(planJson, i);
                // Draft the chapter (STREAMING)
                // We use the streaming LLM helper so the user sees text appear
                // live in the UI instead of waiting 30-60s per chapter. Each
                // delta is forwarded as a `chapter_delta` SSE event with a small
                // 200ms debounce so we do not flood the wire with one-token frames.
                //
                // The LLM returns JSON like {"chapterNumber":1,"title":"...","text":"..."}
                // We only want to stream the "text" field content to the client,
                // not the JSON wrapper. So we buffer until we detect the "text":"
                // marker, then stream everything after that (minus the closing "}).
                let chapterRaw;
                let lastDeltaFlush = Date.now();
                let pendingDelta = '';
                let streamBuffer = '';
                let textFieldStarted = false;
                const DELTA_FLUSH_MS = 200;
                const TEXT_FIELD_MARKER = /"text"\s*:\s*"/;
                const flushDelta = () => {
                    if (pendingDelta.length === 0)
                        return;
                    reply.raw.write(`data: ${JSON.stringify({
                        stage: 'chapter_delta',
                        chapterIndex: i,
                        delta: pendingDelta,
                    })}\n\n`);
                    pendingDelta = '';
                    lastDeltaFlush = Date.now();
                };
                try {
                    chapterRaw = await llmCircuitBreaker.exec(async () => streamAndCollect({
                        baseUrl: OPENAI_BASE_URL,
                        apiKey: OPENAI_API_KEY,
                        model: ROUTER_MODEL,
                        systemPrompt: buildChapterDraftSystemPrompt(composedStyleBlock),
                        userPrompt: buildChapterDraftUserPrompt({
                            chapterNumber: i,
                            outputLanguage,
                            title: storyTitle,
                            storyBible: bibleText,
                            chapterPlan: planText,
                            previousSummaries: chapterSummaries,
                            dialogueRatio,
                            hookDensity,
                            intensity,
                            continuityLiteBlock,
                            chapterPlanItemBlock,
                            plannedChapterTitle,
                            niche,
                        }),
                        maxTokens: 5000,
                        temperature: TEMPERATURE_CHAPTER_DRAFT,
                    }, (delta) => {
                        streamBuffer += delta;
                        if (!textFieldStarted) {
                            // Check if we've accumulated enough to find the "text": " marker
                            const match = streamBuffer.match(TEXT_FIELD_MARKER);
                            if (match && match.index !== undefined) {
                                // Found it! Everything after the marker opening quote is story text
                                const afterMarker = streamBuffer.slice(match.index + match[0].length);
                                textFieldStarted = true;
                                if (afterMarker.length > 0) {
                                    // Unescape JSON string escapes in the delta
                                    pendingDelta += afterMarker.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                }
                            }
                        }
                        else {
                            // We're inside the "text" field - forward deltas directly
                            // Unescape JSON string escapes
                            pendingDelta += delta.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        }
                        // Flush to client, but hold back the last few chars that might be
                        // JSON closure artifacts (e.g. "}\n```). We only flush content we're
                        // confident is story text - i.e. everything except a trailing tail
                        // that looks like it could be part of a JSON/fence closure.
                        if (textFieldStarted && Date.now() - lastDeltaFlush >= DELTA_FLUSH_MS) {
                            // Hold back up to 10 chars from the end to avoid flushing partial JSON closure
                            const HOLD_BACK = 10;
                            if (pendingDelta.length > HOLD_BACK) {
                                const safeToFlush = pendingDelta.slice(0, pendingDelta.length - HOLD_BACK);
                                pendingDelta = pendingDelta.slice(pendingDelta.length - HOLD_BACK);
                                // Temporarily swap for flush
                                const held = pendingDelta;
                                pendingDelta = safeToFlush;
                                flushDelta();
                                pendingDelta = held;
                            }
                        }
                    }));
                    // Flush any tail delta still buffered when the stream ends.
                    // If the LLM returned plain text (no JSON wrapper), textFieldStarted
                    // will be false. In that case, send the entire buffer as-is.
                    if (!textFieldStarted && streamBuffer.length > 0) {
                        pendingDelta = streamBuffer;
                    }
                    // Remove trailing JSON artifacts from the text field (closing quote + object braces)
                    // Also handle cases where markdown code fences or extra whitespace follow the JSON.
                    if (textFieldStarted && pendingDelta.length > 0) {
                        pendingDelta = pendingDelta
                            .replace(/\\?\s*"\s*,?\s*"[^"]*"\s*:\s*"[^"]*"\s*\}\s*(?:```)?$/s, '')
                            .replace(/\\?\s*"\s*\}\s*(?:```)?$/s, '')
                            .replace(/\\?\s*"\s*(?:```)?$/s, '')
                            .replace(/\s*```\s*$/s, '');
                    }
                    flushDelta();
                }
                catch (streamErr) {
                    // Streaming failed - fall back to non-streaming call so the
                    // pipeline still produces a chapter. User sees a moment of
                    // pause but no blank chapter.
                    request.log.warn({ chapter: i, err: streamErr.message }, 'streaming chapter draft failed - falling back to non-streaming');
                    chapterRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), buildChapterDraftUserPrompt({
                        chapterNumber: i,
                        outputLanguage,
                        title: storyTitle,
                        storyBible: bibleText,
                        chapterPlan: planText,
                        previousSummaries: chapterSummaries,
                        dialogueRatio,
                        hookDensity,
                        intensity,
                        continuityLiteBlock,
                        chapterPlanItemBlock,
                        plannedChapterTitle,
                        niche,
                    }), 5000, TEMPERATURE_CHAPTER_DRAFT);
                }
                let chapterJson = extractJson(chapterRaw);
                // Desktop-parity: try strict parse with envelope unwrap. On success
                // we get a fully-validated Chapter object (chapterNumber matches,
                // title/text non-empty, summary derived if missing). On failure we
                // fall back to the soft validation path below so the SSE stream
                // stays alive with whatever the LLM produced.
                const strictChapter = parseChapterDraft(chapterJson, i);
                if (strictChapter) {
                    chapterJson = strictChapter;
                }
                else {
                    request.log.warn({ chapter: i }, 'chapter strict parse failed - using soft fallback');
                }
                // Force the chapter title to match the plan, mirroring desktop's
                // `alignChapterTitleWithPlan` so chapter naming stays coherent across
                // the 10-chapter arc.
                if (plannedChapterTitle)
                    chapterJson = alignChapterTitle(chapterJson, plannedChapterTitle);
                // Soft-validate shape; on failure the LLM's raw text is still kept as
                // fallback text so we never produce an empty chapter.
                if (!validateChapterDraftShape(chapterJson, i)) {
                    request.log.warn({ chapter: i }, 'chapter draft JSON did not validate shape - falling back to raw text');
                }
                let chapterText = chapterJson?.text ?? chapterRaw;
                // If chapterText still looks like JSON or contains a JSON object,
                // extract the .text field. This handles cases where:
                // - extractJson returned null but chapterRaw is valid JSON
                // - chapterJson.text was undefined despite the object existing
                // - chapterRaw is wrapped in markdown code fences
                if (typeof chapterText === 'string') {
                    let candidate = chapterText.trim();
                    // Strip markdown code fences
                    const fenceMatch = candidate.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
                    if (fenceMatch && fenceMatch[1])
                        candidate = fenceMatch[1].trim();
                    if (candidate.startsWith('{')) {
                        try {
                            const fallbackParsed = JSON.parse(candidate);
                            if (typeof fallbackParsed?.text === 'string' && fallbackParsed.text.length > 0) {
                                chapterText = fallbackParsed.text;
                            }
                            else if (typeof fallbackParsed?.content === 'string' && fallbackParsed.content.length > 0) {
                                chapterText = fallbackParsed.content;
                            }
                        }
                        catch { /* keep as-is */ }
                    }
                }
                // Quality validation + repair loop (mirrors desktop)
                let metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                let repairAttempt = 0;
                while (needsChapterRetry(metrics) && repairAttempt < MAX_CHAPTER_REPAIR_ATTEMPTS) {
                    repairAttempt++;
                    request.log.info({ chapter: i, attempt: repairAttempt, failures: metrics.failures }, 'chapter repair');
                    const repairedRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), buildChapterRepairUserPrompt({
                        previousDraft: chapterText,
                        failures: metrics.failures,
                        chapterNumber: i,
                        dialogueRatio,
                        wordCount: metrics.wordCount,
                        currentDialogueRatio: metrics.dialogueRatio,
                    }), 5000, TEMPERATURE_CHAPTER_REPAIR);
                    const repairedJson = extractJson(repairedRaw);
                    chapterText = repairedJson?.text ?? repairedRaw;
                    metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                }
                // Soft-failure relaxation (desktop parity). If the repair loop
                // exhausted without clearing all failures BUT every remaining
                // failure is "soft" (currently: dialogue-ratio drift), accept the
                // chapter rather than blocking the SSE stream. Hard failures (text
                // too short, JSON malformed, etc.) still propagate via the existing
                // fallback path. Mirrors `hasOnlySoftChapterQualityFailures`
                // behaviour in src/modules/orchestrator/story-orchestrator.ts.
                let qualitySoftPass = false;
                if (needsChapterRetry(metrics) && hasOnlySoftChapterQualityFailures(metrics)) {
                    qualitySoftPass = true;
                    request.log.info({ chapter: i, failures: metrics.failures }, 'chapter quality has only soft failures after max repairs - accepting');
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // VIETNAMESE AI-TELL HUMANIZATION REPAIR (single-pass)
                // Scan the finished chapter for stock LLM Vietnamese phrases. If
                // the soft threshold is exceeded, run one targeted repair pass
                // naming the exact phrases the LLM used. We do NOT loop on this -
                // a second LLM call rarely improves text quality further and
                // doubles latency. One pass is best-cost UX trade-off.
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let aiTellsRepaired = false;
                let finalAiTellMatches = 0;
                if (outputLanguage === 'vietnamese') {
                    const tellReport = detectAiTells(chapterText);
                    if (tellReport.needsHumanizationRepair) {
                        request.log.info({ chapter: i, matches: tellReport.matches.length, categories: tellReport.categoriesHit }, 'chapter has Vietnamese AI tells - running humanization repair');
                        try {
                            const tellRepairRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), [
                                buildAiTellRepairInstruction(tellReport),
                                '',
                                'Previous draft to revise:',
                                chapterText,
                            ].join('\n'), 5000, TEMPERATURE_CHAPTER_REPAIR);
                            const tellRepairedJson = extractJson(tellRepairRaw);
                            const repairedText = tellRepairedJson?.text ?? tellRepairRaw;
                            const reReport = detectAiTells(repairedText);
                            if (reReport.matches.length < tellReport.matches.length) {
                                chapterText = repairedText;
                                aiTellsRepaired = true;
                                finalAiTellMatches = reReport.matches.length;
                                metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                            }
                            else {
                                // Repair did not reduce tells - keep original, log warning
                                finalAiTellMatches = tellReport.matches.length;
                                request.log.warn({ chapter: i, before: tellReport.matches.length, after: reReport.matches.length }, 'AI-tell repair did not reduce matches - keeping original draft');
                            }
                        }
                        catch (tellErr) {
                            finalAiTellMatches = tellReport.matches.length;
                            request.log.warn({ chapter: i, err: tellErr.message }, 'AI-tell repair LLM call failed - continuing with original draft');
                        }
                    }
                    else {
                        finalAiTellMatches = tellReport.matches.length;
                    }
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // CONSISTENCY VALIDATION - after quality check passes
                // Compare chapter against Story_Bible and Character_Memory_Store
                // (Requirements: 3.1, 3.5, 6.4, 6.5)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let consistencyWarning = false;
                let driftReport = null;
                try {
                    const memoryContext = memoryStoreToPromptContext(memoryStore);
                    const validationRaw = await callLLM(buildValidationSystemPrompt(), buildValidationUserPrompt({
                        chapterText,
                        chapterNumber: i,
                        storyBible: bibleText,
                        memoryStoreContext: memoryContext,
                        speechPatterns: continuityLite?.speechPatterns,
                    }), 2000, TEMPERATURE_VALIDATION);
                    driftReport = parseDriftReport(validationRaw, i);
                    // If critical violations found, enter drift repair loop (max 3 attempts)
                    if (hasCriticalViolations(driftReport)) {
                        let driftRepairAttempt = 0;
                        while (hasCriticalViolations(driftReport) && driftRepairAttempt < MAX_CHAPTER_REPAIR_ATTEMPTS_WITH_DRIFT) {
                            driftRepairAttempt++;
                            request.log.info({ chapter: i, driftAttempt: driftRepairAttempt, violations: driftReport.violations.length }, 'chapter drift repair');
                            const driftRepairedRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), buildChapterRepairUserPromptWithDrift({
                                previousDraft: chapterText,
                                failures: metrics.failures,
                                driftReport,
                                chapterNumber: i,
                                dialogueRatio,
                                wordCount: metrics.wordCount,
                                currentDialogueRatio: metrics.dialogueRatio,
                            }), 5000, TEMPERATURE_CHAPTER_REPAIR);
                            const driftRepairedJson = extractJson(driftRepairedRaw);
                            chapterText = driftRepairedJson?.text ?? driftRepairedRaw;
                            metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                            // Re-validate for drift after repair
                            const revalidationRaw = await callLLM(buildValidationSystemPrompt(), buildValidationUserPrompt({
                                chapterText,
                                chapterNumber: i,
                                storyBible: bibleText,
                                memoryStoreContext: memoryContext,
                                speechPatterns: continuityLite?.speechPatterns,
                            }), 2000, TEMPERATURE_VALIDATION);
                            driftReport = parseDriftReport(revalidationRaw, i);
                        }
                        // On exhaustion: log unresolved violations and set consistencyWarning flag
                        if (hasCriticalViolations(driftReport)) {
                            consistencyWarning = true;
                            request.log.warn({
                                chapter: i,
                                unresolvedViolations: driftReport.violations.filter((v) => v.severity === 'critical'),
                            }, 'drift repair exhausted - unresolved character consistency violations remain');
                        }
                    }
                    // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                    // IDIOLECT REPAIR PASS (Wave 6) - after drift repair loop
                    // If >= 2 speech_idiolect warnings and no critical violations remain,
                    // run a single targeted repair pass to fix character voice drift.
                    // (Requirements: 2.8)
                    // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                    if (FEATURE_IDIOLECT && driftReport) {
                        const idiolectViolations = driftReport.violations.filter(v => v.type === 'speech_idiolect');
                        if (idiolectViolations.length >= 2 && !hasCriticalViolations(driftReport)) {
                            request.log.info({ chapter: i, idiolectWarnings: idiolectViolations.length }, 'idiolect repair triggered - fixing character speech pattern drift');
                            try {
                                const repairInstruction = buildIdiolectRepairInstruction(idiolectViolations, continuityLite?.speechPatterns);
                                const idiolectRepairedRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), [
                                    repairInstruction,
                                    '',
                                    'Full chapter text to revise:',
                                    chapterText,
                                ].join('\n'), 5000, TEMPERATURE_CHAPTER_REPAIR);
                                const idiolectRepairedJson = extractJson(idiolectRepairedRaw);
                                const repairedText = idiolectRepairedJson?.text ?? idiolectRepairedRaw;
                                // Re-run validator to check if warnings reduced
                                const revalidationRaw = await callLLM(buildValidationSystemPrompt(), buildValidationUserPrompt({
                                    chapterText: repairedText,
                                    chapterNumber: i,
                                    storyBible: bibleText,
                                    memoryStoreContext: memoryContext,
                                    speechPatterns: continuityLite?.speechPatterns,
                                }), 2000, TEMPERATURE_VALIDATION);
                                const revalidatedReport = parseDriftReport(revalidationRaw, i);
                                const newIdiolectCount = revalidatedReport.violations.filter(v => v.type === 'speech_idiolect').length;
                                if (newIdiolectCount < idiolectViolations.length) {
                                    chapterText = repairedText;
                                    driftReport = revalidatedReport;
                                    metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                                    request.log.info({ chapter: i, before: idiolectViolations.length, after: newIdiolectCount }, 'idiolect repair improved - accepting repaired text');
                                }
                                else {
                                    request.log.warn({ chapter: i, before: idiolectViolations.length, after: newIdiolectCount }, 'idiolect repair did not reduce warnings - keeping original draft');
                                }
                            }
                            catch (idiolectErr) {
                                request.log.warn({ chapter: i, err: idiolectErr.message }, 'idiolect repair LLM call failed - continuing with original draft');
                            }
                        }
                    }
                }
                catch (validationErr) {
                    // Graceful degradation: if validation LLM fails, continue without blocking
                    request.log.warn({ chapter: i, err: validationErr.message }, 'consistency validation failed - continuing without validation');
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // PHRASE-REUSE CHECK (Wave 5) - after consistency validation
                // Scores the chapter against the accumulated trigram index. If
                // reuseScore > 0.15, runs a single-shot repair naming the top
                // repeated phrases. Accepts repair only if score improves.
                // (Requirements: 1.5, 1.6, 1.7)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let phraseReuseScore;
                let topRepeatedPhrases;
                if (FEATURE_PHRASE_REUSE_TRACKER) {
                    try {
                        const reuseReport = scoreCandidate(phraseReuseIndex, chapterText, i);
                        phraseReuseScore = reuseReport.reuseScore;
                        if (reuseReport.needsRepair) {
                            request.log.info({ chapter: i, reuseScore: reuseReport.reuseScore, topPhrases: reuseReport.topRepeats.length }, 'phrase-reuse threshold exceeded - running single-shot repair');
                            try {
                                const reuseRepairRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), [
                                    buildReuseRepairInstruction(reuseReport),
                                    '',
                                    'Chapter text to revise:',
                                    chapterText,
                                ].join('\n'), 5000, TEMPERATURE_CHAPTER_REPAIR);
                                const reuseRepairedJson = extractJson(reuseRepairRaw);
                                const repairedText = reuseRepairedJson?.text ?? reuseRepairRaw;
                                const newReport = scoreCandidate(phraseReuseIndex, repairedText, i);
                                if (newReport.reuseScore < reuseReport.reuseScore) {
                                    chapterText = repairedText;
                                    phraseReuseScore = newReport.reuseScore;
                                    request.log.info({ chapter: i, before: reuseReport.reuseScore, after: newReport.reuseScore }, 'phrase-reuse repair improved score - accepting repaired text');
                                }
                                else {
                                    // Repair did not reduce score - keep original (Requirement 1.6)
                                    request.log.warn({ chapter: i, before: reuseReport.reuseScore, after: newReport.reuseScore }, 'phrase-reuse repair did not reduce score - keeping original draft');
                                }
                            }
                            catch (reuseRepairErr) {
                                request.log.warn({ chapter: i, err: reuseRepairErr.message }, 'phrase-reuse repair LLM call failed - continuing with original draft');
                            }
                        }
                        // Collect top repeated phrases for SSE meta (informational)
                        if (reuseReport.topRepeats.length > 0 && phraseReuseScore !== undefined && phraseReuseScore >= 0.10) {
                            topRepeatedPhrases = reuseReport.topRepeats.map((r) => r.phrase);
                        }
                        // Always index the chapter (whether repaired or not) so it feeds
                        // into the next iteration's scoring.
                        indexChapter(phraseReuseIndex, i, chapterText);
                    }
                    catch (reuseErr) {
                        // Graceful degradation: tracker failure never blocks the pipeline
                        request.log.warn({ chapter: i, err: reuseErr.message }, 'phrase-reuse tracker failed - continuing without reuse check');
                    }
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // SENTENCE VARIANCE CHECK (Wave 7) - after phrase-reuse
                // Computes cv of sentence lengths. If cv < 0.55, runs a single
                // soft repair pass to inject more length variation.
                // (Requirements: 3.2)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let lowSentenceVariance;
                let sentenceCv;
                if (FEATURE_HUMANIZATION_RULES) {
                    try {
                        const varianceMetrics = analyzeSentenceVariance(chapterText);
                        sentenceCv = varianceMetrics.cv;
                        lowSentenceVariance = varianceMetrics.needsRepair;
                        if (varianceMetrics.needsRepair) {
                            request.log.info({ chapter: i, cv: varianceMetrics.cv, sentenceCount: varianceMetrics.sentenceCount }, 'low sentence variance detected - running single soft repair');
                            try {
                                const varianceRepairRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), [
                                    buildVarianceRepairInstruction(varianceMetrics),
                                    '',
                                    'Chapter text to revise:',
                                    chapterText,
                                ].join('\n'), 5000, TEMPERATURE_CHAPTER_REPAIR);
                                const varianceRepairedJson = extractJson(varianceRepairRaw);
                                const repairedText = varianceRepairedJson?.text ?? varianceRepairRaw;
                                const newMetrics = analyzeSentenceVariance(repairedText);
                                if (newMetrics.cv > varianceMetrics.cv) {
                                    chapterText = repairedText;
                                    sentenceCv = newMetrics.cv;
                                    lowSentenceVariance = newMetrics.needsRepair;
                                    metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                                    request.log.info({ chapter: i, before: varianceMetrics.cv.toFixed(3), after: newMetrics.cv.toFixed(3) }, 'sentence variance repair improved cv - accepting repaired text');
                                }
                                else {
                                    request.log.warn({ chapter: i, before: varianceMetrics.cv.toFixed(3), after: newMetrics.cv.toFixed(3) }, 'sentence variance repair did not improve cv - keeping original draft');
                                }
                            }
                            catch (varianceRepairErr) {
                                request.log.warn({ chapter: i, err: varianceRepairErr.message }, 'sentence variance repair LLM call failed - continuing with original draft');
                            }
                        }
                    }
                    catch (varianceErr) {
                        request.log.warn({ chapter: i, err: varianceErr.message }, 'sentence variance analysis failed - continuing without variance check');
                    }
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // AI DETECTOR + HUMANIZATION REPAIR (Wave 7) - after variance check
                // Calls the LRT detector with a 5s timeout. If aiScore > 0.7,
                // runs a single humanization repair pass. Accepts only if new
                // score < old AND consistency validator still passes.
                // (Requirements: 3.7, 3.8, 3.9, 3.10)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let aiScoreEstimate;
                let humanizationRepaired;
                if (FEATURE_HUMANIZATION_DETECTOR) {
                    try {
                        // Race detector against 5s timeout (Requirement 3.9: fail open)
                        const aiScore = await Promise.race([
                            aiDetector.score(chapterText),
                            new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
                        ]);
                        aiScoreEstimate = aiScore;
                        if (aiScore !== null && aiScore > 0.7) {
                            request.log.info({ chapter: i, aiScore }, 'AI score above threshold - running humanization repair');
                            try {
                                const humanizeRepairRaw = await callLLM(buildChapterDraftSystemPrompt(composedStyleBlock), [
                                    buildHumanizationRepairInstruction(),
                                    '',
                                    'Chapter text to revise:',
                                    chapterText,
                                ].join('\n'), 5000, TEMPERATURE_CHAPTER_REPAIR);
                                const humanizeRepairedJson = extractJson(humanizeRepairRaw);
                                const repairedText = humanizeRepairedJson?.text ?? humanizeRepairRaw;
                                // Re-score with detector (with timeout)
                                const newAiScore = await Promise.race([
                                    aiDetector.score(repairedText),
                                    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
                                ]);
                                // Accept only if new score < old score (Requirement 3.7)
                                if (newAiScore !== null && newAiScore < aiScore) {
                                    // Also verify consistency validator still passes (Requirement 3.10)
                                    let consistencyStillPasses = true;
                                    try {
                                        const memoryContext = memoryStoreToPromptContext(memoryStore);
                                        const revalidationRaw = await callLLM(buildValidationSystemPrompt(), buildValidationUserPrompt({
                                            chapterText: repairedText,
                                            chapterNumber: i,
                                            storyBible: bibleText,
                                            memoryStoreContext: memoryContext,
                                            speechPatterns: continuityLite?.speechPatterns,
                                        }), 2000, TEMPERATURE_VALIDATION);
                                        const revalidatedReport = parseDriftReport(revalidationRaw, i);
                                        if (hasCriticalViolations(revalidatedReport)) {
                                            consistencyStillPasses = false;
                                        }
                                    }
                                    catch {
                                        // If re-validation fails, be conservative and reject the repair
                                        consistencyStillPasses = false;
                                    }
                                    if (consistencyStillPasses) {
                                        chapterText = repairedText;
                                        aiScoreEstimate = newAiScore;
                                        humanizationRepaired = true;
                                        metrics = analyzeChapterQuality(chapterText, dialogueRatio, i);
                                        request.log.info({ chapter: i, before: aiScore, after: newAiScore }, 'humanization repair improved AI score and passes consistency - accepting');
                                    }
                                    else {
                                        request.log.warn({ chapter: i }, 'humanization repair broke consistency - keeping original draft');
                                    }
                                }
                                else {
                                    request.log.warn({ chapter: i, before: aiScore, after: newAiScore }, 'humanization repair did not reduce AI score - keeping original draft');
                                }
                            }
                            catch (humanizeErr) {
                                request.log.warn({ chapter: i, err: humanizeErr.message }, 'humanization repair LLM call failed - continuing with original draft');
                            }
                        }
                    }
                    catch (detectorErr) {
                        // Fail open: detector failure never blocks the pipeline (Requirement 3.9)
                        aiScoreEstimate = null;
                        request.log.warn({ chapter: i, err: detectorErr.message }, 'AI detector failed - continuing with aiScoreEstimate: null');
                    }
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // FACT SHEET EXTRACTION - after validation passes
                // Extract structured character facts and add to Memory Store
                // (Requirements: 1.1, 1.4, 1.5)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                try {
                    const factExtractionRaw = await callLLM(buildFactExtractionSystemPrompt(bibleText), buildFactExtractionUserPrompt({
                        chapterText,
                        chapterNumber: i,
                        storyBible: bibleText,
                        outputLanguage,
                    }), 2000, TEMPERATURE_FACT_EXTRACTION);
                    let factSheetData = extractJson(factExtractionRaw);
                    let factSheetValid = validateCharacterFactSheet(factSheetData);
                    // Retry once with lower temperature on failure (Requirement 1.5)
                    if (!factSheetValid) {
                        request.log.info({ chapter: i }, 'fact sheet extraction invalid - retrying with lower temperature');
                        const retryRaw = await callLLM(buildFactExtractionSystemPrompt(bibleText), buildFactExtractionUserPrompt({
                            chapterText,
                            chapterNumber: i,
                            storyBible: bibleText,
                            outputLanguage,
                        }), 2000, TEMPERATURE_FACT_EXTRACTION_RETRY);
                        factSheetData = extractJson(retryRaw);
                        factSheetValid = validateCharacterFactSheet(factSheetData);
                    }
                    // On second failure, use regex fallback (Requirement 1.5)
                    if (!factSheetValid) {
                        request.log.warn({ chapter: i }, 'fact sheet extraction failed twice - using regex fallback');
                        factSheetData = extractCharacterNamesFallback(chapterText);
                        factSheetData.chapterNumber = i;
                    }
                    // Add validated fact sheet to Character Memory Store
                    memoryStore = addFactSheet(memoryStore, factSheetData);
                }
                catch (extractionErr) {
                    // Graceful degradation: if extraction LLM fails entirely, use fallback
                    request.log.warn({ chapter: i, err: extractionErr.message }, 'fact sheet extraction LLM failed - using regex fallback');
                    const fallbackFactSheet = extractCharacterNamesFallback(chapterText);
                    fallbackFactSheet.chapterNumber = i;
                    memoryStore = addFactSheet(memoryStore, fallbackFactSheet);
                }
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                // CHARACTER SUMMARY - replaces summarizeChapter() for previousSummaries
                // (Requirements: 4.3)
                // -"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-"-
                let chapterSummaryStr = null;
                try {
                    const summaryRaw = await callLLM(buildCharacterSummarySystemPrompt(), buildCharacterSummaryUserPrompt({
                        chapterText,
                        chapterNumber: i,
                        storyBible: bibleText,
                    }), 2000, TEMPERATURE_FACT_EXTRACTION);
                    const summaryData = extractJson(summaryRaw);
                    if (validateCharacterSummary(summaryData)) {
                        chapterSummaryStr = characterSummaryToString(summaryData);
                    }
                    else {
                        request.log.info({ chapter: i }, 'character summary validation failed - falling back to summarizeChapter()');
                    }
                }
                catch (summaryErr) {
                    // Fallback to existing summarizeChapter() if Character Summary LLM fails
                    request.log.warn({ chapter: i, err: summaryErr.message }, 'character summary LLM failed - falling back to summarizeChapter()');
                }
                // Use character summary if available, otherwise fall back to existing summarizeChapter()
                chapterSummaries.push(chapterSummaryStr ?? summarizeChapter(chapterText, i));
                // Send chapter to client. Prefer the plan-locked title so the UI
                // shows consistent chapter naming even if the LLM omitted/changed it.
                const chapterTitle = plannedChapterTitle
                    || chapterJson?.title
                    || `Chương ${i}`;
                sendEvent('chapter', i, chapterText, {
                    title: chapterTitle,
                    repaired: repairAttempt > 0,
                    wordCount: metrics.wordCount,
                    dialogueRatio: Math.round(metrics.dialogueRatio * 100),
                    ...(consistencyWarning ? { consistencyWarning: true } : {}),
                    ...(qualitySoftPass ? { qualitySoftPass: true } : {}),
                    ...(aiTellsRepaired ? { aiTellsRepaired: true } : {}),
                    ...(finalAiTellMatches > 0 ? { aiTellMatches: finalAiTellMatches } : {}),
                    ...(phraseReuseScore !== undefined && phraseReuseScore >= 0.10 ? { phraseReuseScore } : {}),
                    ...(topRepeatedPhrases && topRepeatedPhrases.length > 0 ? { topRepeatedPhrases } : {}),
                    ...(FEATURE_IDIOLECT && driftReport ? { idiolectWarnings: driftReport.violations.filter(v => v.type === 'speech_idiolect').length } : {}),
                    ...(lowSentenceVariance !== undefined ? { lowSentenceVariance } : {}),
                    ...(sentenceCv !== undefined ? { sentenceCv } : {}),
                    ...(aiScoreEstimate !== undefined ? { aiScoreEstimate } : {}),
                    ...(humanizationRepaired ? { humanizationRepaired: true } : {}),
                });
            }
            // Save seed to history for future dedup. Include the character names
            // pulled from the Story_Bible so the next run knows what to avoid.
            await appendSeedHistory({
                fingerprint: seedBlueprint.fingerprint,
                linePreset: niche,
                titleHint: storyTitle,
                createdAt: new Date().toISOString(),
                blueprint: seedBlueprint,
                ...(bibleCharacterNames.length > 0 ? { characterNames: bibleCharacterNames } : {}),
            });
            sendEvent('done', undefined, undefined, { storyTitle });
            // Resolve pipeline promise so waiting reconnects can proceed
            pipelineResolve();
        }
        catch (err) {
            request.log.error({ err }, 'Stream generation failed');
            // Differentiate "upstream is down" (fail-fast via circuit breaker) from
            // generic LLM errors. Web client uses the code to render different UX.
            if (err instanceof UpstreamUnavailableError) {
                const errorFrame = `data: ${JSON.stringify({
                    stage: 'error',
                    error: 'AI server đang quá tải. Vui lòng thử lại sau ít phút.',
                    code: err.code,
                    retryAfterSeconds: err.retryAfterSeconds,
                })}\n\n`;
                if (!sseFrameCache.has(storyId)) sseFrameCache.set(storyId, []);
                sseFrameCache.get(storyId)!.push(errorFrame);
                try { reply.raw.write(errorFrame); } catch { /* client disconnected */ }
            }
            else {
                const errorFrame = `data: ${JSON.stringify({ stage: 'error', error: 'LLM generation failed' })}\n\n`;
                if (!sseFrameCache.has(storyId)) sseFrameCache.set(storyId, []);
                sseFrameCache.get(storyId)!.push(errorFrame);
                try { reply.raw.write(errorFrame); } catch { /* client disconnected */ }
            }
        }
        finally {
            clearInterval(keepAlive);
            try { reply.raw.end(); } catch { /* already closed */ }
            pipelineResolve();
        }
        })().catch((err) => {
            request.log.error({ err }, 'Unhandled pipeline error');
            pipelineResolve();
        });
        // Handler returns immediately - pipeline runs in background
        // Return reply to signal Fastify that response is being handled
        return reply;
    });
    // --- Voices (dev stub) ---
    app.get('/voices', async (_request, reply) => {
        return reply.send({ voices: [{ id: 'default', name: 'Giọng mặc định', language: 'vi' }] });
    });
    app.post('/voices/generate', async (_request, reply) => {
        return reply.send({ jobId: `dev-voice-${Date.now()}`, status: 'queued' });
    });
    // --- Export (dev stub) ---
    app.post('/export/pdf', async (_request, reply) => {
        return reply.send({ jobId: `dev-export-${Date.now()}`, status: 'queued' });
    });
    // --- Rewrite (dev stub) ---
    app.post('/stories/:id/rewrite', async (request, reply) => {
        const { id } = request.params;
        if (typeof id !== 'string' || id.length > 80 || !/^[\w.-]+$/.test(id)) {
            return reply.code(400).send({ error: { code: 'invalid_id', message: 'invalid story id' } });
        }
        const parsed = RewriteSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid input' },
            });
        }
        const chapterIndex = parsed.data.chapterIndex;
        const mode = parsed.data.mode ?? 'full_chapter';
        return reply.send({
            storyId: id,
            chapterIndex,
            content: `[DEV] Chương ${chapterIndex} đã được viết lại (mode: ${mode}).\n\nNội dung mới sau khi AI viết lại: Nhân vật chính đứng trước ngã ba đường, ánh mắt đầy quyết tâm. "Lần này, tôi sẽ không lùi bước," cô thì thầm...`,
            updatedAt: new Date().toISOString(),
        });
    });
    // --- Resume (dev stub) ---
    app.post('/stories/:id/resume', async (request, reply) => {
        const { id } = request.params;
        if (typeof id !== 'string' || id.length > 80 || !/^[\w.-]+$/.test(id)) {
            return reply.code(400).send({ error: { code: 'invalid_id', message: 'invalid story id' } });
        }
        return reply.send({
            jobId: id,
            resumed: [3, 4, 5],
        });
    });
    // --- Published stories (public shelf) ---
    const PUBLISHED_FILE = path.resolve(process.cwd(), '../../data/published-stories.json');
    // Schema for /published-stories POST. Hard caps prevent storage abuse.
    const MAX_TITLE_LEN = 200;
    const MAX_NICHE_LEN = 100;
    const MAX_AUTHOR_LEN = 80;
    const MAX_CHAPTERS = 30;
    const MAX_CHAPTER_TEXT = 60_000; // ≈ 12k words
    const ChapterDataSchema = z.object({
        index: z.number().int().min(0).max(MAX_CHAPTERS).optional(),
        title: z.string().max(MAX_TITLE_LEN).optional(),
        text: z.string().max(MAX_CHAPTER_TEXT).optional(),
        content: z.string().max(MAX_CHAPTER_TEXT).optional(),
    }).passthrough();
    const PublishCreateSchema = z.object({
        title: z.string().trim().min(1).max(MAX_TITLE_LEN),
        chapters: z.number().int().min(0).max(MAX_CHAPTERS).optional(),
        niche: z.string().max(MAX_NICHE_LEN).optional(),
        chaptersData: z.array(ChapterDataSchema).max(MAX_CHAPTERS).optional(),
    });
    const PublishPatchSchema = z.object({
        chaptersData: z.array(ChapterDataSchema).max(MAX_CHAPTERS),
        chapters: z.number().int().min(0).max(MAX_CHAPTERS).optional(),
    });
    const publishedStore = createAtomicJsonStore(PUBLISHED_FILE, {
        version: 1,
        entries: [],
    });
    // One-shot migration from the legacy array-shaped file (no `version` key)
    // to the new `{ version: 1, entries: [...] }` shape. Idempotent.
    await publishedStore.update((current) => {
        if (current.version === 1 && Array.isArray(current.entries)) {
            return { next: current, result: undefined };
        }
        const legacy = current;
        const arr = Array.isArray(legacy)
            ? legacy
            : Array.isArray(legacy?.stories)
                ? legacy.stories
                : [];
        const entries = arr
            .filter((e) => e !== null && typeof e === 'object')
            .map((e) => ({
            id: typeof e.id === 'string' ? e.id : `pub-${randomUUID()}`,
            title: typeof e.title === 'string' ? e.title.slice(0, MAX_TITLE_LEN) : 'untitled',
            chapters: typeof e.chapters === 'number' ? e.chapters : 0,
            niche: typeof e.niche === 'string' ? e.niche.slice(0, MAX_NICHE_LEN) : '',
            author: typeof e.author === 'string' ? e.author.slice(0, MAX_AUTHOR_LEN) : 'Anonymous',
            // Legacy entries had no owner. Mark them as belonging to nobody so
            // they cannot be edited by anyone other than an admin.
            ownerSub: typeof e.ownerSub === 'string' ? e.ownerSub : '__legacy__',
            chaptersData: Array.isArray(e.chaptersData) ? e.chaptersData : [],
            publishedAt: typeof e.publishedAt === 'string' ? e.publishedAt : new Date().toISOString(),
        }));
        return { next: { version: 1, entries }, result: undefined };
    });
    function publicView(entry) {
        // Never expose ownerSub to anonymous readers.
        const { ownerSub: _omit, ...rest } = entry;
        return rest;
    }
    app.get('/published-stories', async (_request, reply) => {
        reply.header('Cache-Control', 'public, max-age=60');
        const file = await publishedStore.read();
        return reply.send({ stories: file.entries.slice(0, 50).map(publicView) });
    });
    app.post('/published-stories', async (request, reply) => {
        if (!request.currentUser) {
            return reply.code(401).send({ error: { code: 'unauthenticated', message: 'login required' } });
        }
        const parsed = PublishCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid input' },
            });
        }
        const data = parsed.data;
        const ownerSub = request.currentUser.sub;
        // Author is server-derived from the verified token, never trusted from body.
        const author = (request.currentUser.name ?? request.currentUser.email ?? 'Anonymous').slice(0, MAX_AUTHOR_LEN);
        const entry = {
            id: `pub-${randomUUID()}`,
            title: data.title,
            chapters: data.chapters ?? 0,
            niche: data.niche ?? '',
            author,
            ownerSub,
            chaptersData: data.chaptersData ?? [],
            publishedAt: new Date().toISOString(),
        };
        const result = await publishedStore.update((current) => {
            // Dedupe by (ownerSub, title) - same author republishing same title updates in place.
            const filtered = current.entries.filter((s) => !(s.ownerSub === ownerSub && s.title === entry.title));
            filtered.unshift(entry);
            return {
                next: { version: 1, entries: filtered.slice(0, 200) },
                result: entry,
            };
        });
        return reply.code(201).send(publicView(result));
    });
    app.patch('/published-stories/:id', async (request, reply) => {
        if (!request.currentUser) {
            return reply.code(401).send({ error: { code: 'unauthenticated', message: 'login required' } });
        }
        const { id } = request.params;
        if (typeof id !== 'string' || id.length > 80 || !/^pub-[\w-]+$/.test(id)) {
            return reply.code(400).send({ error: { code: 'invalid_id', message: 'invalid id' } });
        }
        const parsed = PublishPatchSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'invalid input' },
            });
        }
        const ownerSub = request.currentUser.sub;
        const result = await publishedStore.update((current) => {
            const idx = current.entries.findIndex((s) => s.id === id);
            if (idx === -1) {
                return { next: current, result: { kind: 'not_found' } };
            }
            const existing = current.entries[idx];
            if (existing.ownerSub !== ownerSub && request.currentUser?.role !== 'admin') {
                return { next: current, result: { kind: 'forbidden' } };
            }
            const updated = {
                ...existing,
                chaptersData: parsed.data.chaptersData,
                chapters: parsed.data.chapters ?? existing.chapters,
            };
            const nextEntries = [...current.entries];
            nextEntries[idx] = updated;
            return { next: { version: 1, entries: nextEntries }, result: { kind: 'ok', entry: updated } };
        });
        if (result.kind === 'not_found')
            return reply.code(404).send({ error: { code: 'not_found', message: 'story not found' } });
        if (result.kind === 'forbidden')
            return reply.code(403).send({ error: { code: 'forbidden', message: 'not your story' } });
        return reply.send(publicView(result.entry));
    });
    // CORS is handled by `registerSecurity()` above using the strict allow-list.
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info({
        address,
        allowedOrigins: ALLOWED_ORIGINS,
        googleClientId: GOOGLE_CLIENT_ID.slice(0, 20) + '...',
        jwtIssuer: JWT_ISSUER,
        jwtAudience: JWT_AUDIENCE,
    }, 'dev api listening (http)');
    app.log.info(`OAuth start: http://localhost:${PORT}/auth/oauth/start`);
    app.log.info(`OAuth callback: ${GOOGLE_REDIRECT_URI}`);
}
main().catch((err) => {
    console.error('[api-dev] fatal boot error:', err);
    process.exit(1);
});

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[api-dev] uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[api-dev] unhandled rejection:', reason);
});
//# sourceMappingURL=startDev.js.map