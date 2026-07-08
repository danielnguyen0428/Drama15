const DEFAULT_CORS_ORIGIN = 'https://drama.novelkit.cc';

export function resolveAllowedOrigin(origin: string | undefined, corsOrigins: readonly string[]): string {
  if (origin && corsOrigins.includes(origin)) {
    return origin;
  }

  return corsOrigins[0] ?? DEFAULT_CORS_ORIGIN;
}

export function buildCorsHeaders(origin: string | undefined, corsOrigins: readonly string[]): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin, corsOrigins),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type,x-admin-api-key,x-api-key',
    Vary: 'Origin',
  };
}

export function buildStreamHeaders(origin: string | undefined, corsOrigins: readonly string[]): Record<string, string> {
  return {
    ...buildCorsHeaders(origin, corsOrigins),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
