import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveDesktopConfigRoot } from "../../src/electron/runtime-roots";

test("resolveDesktopConfigRoot uses portable executable directory instead of the temp unpacked app path", () => {
  const root = resolveDesktopConfigRoot({
    dirname: "C:\\Users\\mrdee\\AppData\\Local\\Temp\\Drama15Portable\\resources\\app.asar\\dist\\electron",
    execPath: "C:\\Users\\mrdee\\AppData\\Local\\Temp\\Drama15Portable\\Drama15 Lite Studio.exe",
    isDefaultApp: false,
    env: {
      PORTABLE_EXECUTABLE_DIR: "D:\\CODEEEEE\\ZZZ\\release\\gui",
      PORTABLE_EXECUTABLE_FILE: "D:\\CODEEEEE\\ZZZ\\release\\gui\\Drama15-Lite-Studio-0.1.0-x64.exe",
    },
  });

  assert.equal(root, path.resolve("D:\\CODEEEEE\\ZZZ\\release\\gui"));
});

test("resolveDesktopConfigRoot keeps explicit DRAMA15_APP_ROOT first", () => {
  const root = resolveDesktopConfigRoot({
    dirname: "D:\\CODEEEEE\\ZZZ\\dist\\electron",
    execPath: "C:\\Users\\mrdee\\AppData\\Local\\Temp\\Drama15Portable\\Drama15 Lite Studio.exe",
    isDefaultApp: false,
    env: {
      DRAMA15_APP_ROOT: "D:\\custom-config-root",
      PORTABLE_EXECUTABLE_DIR: "D:\\CODEEEEE\\ZZZ\\release\\gui",
    },
  });

  assert.equal(root, path.resolve("D:\\custom-config-root"));
});

test("resolveDesktopConfigRoot keeps development root for electron default app", () => {
  const root = resolveDesktopConfigRoot({
    dirname: "D:\\CODEEEEE\\ZZZ\\dist\\electron",
    execPath: "D:\\CODEEEEE\\ZZZ\\node_modules\\electron\\dist\\electron.exe",
    isDefaultApp: true,
    env: {},
  });

  assert.equal(root, path.resolve("D:\\CODEEEEE\\ZZZ"));
});
