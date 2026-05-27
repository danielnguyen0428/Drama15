import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SeedHistoryStore } from "../../src/modules/session/seed-history-store";

test("SeedHistoryStore prepends entries, deduplicates fingerprints, and caps retained history", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-seed-history-"));
  const store = new SeedHistoryStore({
    configRoot,
    maxEntries: 2,
  });

  await store.append({
    fingerprint: "first",
    linePreset: "billionaire_rich_poor_romance",
    titleHint: "First Title",
    createdAt: "2026-05-02T00:00:00.000Z",
  });
  await store.append({
    fingerprint: "second",
    linePreset: "toxic_family_betrayal",
    titleHint: "Second Title",
    createdAt: "2026-05-02T00:01:00.000Z",
  });
  await store.append({
    fingerprint: "first",
    linePreset: "billionaire_rich_poor_romance",
    titleHint: "First Title Updated",
    createdAt: "2026-05-02T00:02:00.000Z",
  });

  const history = await store.load();
  assert.deepEqual(
    history.map((entry) => entry.fingerprint),
    ["first", "second"],
  );
  assert.equal(history[0]?.titleHint, "First Title Updated");
});
