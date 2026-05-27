import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalProsePolishConfig,
  renderProsePolishInstructions,
  shouldRunProsePostProcess,
} from "../../src/modules/presets/prose-polish-config";

test("local prose polish config enables light humanizer rules for generated prose", () => {
  const config = getLocalProsePolishConfig();

  assert.equal(config.mode, "light");
  assert.equal(config.applyTo.settingSeed, true);
  assert.equal(config.applyTo.concept, true);
  assert.equal(config.applyTo.chapter, true);
  assert.equal(config.applyTo.regenerate, true);
  assert.equal(config.postProcess.enabled, true);
  assert.equal(config.postProcess.applyTo.settingSeed, true);
  assert.equal(config.postProcess.applyTo.concept, false);
  assert.equal(config.postProcess.applyTo.chapter, true);
  assert.equal(config.postProcess.applyTo.regenerate, true);
  assert.ok(config.rules.removeAiTells.length >= 8);
  assert.ok(config.rules.preserve.length >= 5);
});

test("renderProsePolishInstructions turns local humanizer config into prompt-safe rules", () => {
  const instructions = renderProsePolishInstructions(getLocalProsePolishConfig(), "chapter", "english");

  assert.match(instructions, /Humanizer \/ prose polish pass/);
  assert.match(instructions, /Preserve plot facts, character names, chapter number, continuity/);
  assert.match(instructions, /inflated significance/i);
  assert.match(instructions, /forced rule-of-three/i);
  assert.match(instructions, /em dash overuse/i);
  assert.match(instructions, /Do not add new plot beats/i);
});

test("renderProsePolishInstructions returns nothing when mode or target disables it", () => {
  const config = getLocalProsePolishConfig();

  assert.equal(renderProsePolishInstructions({ ...config, mode: "off" }, "chapter", "english"), "");
  assert.equal(
    renderProsePolishInstructions(
      {
        ...config,
        applyTo: {
          ...config.applyTo,
          chapter: false,
        },
      },
      "chapter",
      "english",
    ),
    "",
  );
});

test("shouldRunProsePostProcess follows mode and per-target post-process switches", () => {
  const config = getLocalProsePolishConfig();

  assert.equal(shouldRunProsePostProcess(config, "chapter"), true);
  assert.equal(shouldRunProsePostProcess(config, "concept"), false);
  assert.equal(shouldRunProsePostProcess({ ...config, mode: "off" }, "chapter"), false);
  assert.equal(
    shouldRunProsePostProcess(
      {
        ...config,
        postProcess: {
          ...config.postProcess,
          enabled: false,
        },
      },
      "chapter",
    ),
    false,
  );
});

test("getLocalProsePolishConfig returns a defensive copy", () => {
  const first = getLocalProsePolishConfig();
  first.mode = "strong";
  first.applyTo.chapter = false;
  first.postProcess.applyTo.chapter = false;
  first.rules.removeAiTells.length = 0;

  const second = getLocalProsePolishConfig();
  assert.equal(second.mode, "light");
  assert.equal(second.applyTo.chapter, true);
  assert.equal(second.postProcess.applyTo.chapter, true);
  assert.ok(second.rules.removeAiTells.length >= 8);
});
