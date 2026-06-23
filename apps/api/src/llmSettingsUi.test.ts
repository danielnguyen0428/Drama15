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

test('admin announcement presents the personal API key message as a clear list', () => {
  assert.match(translationsSource, /announcement\.item_free/);
  assert.match(translationsSource, /announcement\.item_keys/);
  assert.match(translationsSource, /announcement\.item_admin_provider/);
  assert.match(translationsSource, /OpenAI, OpenRouter, Gemini \(OpenAI-compatible\)/);
  assert.match(workspaceSource, /className="announcement-list"/);
  assert.match(workspaceSource, /<li>/);
  assert.match(workspaceSource, /showAnnouncement && !showLlmSettings/);
  assert.match(workspaceSource, /!showLlmSettings && \(\s*<a className=\{`fb-float-btn/);
  assert.match(workspaceCss, /\.fb-float-btn\.with-announcement\s*\{[^}]*right:\s*428px;[^}]*bottom:\s*24px;/);
  assert.match(workspaceCss, /\.fb-float-btn\.with-announcement\s*\{[^}]*right:\s*12px;[^}]*bottom:\s*310px;/);
  assert.doesNotMatch(workspaceSource, /t\('announcement\.body'\)/);
  assert.doesNotMatch(translationsSource, /announcement\.line[123]|Deepseek Flash 4|📢|🎉|🤖|😢/);
});
