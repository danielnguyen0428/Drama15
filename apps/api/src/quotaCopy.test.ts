import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const API_SOURCE = readFileSync(new URL('./startDev.ts', import.meta.url), 'utf8');
const WEB_SOURCE = readFileSync(new URL('../../web/src/story/StoryWorkspace.tsx', import.meta.url), 'utf8');
const TRANSLATIONS_SOURCE = readFileSync(new URL('../../web/src/i18n/translations.ts', import.meta.url), 'utf8');

test('daily quota copy and runtime enforcement are removed for user-funded providers', () => {
  const quotaCopy = `${API_SOURCE}\n${WEB_SOURCE}\n${TRANSLATIONS_SOURCE}`;

  assert.doesNotMatch(quotaCopy, /bản thảo truyện có thể viết/i);
  assert.doesNotMatch(quotaCopy, /Mỗi bản thảo gồm ý tưởng, nhân vật, dàn ý, quan hệ và toàn bộ chương/i);
  assert.doesNotMatch(quotaCopy, /lượt gợi ý kịch bản hôm nay/i);
  assert.doesNotMatch(quotaCopy, /consumeStoryQuota|consumeSetupSuggestionQuota|quota_exceeded/);
});
