import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..', '..');
process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;

const { env } = await import('../../../src/lib/env.js');
const { RouterClient } = await import('../../../src/modules/router/router-client.js');
const { PresetLoader } = await import('../../../src/modules/presets/preset-loader.js');

const models = await new PresetLoader().loadModelPreset(env.modelPreset);
console.log(`provider=${env.routerBaseUrl}  planner=${models.planner}`);

const router = new RouterClient();
const started = Date.now();
try {
  const { data, modelUsed } = await router.generateJson({
    model: models.planner,
    fallbackModel: models.fallback,
    systemPrompt: 'Return only valid JSON.',
    userPrompt: 'Return JSON: { "ok": true, "hello": "<one short Vietnamese word>" }',
    temperature: 0.2,
    timeoutMs: 60000,
  });
  console.log(`✔ provider OK in ${((Date.now() - started) / 1000).toFixed(1)}s via ${modelUsed}:`, JSON.stringify(data));
} catch (error) {
  console.log(`✗ provider call failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error?.message ?? error}`);
  process.exit(1);
}
