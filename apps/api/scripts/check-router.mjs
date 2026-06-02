import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Probe the AI router /models endpoint the same way the app health check does.
// Prints status + latency only, never the API key.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const baseUrl = (env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
const apiKey = env.OPENAI_API_KEY || '';
if (!baseUrl) {
  console.error('Missing OPENAI_BASE_URL in .env');
  process.exit(1);
}

const target = `${baseUrl}/models`;
console.log(`router base: ${baseUrl}`);

const started = Date.now();
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: controller.signal,
  });
  clearTimeout(timer);
  const latency = Date.now() - started;
  const text = await res.text();
  let modelCount = null;
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json?.data)) modelCount = json.data.length;
  } catch {
    // non-JSON body
  }
  console.log(`HTTP ${res.status} in ${latency}ms`);
  if (modelCount !== null) {
    console.log(`models available: ${modelCount}`);
  } else {
    console.log(`body (first 200 chars): ${text.slice(0, 200)}`);
  }
} catch (error) {
  const latency = Date.now() - started;
  console.log(`request failed after ${latency}ms: ${error?.name === 'AbortError' ? 'timeout' : (error?.message ?? String(error))}`);
  process.exit(2);
}
