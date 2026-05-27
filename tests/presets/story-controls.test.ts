import assert from "node:assert/strict";
import test from "node:test";

import { getLocalStoryControls, NICHE_STORY_CONTROLS } from "../../src/modules/presets/story-controls";

test("local story controls expose every bundled desktop niche", () => {
  assert.equal(Object.keys(NICHE_STORY_CONTROLS).length, 12);

  for (const [nicheId, controls] of Object.entries(NICHE_STORY_CONTROLS)) {
    assert.equal(typeof nicheId, "string");
    assert.ok(controls.betrayalType.length > 0);
    assert.ok(controls.shameType.length > 0);
    assert.ok(controls.revengeMode.length > 0);
    assert.ok(controls.endingMode.length > 0);
  }
});

test("local story controls keep niche-specific creative boundaries", () => {
  const billionaire = JSON.stringify(NICHE_STORY_CONTROLS.billionaire_rich_poor_romance);
  const workplace = JSON.stringify(NICHE_STORY_CONTROLS.workplace_ceo_power_struggle);
  const medical = JSON.stringify(NICHE_STORY_CONTROLS.medical_hidden_doctor_life_care);
  const school = JSON.stringify(NICHE_STORY_CONTROLS.school_campus_bullying_identity);
  const werewolf = JSON.stringify(NICHE_STORY_CONTROLS.werewolf_luna_alpha_soulmate);
  const alien = JSON.stringify(NICHE_STORY_CONTROLS.steamy_alien_captive_romance);

  assert.match(billionaire, /rich family hates her|publicly chooses her|service entrance/i);
  assert.doesNotMatch(billionaire, /pregnant secretary|paper marriage/i);
  assert.match(workplace, /contract wife|pregnant secretary|female billionaire/i);
  assert.match(medical, /triage|patient|doctor/i);
  assert.match(school, /scholarship|campus|bully/i);
  assert.match(werewolf, /werewolf|Luna|Alpha soulmate|second chance/i);
  assert.match(alien, /alien captive|dominant|sensual|consent/i);
});

test("getLocalStoryControls returns a defensive copy for desktop init payloads", () => {
  const first = getLocalStoryControls();
  first.billionaire_rich_poor_romance.betrayalType[0]!.prompt = "mutated";

  const second = getLocalStoryControls();
  assert.notEqual(second.billionaire_rich_poor_romance.betrayalType[0]!.prompt, "mutated");
});
