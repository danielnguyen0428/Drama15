import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAMA15_CHAPTER_ARCHITECTURE,
  DRAMA15_FIXED_CHAPTER_COUNT,
  buildDrama15ChapterArchitecture,
  clampChapterCount,
  resolveComplexityChapterCount,
  resolveKeyChapters,
} from '../../../src/modules/prompts/drama15-chapter-architecture.js';

test('total 15 returns the canonical array by reference (zero regression)', () => {
  const built = buildDrama15ChapterArchitecture(15);
  // Same reference: the default path is byte-identical to the hand-authored array.
  assert.equal(built, DRAMA15_CHAPTER_ARCHITECTURE);
  assert.equal(built.length, 15);
});

test('clampChapterCount floors at 15 and caps at 17', () => {
  assert.equal(clampChapterCount(15), 15);
  assert.equal(clampChapterCount(16), 16);
  assert.equal(clampChapterCount(17), 17);
  assert.equal(clampChapterCount(14), 15);
  assert.equal(clampChapterCount(3), 15);
  assert.equal(clampChapterCount(99), 17);
  assert.equal(clampChapterCount(15.4), 15);
  assert.equal(clampChapterCount(NaN), DRAMA15_FIXED_CHAPTER_COUNT);
});

test('16 and 17 chapters renumber sequentially with no gaps', () => {
  for (const total of [16, 17]) {
    const built = buildDrama15ChapterArchitecture(total);
    assert.equal(built.length, total);
    built.forEach((chapter, index) => {
      assert.equal(chapter.chapterNumber, index + 1);
    });
  }
});

test('extra chapters preserve the pre-rise beats and only shift climax/resolution', () => {
  const built = buildDrama15ChapterArchitecture(17);
  const keys = resolveKeyChapters(17);

  // Foreshadow plant/activate, nadir, pivot keep their canonical positions.
  assert.equal(keys.foreshadowPlant, 3);
  assert.equal(keys.foreshadowActivate, 7);
  assert.equal(keys.nadir, 9);
  assert.equal(keys.pivot, 10);
  // Climax + resolution slide down by the +2 delta.
  assert.equal(keys.publicReveal, 16);
  assert.equal(keys.resolution, 17);

  // The chapters at those positions carry the right authored functions.
  assert.equal(built[2].functionName, 'threat_surface_and_foreshadow');
  assert.equal(built[6].functionName, 'betrayal_reveal_foreshadow_activation');
  assert.equal(built[8].functionName, 'no_rescue_nadir');
  assert.equal(built[9].functionName, 'internal_pivot_private_choice');
  assert.equal(built[keys.publicReveal - 1].functionName, 'public_trap_confrontation');
  assert.equal(built[keys.resolution - 1].functionName, 'climax_aftershock_new_equilibrium');
});

test('inserted chapters are rise-arc sustain chapters', () => {
  const built = buildDrama15ChapterArchitecture(17);
  const inserted = built.filter((chapter) => chapter.functionName === 'rise_sustain_pressure');
  assert.equal(inserted.length, 2);
  for (const chapter of inserted) {
    assert.equal(chapter.arc, 'rise');
    // Inserted between the last canonical rise chapter (12) and the climax.
    assert.ok(chapter.chapterNumber >= 13);
  }
});

test('resolveComplexityChapterCount floors at 15 for a simple two-thread story', () => {
  // Baseline story: exactly two pressure threads, no extra supporting cast.
  // Must stay at 15 so a simple story is byte-identical to the old pipeline.
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 2, supportingCastCount: 0 }), 15);
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 2, supportingCastCount: 2 }), 15);
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 1, supportingCastCount: 1 }), 15);
});

test('resolveComplexityChapterCount earns one chapter per two units of excess complexity', () => {
  // 2 excess units (e.g. 3 threads + 1 extra cast) -> +1 chapter.
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 3, supportingCastCount: 3 }), 16);
  // 4 excess units -> +2 chapters, capped at 17.
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 4, supportingCastCount: 4 }), 17);
  // A single excess unit is not enough for a whole chapter.
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 3, supportingCastCount: 2 }), 15);
});

test('resolveComplexityChapterCount never exceeds 17 no matter how complex', () => {
  assert.equal(resolveComplexityChapterCount({ pressureThreadCount: 20, supportingCastCount: 20 }), 17);
});

test('resolveKeyChapters(15) matches the canonical locks exactly', () => {
  const keys = resolveKeyChapters(15);
  assert.deepEqual(keys, {
    foreshadowPlant: 3,
    foreshadowActivate: 7,
    reveal: 7,
    nadir: 9,
    pivot: 10,
    publicReveal: 14,
    resolution: 15,
  });
});
