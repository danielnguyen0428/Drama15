import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveNicheSpine,
  renderNicheSpineForPrompt,
} from '../../../src/modules/prompts/niche-spine.js';

const CONFIGURED_NICHES = [
  'billionaire_rich_poor_romance',
  'humiliation_revenge_justice',
  'secret_identity_hidden_heiress',
  'toxic_family_betrayal',
  'cheating_ex_wedding_drama',
  'single_mom_poor_woman_comeback',
  'social_injustice_discrimination_drama',
  'workplace_ceo_power_struggle',
  'medical_hidden_doctor_life_care',
  'school_campus_bullying_identity',
  'werewolf_luna_alpha_soulmate',
  'steamy_alien_captive_romance',
];

test('every configured niche resolves to a distinct spine (no shared skeleton)', () => {
  const pressureEngines = new Set<string>();
  const reversalEngines = new Set<string>();

  for (const niche of CONFIGURED_NICHES) {
    const spine = resolveNicheSpine(niche);
    assert.ok(spine.coreEngine.length > 0, `${niche} coreEngine`);
    assert.ok(spine.pressureEngine.length > 0, `${niche} pressureEngine`);
    pressureEngines.add(spine.pressureEngine);
    reversalEngines.add(spine.reversalEngine);
  }

  // The whole point of the fix: niches must not share the same
  // betrayal→shame→revenge skeleton. Each pressure/reversal engine is unique.
  assert.equal(pressureEngines.size, CONFIGURED_NICHES.length, 'pressure engines must all differ');
  assert.equal(reversalEngines.size, CONFIGURED_NICHES.length, 'reversal engines must all differ');
});

test('unknown niche falls back to a valid spine, never throws', () => {
  const spine = resolveNicheSpine('some_unmapped_niche');
  assert.ok(spine.coreEngine.length > 0);
  assert.ok(spine.pressureEngine.length > 0);
  assert.ok(spine.reversalEngine.length > 0);
});

test('rendered spine block reframes the fixed beats in niche terms', () => {
  const rendered = renderNicheSpineForPrompt(resolveNicheSpine('cheating_ex_wedding_drama'));
  assert.match(rendered, /Chapter 3 foreshadow:/);
  assert.match(rendered, /Chapter 7 reveal:/);
  assert.match(rendered, /Chapter 9 no-rescue nadir:/);
  assert.match(rendered, /Chapter 14 public reveal:/);
  // It explicitly instructs the model to replace the generic engines.
  assert.match(rendered, /instead of a generic/);
});

test('two different niches render materially different spine blocks', () => {
  const a = renderNicheSpineForPrompt(resolveNicheSpine('workplace_ceo_power_struggle'));
  const b = renderNicheSpineForPrompt(resolveNicheSpine('werewolf_luna_alpha_soulmate'));
  assert.notEqual(a, b);
});
