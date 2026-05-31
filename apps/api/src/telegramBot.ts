import type { FastifyBaseLogger } from 'fastify';

import { env } from '../../../src/lib/env.js';
import { RouterClient } from '../../../src/modules/router/router-client.js';
import { getSupabaseAdmin } from './supabaseServer.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

type ConnectionStatus = 'up' | 'degraded' | 'down' | 'skipped';

type ServiceCheck = {
  name: string;
  status: ConnectionStatus;
  detail?: string;
  latencyMs?: number;
};

export type StatusReport = {
  generatedAt: string;
  overall: ConnectionStatus;
  services: ServiceCheck[];
};

export type NewUserNotice = {
  id: string;
  email: string;
  displayName: string;
  tier: string;
};

type Logger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

const statusEmoji: Record<ConnectionStatus, string> = {
  up: '🟢',
  degraded: '🟡',
  down: '🔴',
  skipped: '⚪️',
};

let pollingAbort: AbortController | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;
const sharedRouterClient = new RouterClient();

export function isTelegramConfigured() {
  return Boolean(env.telegramBotToken && env.telegramChatId);
}

/** The bot can poll for commands as soon as a token is available. */
function canPoll() {
  return Boolean(env.telegramBotToken);
}

/**
 * Low-level call to the Telegram Bot API. Uses native fetch with an
 * AbortController timeout, mirroring RouterClient's networking approach so we
 * avoid pulling in an extra dependency.
 */
async function callTelegram<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T> {
  if (!env.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${env.telegramBotToken}/${method}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const body = (await response.json().catch(() => null)) as
      | { ok: boolean; result?: T; description?: string }
      | null;

    if (!response.ok || !body?.ok) {
      const description = body?.description ?? `HTTP ${response.status}`;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }

    return body.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a message to the configured chat. Never throws: failures are logged so
 * a Telegram outage cannot break the request path that triggered the notice.
 */
export async function sendTelegramMessage(
  text: string,
  options: { chatId?: string; logger?: Logger } = {},
): Promise<boolean> {
  const chatId = options.chatId ?? env.telegramChatId;
  if (!env.telegramBotToken || !chatId) {
    options.logger?.warn?.('Telegram not configured; skipping message.');
    return false;
  }

  try {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return true;
  } catch (error) {
    options.logger?.error?.(
      { error },
      'Failed to send Telegram message.',
    );
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function worseStatus(a: ConnectionStatus, b: ConnectionStatus): ConnectionStatus {
  const rank: Record<ConnectionStatus, number> = {
    up: 0,
    skipped: 1,
    degraded: 2,
    down: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

async function timedFetch(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkApi(): Promise<ServiceCheck> {
  // The API is the process running this code, so reaching this point means the
  // process is alive. We still surface uptime/port for visibility.
  const uptimeMin = Math.round((process.uptime() / 60) * 10) / 10;
  return {
    name: 'API',
    status: 'up',
    detail: `cổng ${env.port} · uptime ${uptimeMin}m`,
  };
}

async function checkWeb(): Promise<ServiceCheck> {
  const target = env.webPublicUrl ?? firstCorsHttpOrigin();
  if (!target) {
    return {
      name: 'Web',
      status: 'skipped',
      detail: 'chưa cấu hình WEB_PUBLIC_URL',
    };
  }

  try {
    const result = await timedFetch(target, 8_000, { method: 'GET' });
    return {
      name: 'Web',
      status: result.ok ? 'up' : 'degraded',
      detail: `${target} · HTTP ${result.status}`,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    return {
      name: 'Web',
      status: 'down',
      detail: `${target} · ${errorText(error)}`,
    };
  }
}

async function checkRouter(): Promise<ServiceCheck> {
  try {
    const health = await sharedRouterClient.checkHealth();
    return {
      name: '9Router',
      status: health.status === 'healthy' ? 'up' : 'degraded',
      detail: `${health.baseUrl}${health.details ? ` · ${health.details}` : ''}`,
    };
  } catch (error) {
    return {
      name: '9Router',
      status: 'down',
      detail: errorText(error),
    };
  }
}

async function checkSupabase(): Promise<ServiceCheck> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return {
      name: 'Supabase',
      status: 'skipped',
      detail: 'chưa cấu hình credentials',
    };
  }

  try {
    const startedAt = Date.now();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    if (error) {
      return { name: 'Supabase', status: 'degraded', detail: error.message };
    }
    return {
      name: 'Supabase',
      status: 'up',
      detail: 'kết nối DB OK',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return { name: 'Supabase', status: 'down', detail: errorText(error) };
  }
}

export async function buildStatusReport(): Promise<StatusReport> {
  const services = await Promise.all([
    checkApi(),
    checkWeb(),
    checkRouter(),
    checkSupabase(),
  ]);

  const overall = services
    .map((service) => service.status)
    .reduce(worseStatus, 'up' as ConnectionStatus);

  return {
    generatedAt: new Date().toISOString(),
    overall,
    services,
  };
}

export function formatStatusReport(report: StatusReport): string {
  const lines = [
    `${statusEmoji[report.overall]} <b>Drama15 · Trạng thái hệ thống</b>`,
    `🕒 ${formatVietnamTime(report.generatedAt)}`,
    '',
  ];

  for (const service of report.services) {
    const latency = typeof service.latencyMs === 'number' ? ` (${service.latencyMs}ms)` : '';
    const detail = service.detail ? ` — ${escapeHtml(service.detail)}` : '';
    lines.push(`${statusEmoji[service.status]} <b>${escapeHtml(service.name)}</b>${latency}${detail}`);
  }

  return lines.join('\n');
}

export function formatNewUserNotice(user: NewUserNotice): string {
  return [
    '🎉 <b>Drama15 · Người dùng mới đăng ký</b>',
    `👤 ${escapeHtml(user.displayName || '(không tên)')}`,
    `✉️ ${escapeHtml(user.email || '(không email)')}`,
    `🏷️ Gói: ${escapeHtml(user.tier)}`,
    `🆔 <code>${escapeHtml(user.id)}</code>`,
    `🕒 ${formatVietnamTime(new Date().toISOString())}`,
  ].join('\n');
}

export async function notifyNewUser(user: NewUserNotice, logger?: Logger): Promise<void> {
  if (!isTelegramConfigured()) return;
  await sendTelegramMessage(formatNewUserNotice(user), { logger });
}

export async function sendStatusReport(logger?: Logger): Promise<StatusReport> {
  const report = await buildStatusReport();
  if (isTelegramConfigured()) {
    await sendTelegramMessage(formatStatusReport(report), { logger });
  }
  return report;
}

/**
 * Starts the Telegram bot: an optional periodic status broadcast plus a
 * long-polling loop that answers /status, /ping and /start commands.
 */
export function startTelegramBot(logger?: Logger): void {
  if (!canPoll()) {
    logger?.warn?.('Telegram bot disabled: TELEGRAM_BOT_TOKEN not set.');
    return;
  }

  if (!env.telegramChatId) {
    logger?.warn?.(
      'Telegram bot: TELEGRAM_CHAT_ID not set. Send /start to the bot to get your chat ID; notifications stay off until it is configured.',
    );
  } else {
    logger?.info?.('Telegram bot enabled.');
  }

  if (env.telegramStatusIntervalMs > 0) {
    statusTimer = setInterval(() => {
      void sendStatusReport(logger);
    }, env.telegramStatusIntervalMs);
    if (typeof statusTimer.unref === 'function') statusTimer.unref();
  }

  if (env.telegramEnablePolling) {
    void runPollingLoop(logger);
  }
}

export function stopTelegramBot(): void {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (pollingAbort) {
    pollingAbort.abort();
    pollingAbort = null;
  }
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
};

async function runPollingLoop(logger?: Logger): Promise<void> {
  pollingAbort = new AbortController();
  let offset = 0;
  logger?.info?.('Telegram command polling started.');

  while (!pollingAbort.signal.aborted) {
    try {
      const updates = await callTelegram<TelegramUpdate[]>(
        'getUpdates',
        { offset, timeout: 30, allowed_updates: ['message'] },
        40_000,
      );

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        await handleUpdate(update, logger);
      }
    } catch (error) {
      if (pollingAbort.signal.aborted) break;
      logger?.warn?.({ error }, 'Telegram polling error; retrying in 5s.');
      await delay(5_000);
    }
  }

  logger?.info?.('Telegram command polling stopped.');
}

async function handleUpdate(update: TelegramUpdate, logger?: Logger): Promise<void> {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (chatId === undefined || !text) return;

  // Onboarding: if no chat ID is configured yet, reply to whoever messages so
  // the operator can copy it into TELEGRAM_CHAT_ID. Don't run status checks.
  if (!env.telegramChatId) {
    await sendTelegramMessage(
      [
        '👋 <b>Drama15 Bot</b> đã sẵn sàng.',
        `Chat ID của bạn là: <code>${escapeHtml(String(chatId))}</code>`,
        'Đặt giá trị này vào biến môi trường <code>TELEGRAM_CHAT_ID</code> rồi khởi động lại API để bật thông báo.',
      ].join('\n'),
      { chatId: String(chatId), logger },
    );
    return;
  }

  // Only respond inside the configured chat to avoid leaking status elsewhere.
  if (String(chatId) !== String(env.telegramChatId)) return;

  const command = text.split(/\s+/)[0].replace(/@.*$/, '').toLowerCase();

  switch (command) {
    case '/start':
    case '/help':
      await sendTelegramMessage(
        [
          '🤖 <b>Drama15 Bot</b>',
          'Các lệnh khả dụng:',
          '/status — kiểm tra trạng thái hệ thống',
          '/ping — kiểm tra bot còn sống',
          '/chatid — hiển thị chat ID hiện tại',
        ].join('\n'),
        { chatId: String(chatId), logger },
      );
      break;
    case '/status':
      await sendTelegramMessage(
        formatStatusReport(await buildStatusReport()),
        { chatId: String(chatId), logger },
      );
      break;
    case '/ping':
      await sendTelegramMessage('🏓 pong', { chatId: String(chatId), logger });
      break;
    case '/chatid':
      await sendTelegramMessage(
        `Chat ID: <code>${escapeHtml(String(chatId))}</code>`,
        { chatId: String(chatId), logger },
      );
      break;
    default:
      // Ignore unknown commands silently.
      break;
  }
}

function firstCorsHttpOrigin(): string | undefined {
  return env.corsOrigins.find((origin) => /^https?:\/\//.test(origin));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatVietnamTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
