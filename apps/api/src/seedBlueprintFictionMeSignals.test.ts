import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSeedBlueprint,
  getFictionMeSeedBankDiagnostics,
} from '../../../src/modules/prompts/seed-blueprint.js';

test('FictionMe structural signals are merged into the workplace seed blueprint bank', () => {
  const diagnostics = getFictionMeSeedBankDiagnostics();
  const workplace = diagnostics.find((entry) => entry.linePreset === 'workplace_ceo_power_struggle');

  assert.ok(workplace, 'workplace niche should have FictionMe structural diagnostics');
  assert.ok(workplace.sourceEntryCount > 0, 'workplace niche should receive source entries');
  assert.ok(workplace.motifFamilyCount > 0, 'workplace niche should receive motif atoms');
  assert.ok(workplace.revealMechanismCount > 0, 'workplace niche should receive reveal atoms');
});

test('seed blueprint can select FictionMe-derived atoms without copying source titles', () => {
  const blueprint = createSeedBlueprint({
    linePreset: 'workplace_ceo_power_struggle',
    random: () => 0.999_999,
    maxAttempts: 1,
  });

  assert.match(blueprint.motifFamily, /market-tested/i);
  assert.match(blueprint.revealMechanism, /market-tested/i);
  assert.doesNotMatch(JSON.stringify(blueprint), /Sold to the Heartless CEO|Auctioned for the Billionaire/i);
});
