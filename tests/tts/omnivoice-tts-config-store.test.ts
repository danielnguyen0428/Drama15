import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OmniVoiceTtsConfigStore } from "../../src/modules/tts/omnivoice-tts-config-store";

test("OmniVoiceTtsConfigStore defaults to local OmniVoice API and story voice output directory", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });

  const config = await store.load();

  assert.equal(config.apiBase, "http://127.0.0.1:8001");
  assert.equal(config.selectedVoiceId, "");
  assert.equal(config.speed, 1);
  assert.equal(config.pitch, 0);
  assert.equal(config.outputRoot, path.join(configRoot, "outputs", "voice"));
});

test("OmniVoiceTtsConfigStore saves normalized settings without secret fields", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });
  const outputRoot = path.join(configRoot, "custom voice");

  const saved = await store.save({
    apiBase: " http://127.0.0.1:8001/ ",
    selectedVoiceId: " voice-main ",
    speed: 1.25,
    pitch: -5,
    outputRoot,
    ownerToken: "must-not-persist",
  } as Record<string, unknown>);
  const reloaded = await store.load();
  const raw = await fs.readFile(path.join(configRoot, "drama15-tts-config.json"), "utf8");

  assert.equal(saved.apiBase, "http://127.0.0.1:8001");
  assert.equal(saved.selectedVoiceId, "voice-main");
  assert.equal(saved.speed, 1.25);
  assert.equal(saved.pitch, -5);
  assert.equal(saved.outputRoot, path.resolve(outputRoot));
  assert.deepEqual(reloaded, saved);
  assert.doesNotMatch(raw, /ownerToken|admin|token|secret/i);
});

test("OmniVoiceTtsConfigStore clamps invalid speed and pitch to safe defaults", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });

  const config = await store.save({
    apiBase: "",
    speed: 9,
    pitch: -99,
  });

  assert.equal(config.apiBase, "http://127.0.0.1:8001");
  assert.equal(config.speed, 1);
  assert.equal(config.pitch, 0);
});
