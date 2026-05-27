import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderHtmlToPdfBuffer, type PdfWindowLike } from "../../src/electron/pdf-renderer";

async function makeTempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "drama15-pdf-renderer-test-"));
}

test("renderHtmlToPdfBuffer loads printable HTML from a temporary file instead of a data URL", async () => {
  const tempRoot = await makeTempRoot();
  const html = "<!doctype html><html><body><h1>Long story</h1></body></html>";
  let loadedFile = "";
  let destroyed = false;

  const pdf = await renderHtmlToPdfBuffer(html, {
    tempDirectory: tempRoot,
    createWindow: (): PdfWindowLike => ({
      async loadFile(filePath) {
        loadedFile = filePath;
        assert.equal(await fs.readFile(filePath, "utf8"), html);
      },
      webContents: {
        async printToPDF(options) {
          assert.equal(options.pageSize, "A4");
          assert.equal(options.printBackground, true);
          return Buffer.from("%PDF-temp-file");
        },
      },
      destroy() {
        destroyed = true;
      },
    }),
  });

  assert.equal(pdf.toString(), "%PDF-temp-file");
  assert.equal(path.extname(loadedFile), ".html");
  assert.equal(loadedFile.startsWith(tempRoot), true);
  assert.equal(destroyed, true);
  await assert.rejects(fs.stat(loadedFile));
});

test("renderHtmlToPdfBuffer retries once with a fresh print window when Electron reports Printing failed", async () => {
  const tempRoot = await makeTempRoot();
  let attempts = 0;
  let destroyCount = 0;

  const pdf = await renderHtmlToPdfBuffer("<!doctype html><p>Retry me</p>", {
    tempDirectory: tempRoot,
    createWindow: (): PdfWindowLike => ({
      async loadFile() {},
      webContents: {
        async printToPDF() {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("Printing failed");
          }
          return Buffer.from("%PDF-after-retry");
        },
      },
      destroy() {
        destroyCount += 1;
      },
    }),
  });

  assert.equal(pdf.toString(), "%PDF-after-retry");
  assert.equal(attempts, 2);
  assert.equal(destroyCount, 2);
});
