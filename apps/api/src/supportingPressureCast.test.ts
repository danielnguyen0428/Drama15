import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStoryBible } from '../../../src/modules/validators/story-validator.js';

test('parseStoryBible keeps a well-formed supportingPressureCast', () => {
  const bible = parseStoryBible({
    premise: 'p',
    heroine: { name: 'Lam Khê', wound: 'w', strengths: ['s'], blindSpots: ['b'] },
    betrayer: { name: 'Đăng Nguyên', wound: 'w', cowardiceVector: 'c' },
    rival: { name: 'Bảo Ngọc', socialPower: 'sp', demeanor: 'd' },
    classHierarchy: ['elite'],
    supportingPressureCast: [
      {
        name: 'Bà Cẩm',
        role: 'quản gia / mẹ Đăng Nguyên',
        relationshipToHeroine: 'người giám sát trong nhà',
        pressureContribution: 'dùng lời khen để giữ cô đúng vị trí người làm',
      },
    ],
    betrayalEngine: 'be',
    classShameEngine: 'cse',
    revengeEngine: 're',
    endingMode: 'em',
  });

  assert.equal(bible.supportingPressureCast.length, 1);
  assert.equal(bible.supportingPressureCast[0].name, 'Bà Cẩm');
});

test('parseStoryBible defaults supportingPressureCast to an empty array when absent', () => {
  const bible = parseStoryBible({
    premise: 'p',
    heroine: { name: 'A', wound: 'w', strengths: ['s'], blindSpots: ['b'] },
    betrayer: { name: 'B', wound: 'w', cowardiceVector: 'c' },
    rival: { name: 'C', socialPower: 'sp', demeanor: 'd' },
    classHierarchy: ['elite'],
    betrayalEngine: 'be',
    classShameEngine: 'cse',
    revengeEngine: 're',
    endingMode: 'em',
  });

  assert.deepEqual(bible.supportingPressureCast, []);
});

test('parseStoryBible drops malformed supportingPressureCast entries', () => {
  const bible = parseStoryBible({
    premise: 'p',
    heroine: { name: 'A', wound: 'w', strengths: ['s'], blindSpots: ['b'] },
    betrayer: { name: 'B', wound: 'w', cowardiceVector: 'c' },
    rival: { name: 'C', socialPower: 'sp', demeanor: 'd' },
    classHierarchy: ['elite'],
    supportingPressureCast: [
      { name: 'Có tên', role: 'cha', relationshipToHeroine: 'bố chồng tương lai', pressureContribution: 'ép cưới' },
      { name: '', role: '', relationshipToHeroine: '', pressureContribution: '' },
      'not an object',
    ],
    betrayalEngine: 'be',
    classShameEngine: 'cse',
    revengeEngine: 're',
    endingMode: 'em',
  });

  assert.equal(bible.supportingPressureCast.length, 1);
  assert.equal(bible.supportingPressureCast[0].name, 'Có tên');
});
