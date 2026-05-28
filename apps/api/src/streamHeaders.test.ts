import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStreamHeaders } from './streamHeaders.js';

test('buildStreamHeaders includes CORS headers for allowed production origin', () => {
  const headers = buildStreamHeaders('https://drama.novelkit.cc', ['https://drama.novelkit.cc']);

  assert.equal(headers['Access-Control-Allow-Origin'], 'https://drama.novelkit.cc');
  assert.match(headers['Access-Control-Allow-Methods'], /PATCH/);
  assert.match(headers['Access-Control-Allow-Methods'], /DELETE/);
  assert.equal(headers.Vary, 'Origin');
  assert.equal(headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(headers['Cache-Control'], 'no-cache, no-transform');
});

test('buildStreamHeaders allows auth headers for signed-in browser requests', () => {
  const headers = buildStreamHeaders('https://drama.novelkit.cc', ['https://drama.novelkit.cc']);

  assert.match(headers['Access-Control-Allow-Headers'], /authorization/i);
  assert.match(headers['Access-Control-Allow-Headers'], /content-type/i);
});
