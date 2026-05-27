import test from "node:test";
import assert from "node:assert/strict";

import { loadDrama15SystemPrompt } from "../../src/modules/prompts/system-prompt-loader";

test("loadDrama15SystemPrompt returns the system prompt body without markdown headings", () => {
  const prompt = loadDrama15SystemPrompt();

  assert.match(prompt, /You are a specialized fiction-generation engine/);
  assert.match(prompt, /Billionaire \/ Rich-Poor Romance/);
  assert.match(prompt, /Humiliation To Revenge \/ Justice/);
  assert.match(prompt, /Emotion must be shown through behavior, action, silence, and concrete scene detail/);
  assert.match(prompt, /Default POV: close third person anchored to the protagonist/);
  assert.match(prompt, /No omniscient motive explanation and no head-hopping within a scene/);
  assert.match(prompt, /No single quoted speech turn may exceed 80 words/);
  assert.match(prompt, /Banned empty drama phrases/);
  assert.match(prompt, /Prompt-template chapter locks remain active/);
  assert.match(prompt, /Chapter 6: activate the chapter 2 foreshadow detail; do not confront; end without dialogue/);
  assert.match(prompt, /Chapter 11: highest-dialogue confrontation; every line carries subtext, threat, status, or denial/);
  assert.doesNotMatch(prompt, /^#\s/m);
  assert.doesNotMatch(prompt, /^##\sSYSTEM PROMPT/m);
});
