import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AutomationConfigStore } from "../../src/modules/session/automation-config-store";

test("AutomationConfigStore defaults PDF output to config outputs directory", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-automation-config-"));
  const store = new AutomationConfigStore({ configRoot });

  const config = await store.load();

  assert.ok(path.isAbsolute(config.pdfOutputDirectory))
  assert.ok(config.pdfOutputDirectory.endsWith("automation-pdfs"));
});

test("AutomationConfigStore saves and reloads a normalized PDF output directory", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-automation-config-"));
  const store = new AutomationConfigStore({ configRoot });
  const customPath = path.join(configRoot, "my pdf exports");

  await store.save({
    pdfOutputDirectory: customPath,
  });
  const config = await store.load();

  assert.equal(config.pdfOutputDirectory, path.resolve(customPath));
});
