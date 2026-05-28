import assert from 'node:assert/strict';
import test from 'node:test';

import { getVietnamUsageDate, resolveStoryQuotaLimit } from '../../../src/modules/auth/quota.js';

test('story quota limits follow user tier', () => {
  assert.equal(resolveStoryQuotaLimit('free'), 1);
  assert.equal(resolveStoryQuotaLimit('pro'), 3);
  assert.equal(resolveStoryQuotaLimit('premium'), 5);
  assert.equal(resolveStoryQuotaLimit(undefined), 1);
});

test('usage date resets by Vietnam calendar day', () => {
  assert.equal(getVietnamUsageDate(new Date('2026-05-27T17:30:00.000Z')), '2026-05-28');
});
