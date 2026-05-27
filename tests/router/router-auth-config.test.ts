import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RouterAuthConfig,
  readNineRouterRuntimeConfig,
} from "../../src/modules/router/router-auth-config";

async function createNineRouterDirectory(db: unknown) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-9router-"));
  await fs.writeFile(path.join(directory, "db.json"), JSON.stringify(db), "utf8");
  return directory;
}

test("readNineRouterRuntimeConfig reads the active 9router API key and normalizes base URL", async () => {
  const directory = await createNineRouterDirectory({
    apiKeys: [
      {
        key: "inactive-key",
        isActive: false,
      },
      {
        key: "active-key",
        isActive: true,
      },
    ],
    settings: {
      mitmRouterBaseUrl: "http://localhost:20128",
    },
  });

  const config = await readNineRouterRuntimeConfig(directory);

  assert.equal(config.apiKey, "active-key");
  assert.equal(config.baseUrl, "http://localhost:20128/v1");
  assert.equal(config.directoryPath, directory);
});

test("RouterAuthConfig persists the 9router directory and never exposes API keys in snapshots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-config-"));
  const directory = await createNineRouterDirectory({
    apiKeys: [
      {
        key: "secret-9router-key",
        isActive: true,
      },
    ],
    settings: {
      mitmRouterBaseUrl: "http://127.0.0.1:20128/v1",
    },
  });
  const authConfig = new RouterAuthConfig({
    configRoot: root,
    envApiKey: "env-key",
    envBaseUrl: "http://env-router/v1",
    defaultNineRouterDirectory: null,
  });

  const savedSnapshot = await authConfig.saveNineRouterDirectory(directory);
  const runtimeConfig = await authConfig.resolveRuntimeConfig();
  const reloadedSnapshot = await authConfig.getPublicSnapshot();

  assert.equal(savedSnapshot.status, "connected");
  assert.equal(savedSnapshot.directoryPath, directory);
  assert.equal(savedSnapshot.baseUrl, "http://127.0.0.1:20128/v1");
  assert.equal(savedSnapshot.hasApiKey, true);
  assert.equal(runtimeConfig.apiKey, "secret-9router-key");
  assert.equal(runtimeConfig.baseUrl, "http://127.0.0.1:20128/v1");
  assert.equal(reloadedSnapshot.directoryPath, directory);
  assert.equal(JSON.stringify(reloadedSnapshot).includes("secret-9router-key"), false);
});

test("RouterAuthConfig falls back to env auth only when no 9router directory is configured", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-config-"));
  const authConfig = new RouterAuthConfig({
    configRoot: root,
    envApiKey: "env-key",
    envBaseUrl: "http://env-router/v1",
    defaultNineRouterDirectory: null,
  });

  const snapshot = await authConfig.getPublicSnapshot();
  const runtimeConfig = await authConfig.resolveRuntimeConfig();

  assert.equal(snapshot.status, "not_configured");
  assert.equal(snapshot.source, "env");
  assert.equal(snapshot.hasApiKey, true);
  assert.equal(runtimeConfig.apiKey, "env-key");
  assert.equal(runtimeConfig.baseUrl, "http://env-router/v1");
});

test("RouterAuthConfig auto-detects a valid default 9router directory before env fallback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-config-"));
  const directory = await createNineRouterDirectory({
    apiKeys: [
      {
        key: "auto-detected-key",
        isActive: true,
      },
    ],
    settings: {
      mitmRouterBaseUrl: "http://localhost:20128",
    },
  });
  const authConfig = new RouterAuthConfig({
    configRoot: root,
    envApiKey: "dummy",
    envBaseUrl: "http://env-router/v1",
    defaultNineRouterDirectory: directory,
  });

  const snapshot = await authConfig.getPublicSnapshot();
  const runtimeConfig = await authConfig.resolveRuntimeConfig();

  assert.equal(snapshot.status, "connected");
  assert.equal(snapshot.source, "9router");
  assert.equal(snapshot.directoryPath, directory);
  assert.equal(snapshot.hasApiKey, true);
  assert.equal(runtimeConfig.apiKey, "auto-detected-key");
  assert.equal(runtimeConfig.baseUrl, "http://localhost:20128/v1");
});
