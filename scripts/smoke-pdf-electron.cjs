const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { renderHtmlToPdfBuffer } = require("../dist/electron/pdf-renderer");

const paragraph = "This is a long printable paragraph for the Drama15 PDF smoke test. ".repeat(80);
const chapters = Array.from({ length: 10 }, (_, index) => `<section><h2>Chapter ${index + 1}</h2><p>${paragraph}</p></section>`).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:18mm 16mm}body{font-family:Georgia,serif;font-size:12pt;line-height:1.6}.chapter{break-before:page}</style></head><body><h1>PDF Smoke</h1>${chapters}</body></html>`;

app
  .whenReady()
  .then(async () => {
    const pdf = await renderHtmlToPdfBuffer(html, {
      tempDirectory: path.join(app.getPath("temp"), "drama15-pdf-smoke"),
      createWindow: () =>
        new BrowserWindow({
          show: false,
          width: 794,
          height: 1123,
          paintWhenInitiallyHidden: true,
          webPreferences: {
            sandbox: false,
          },
        }),
    });
    console.log(`PDF_SMOKE_BYTES=${pdf.length}`);
    if (pdf.length < 1000) {
      throw new Error(`PDF smoke output is unexpectedly small: ${pdf.length} bytes`);
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
