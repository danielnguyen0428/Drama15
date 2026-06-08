import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPropagationLedger } from '../../../src/modules/core-pipeline/validators/propagation-ledger.js';

const emptyForeshadow = { planted: [], activated: [], missed: [] };

test('no debts when everything is paid off', () => {
  const debts = buildPropagationLedger({
    foreshadow: { ...emptyForeshadow, activated: [{ plantedInChapter: 3, detail: 'x', status: 'activated', activatedInChapter: 12 }] },
    plotBeats: { beats: [{ chapterNumber: 1, plannedBeat: 'b', achieved: true }] },
    establishedFacts: [],
  });
  assert.equal(debts.length, 0);
});

test('flags missed and pending foreshadow with correct severity', () => {
  const debts = buildPropagationLedger({
    foreshadow: {
      planted: [{ plantedInChapter: 3, detail: 'cái khóa', status: 'planted' }],
      activated: [],
      missed: [{ plantedInChapter: 5, detail: 'lá thư', status: 'missed' }],
    },
    plotBeats: { beats: [] },
  });

  const missed = debts.find((d) => d.kind === 'missed_foreshadow');
  const pending = debts.find((d) => d.kind === 'pending_foreshadow');
  assert.ok(missed);
  assert.equal(missed.severity, 'high');
  assert.ok(pending);
  assert.equal(pending.severity, 'medium');
  // high sorts before medium
  assert.equal(debts[0].kind, 'missed_foreshadow');
});

test('flags unachieved beats', () => {
  const debts = buildPropagationLedger({
    foreshadow: emptyForeshadow,
    plotBeats: { beats: [{ chapterNumber: 7, plannedBeat: 'lật kèo', achieved: false }] },
  });
  assert.equal(debts.length, 1);
  assert.equal(debts[0].kind, 'unachieved_beat');
  assert.deepEqual(debts[0].chapters, [7]);
});

test('flags late hard facts but ignores early or soft ones', () => {
  const debts = buildPropagationLedger({
    foreshadow: emptyForeshadow,
    plotBeats: { beats: [] },
    establishedFacts: [
      { chapterNumber: 2, fact: 'sớm', confidence: 'explicit' },
      { chapterNumber: 14, fact: 'bí mật muộn', confidence: 'explicit' },
      { chapterNumber: 13, fact: 'mơ hồ', confidence: 'inferred' },
    ],
    lateFactChapterThreshold: 12,
  });
  const late = debts.filter((d) => d.kind === 'late_fact');
  assert.equal(late.length, 1);
  assert.deepEqual(late[0].chapters, [14]);
});

test('late-fact default threshold scales with totalChapters and caps the count', () => {
  const facts = Array.from({ length: 10 }, (_, i) => ({ chapterNumber: 14, fact: `f${i}`, confidence: 'explicit' }));
  const debts = buildPropagationLedger({
    foreshadow: emptyForeshadow,
    plotBeats: { beats: [] },
    establishedFacts: [
      { chapterNumber: 12, fact: 'chương 12 không còn bị coi là muộn', confidence: 'explicit' },
      ...facts,
    ],
    totalChapters: 15,
  });
  const late = debts.filter((d) => d.kind === 'late_fact');
  // chapter 12 < threshold(14) excluded; ch14 facts capped at 5
  assert.equal(late.length, 5);
  assert.ok(late.every((d) => d.chapters[0] === 14));
});
