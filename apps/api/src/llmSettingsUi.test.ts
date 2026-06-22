import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modalSource = readFileSync(
  new URL('../../web/src/story/LlmSettingsModal.tsx', import.meta.url),
  'utf8',
);
const workspaceCss = readFileSync(
  new URL('../../web/src/story/StoryWorkspace.css', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('../../web/src/story/StoryWorkspace.tsx', import.meta.url),
  'utf8',
);
const translationsSource = readFileSync(
  new URL('../../web/src/i18n/translations.ts', import.meta.url),
  'utf8',
);

test('LLM provider presets render as one responsive tab bar', () => {
  assert.match(modalSource, /className="provider-tabbar"/);
  assert.match(modalSource, /role="tab"/);
  assert.match(modalSource, /aria-selected=/);
  assert.match(modalSource, /preset\.id === 'gemini-openai' \? 'Gemini'/);
  assert.doesNotMatch(modalSource, /className="provider-presets"/);
  assert.match(workspaceCss, /\.provider-tabbar\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;/);
  assert.match(workspaceCss, /\.provider-tabbar button\.active\s*\{[^}]*border-bottom-color:\s*var\(--coral\);/);
});

test('admin announcement uses the new personal API key message without the old item list', () => {
  assert.match(
    translationsSource,
    /Hệ thống vận hành miễn phí hoàn toàn\. Người dùng có thể nhập API key từ OpenAI, OpenRouter, Gemini \(OpenAI-compatible\) cá nhân hoặc các Provider khác được cung cấp từ admin\./,
  );
  assert.match(workspaceSource, /t\('announcement\.body'\)/);
  assert.doesNotMatch(workspaceSource, /announcement-list/);
  assert.doesNotMatch(translationsSource, /announcement\.line[123]|Deepseek Flash 4|📢|🎉|🤖|😢/);
});
