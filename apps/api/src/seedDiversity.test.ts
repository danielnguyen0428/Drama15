import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStoryBiblePrompt } from '../../../src/modules/prompts/story-prompts.js';
import { createSeedBlueprint, type SeedHistoryEntry } from '../../../src/modules/prompts/seed-blueprint.js';

const linePreset = {
  id: 'workplace_ceo_power_struggle',
  label: 'Workplace / CEO / Career Power Struggle',
  summary: 'Corporate power reversal.',
  seriesExamples: [],
  storyPatterns: [],
  requiredBeats: [],
  tabooBeats: [],
};

const stylePreset = {
  id: 'co_man_warm_modern_blueprint',
  label: 'Cố Mạn - ấm áp hiện đại',
  description: 'Giọng văn hiện đại.',
};

const request = {
  linePreset: 'workplace_ceo_power_struggle',
  outputLanguage: 'vietnamese',
  chapterCount: 10,
  targetWordsPerChapter: 900,
  stylePreset: 'co_man_warm_modern_blueprint',
};

test('seed blueprint avoids recently used topic, motif and arena axes, not only skeleton axes', () => {
  const first = createSeedBlueprint({
    linePreset: 'workplace_ceo_power_struggle',
    random: () => 0,
    maxAttempts: 1,
  });
  const history: SeedHistoryEntry[] = [{
    fingerprint: 'recent-with-same-surface-axes',
    linePreset: 'workplace_ceo_power_struggle',
    createdAt: '2026-05-29T00:00:00.000Z',
    blueprint: {
      ...first,
      relationshipDynamic: 'older unrelated relationship lock',
      protagonistAgency: 'older unrelated agency lock',
      antagonistWeb: 'older unrelated antagonist lock',
      revealMechanism: 'older unrelated reveal lock',
      endingShape: 'older unrelated ending lock',
      fingerprint: 'older-unrelated-skeleton',
    },
  }];

  const next = createSeedBlueprint({
    linePreset: 'workplace_ceo_power_struggle',
    history,
    random: () => 0,
  });

  assert.notEqual(next.topicAnchor, first.topicAnchor);
  assert.notEqual(next.motifFamily, first.motifFamily);
  assert.notEqual(next.arena, first.arena);
});

test('story bible prompt includes recent character names from seed history', () => {
  const prompt = buildStoryBiblePrompt({
    request: request as never,
    concept: {
      title: 'Đuổi Tôi Khỏi Cuộc Họp, Tôi Mua Lại Công Ty',
      titleCandidates: [],
      logline: 'Một nữ cố vấn bị bôi nhọ dùng hồ sơ kiểm toán để lấy lại quyền lực.',
      promise: 'Cú lật quyền lực bằng chứng cứ.',
      conflictEngine: 'Sa thải công khai, hồ sơ kiểm toán và hội đồng quản trị.',
    },
    linePreset: linePreset as never,
    stylePreset: stylePreset as never,
    recentSeedHistory: [{
      fingerprint: 'names-1',
      linePreset: 'workplace_ceo_power_struggle',
      createdAt: '2026-05-29T00:00:00.000Z',
      characterNames: ['Lan Anh', 'Minh Quân', 'Bảo Trâm'],
    }],
  } as never);

  assert.match(prompt.userPrompt, /Recent character names to avoid/);
  assert.match(prompt.userPrompt, /Lan Anh/);
  assert.match(prompt.userPrompt, /Minh/);
  assert.match(prompt.userPrompt, /Quân/);
});
