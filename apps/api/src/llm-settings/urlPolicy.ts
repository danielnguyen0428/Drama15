import type { LlmProviderSchema } from './spec.js';
import type { z } from 'zod';

type Provider = z.infer<typeof LlmProviderSchema>;

const PROVIDER_HOSTS: Record<Provider, ReadonlySet<string>> = {
  c: new Set(['api.xah.io']),
  s: new Set(['api.shopaikey.com', 'api-v2.shopaikey.com']),
  other: new Set([
    'api.openai.com',
    'openrouter.ai',
    'generativelanguage.googleapis.com',
  ]),
};

type UrlPolicyResult =
  | { success: true; baseUrl: string }
  | {
      success: false;
      error: { code: 'BASE_URL_NOT_ALLOWED'; message: string };
    };

export function validateLlmBaseUrl(input: {
  provider: Provider;
  baseUrl: string;
  additionalHosts?: readonly string[];
  allowInsecureLocalhost?: boolean;
}): UrlPolicyResult {
  let url: URL;
  try {
    url = new URL(input.baseUrl.trim());
  } catch {
    return denied('Base URL không hợp lệ.');
  }

  const host = url.hostname.toLowerCase();
  const localAllowed = Boolean(
    input.allowInsecureLocalhost
      && url.protocol === 'http:'
      && (host === 'localhost' || host === '127.0.0.1' || host === '::1'),
  );
  if (url.protocol !== 'https:' && !localAllowed) {
    return denied('Base URL phải dùng HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    return denied('Base URL không được chứa credential, query hoặc fragment.');
  }

  const extraHosts = new Set(
    (input.additionalHosts ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  if (!localAllowed && !PROVIDER_HOSTS[input.provider].has(host) && !extraHosts.has(host)) {
    return denied('Host provider chưa được server cho phép.');
  }

  const unsupportedPath = /\/(messages|responses|completions|api\/chat)\/?$/i;
  if (unsupportedPath.test(url.pathname) && !/\/chat\/completions\/?$/i.test(url.pathname)) {
    return denied('Drama15 chỉ hỗ trợ OpenAI-compatible Chat Completions.');
  }

  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
  return { success: true, baseUrl: url.toString().replace(/\/$/, '') };
}

function denied(message: string): UrlPolicyResult {
  return {
    success: false,
    error: { code: 'BASE_URL_NOT_ALLOWED', message },
  };
}
