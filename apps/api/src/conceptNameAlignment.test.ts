import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Resolve preset assets from the repo root regardless of the test runner's cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
process.env.DRAMA15_APP_ROOT ??= repoRoot;
process.env.DRAMA15_ASSET_ROOT ??= repoRoot;

import {
  buildConceptNameAlignmentPrompt,
  buildStoryBiblePrompt,
} from '../../../src/modules/prompts/story-prompts.js';
import { renderCharacterNamingPolicyForPrompt } from '../../../src/modules/prompts/character-naming.js';

const linePreset = {
  id: 'workplace_ceo_power_struggle',
  label: 'Workplace / CEO',
  summary: 'Corporate power reversal.',
  seriesExamples: [],
  storyPatterns: [],
  requiredBeats: [],
  tabooBeats: [],
};

const stylePreset = {
  id: 'co_man_warm_modern_blueprint',
  label: 'Cố Mạn',
  description: 'Modern voice.',
};

const concept = {
  title: 'The Card That Would Not Open',
  titleCandidates: ['The Card That Would Not Open'],
  logline: 'Lam An, a deaf architect, is denied entry to the hotel she designed.',
  promise: 'A social-injustice romance with a quiet, evidence-driven reversal.',
  conflictEngine: 'Ky Thua Trach protects the listing while Lam An gathers proof.',
};

const storyBible = {
  premise: 'A deaf consultant is excluded from the space she designed.',
  heroine: { name: 'Hannah Caldwell', wound: 'unseen', strengths: ['observant'], blindSpots: ['too patient'] },
  betrayer: { name: 'Ethan Brooks', wound: 'cowardice', cowardiceVector: 'image' },
  rival: { name: 'Vivian Ashford', socialPower: 'media dynasty', demeanor: 'polished' },
  classHierarchy: ['elite circles'],
  betrayalEngine: 'public replacement',
  classShameEngine: 'polite exclusion',
  revengeEngine: 'evidence',
  endingMode: 'bittersweet dignity',
};

test('concept name alignment prompt carries canonical bible names and guards the title', () => {
  const prompt = buildConceptNameAlignmentPrompt({
    request: { outputLanguage: 'english' } as never,
    concept: concept as never,
    storyBible: storyBible as never,
  });

  assert.match(prompt.userPrompt, /Hannah Caldwell/);
  assert.match(prompt.userPrompt, /Ethan Brooks/);
  assert.match(prompt.userPrompt, /Vivian Ashford/);
  // Must not change plot/title/structure.
  assert.match(prompt.userPrompt, /Do NOT change the plot, premise, tone, structure, title/);
  // English language instruction must be present.
  assert.match(prompt.userPrompt, /English/);
});

test('English stories get English naming guidance, not the Vietnamese register policy', () => {
  const policy = renderCharacterNamingPolicyForPrompt(undefined, 'english');
  assert.match(policy, /native to that language/);
  assert.match(policy, /English/);
  // Must not apply the Vietnamese register-lock policy (modern vs Sino register choice).
  assert.doesNotMatch(policy, /NAMING REGISTER LOCK/);
  assert.doesNotMatch(policy, /PREFERRED Sino-Vietnamese given-name pool/);
});

test('Japanese and Korean stories get language-specific naming guidance', () => {
  const jp = renderCharacterNamingPolicyForPrompt(undefined, 'japanese');
  assert.match(jp, /Japanese/);
  assert.match(jp, /family name/);

  const kr = renderCharacterNamingPolicyForPrompt(undefined, 'korean');
  assert.match(kr, /Korean/);
});

test('Vietnamese stories keep the modern / Sino-Vietnamese register policy', () => {
  const policy = renderCharacterNamingPolicyForPrompt(undefined, 'vietnamese');
  assert.match(policy, /NAMING REGISTER LOCK/);
  assert.match(policy, /Sino-Vietnamese/);
});

test('story bible prompt threads output language into the naming policy', () => {
  const prompt = buildStoryBiblePrompt({
    request: { outputLanguage: 'english', linePreset: 'workplace_ceo_power_struggle', chapterCount: 15, stylePreset: 'co_man_warm_modern_blueprint' } as never,
    concept: concept as never,
    linePreset: linePreset as never,
    stylePreset: stylePreset as never,
    recentSeedHistory: [],
  } as never);

  assert.match(prompt.userPrompt, /native to that language/);
  assert.doesNotMatch(prompt.userPrompt, /NAMING REGISTER LOCK/);
});
