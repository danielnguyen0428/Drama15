import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const VERCEL_CONFIG_URL = new URL('../../web/vercel.json', import.meta.url);
const SUPABASE_AUTH_ORIGIN = 'https://bsjvtepwjjqkpizhhmyd.supabase.co';

function getWebContentSecurityPolicy(): string {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG_URL, 'utf8')) as {
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };

  const cspHeader = config.headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key.toLowerCase() === 'content-security-policy');

  assert.ok(cspHeader, 'web Vercel config must define Content-Security-Policy');
  return cspHeader.value;
}

test('web CSP allows API and Supabase Auth browser requests', () => {
  const csp = getWebContentSecurityPolicy();

  assert.match(csp, /connect-src[^;]*'self'/);
  assert.match(csp, /connect-src[^;]*https:\/\/drama-api\.novelkit\.cc/);
  assert.match(csp, new RegExp(`connect-src[^;]*${SUPABASE_AUTH_ORIGIN.replaceAll('.', '\\.')}`));
});
