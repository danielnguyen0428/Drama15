import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type PdfPrintOptions = {
  pageSize: "A4";
  printBackground: boolean;
  margins: {
    marginType: "default";
  };
};

export type PdfWindowLike = {
  loadFile: (filePath: string) => Promise<unknown>;
  webContents: {
    printToPDF: (options: PdfPrintOptions) => Promise<Buffer | Uint8Array>;
  };
  destroy: () => void;
};

export type RenderHtmlToPdfBufferOptions = {
  createWindow: () => PdfWindowLike;
  tempDirectory?: string;
  maxAttempts?: number;
};

const PDF_PRINT_OPTIONS: PdfPrintOptions = {
  pageSize: "A4",
  printBackground: true,
  margins: {
    marginType: "default",
  },
};

export async function renderHtmlToPdfBuffer(html: string, options: RenderHtmlToPdfBufferOptions) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const tempRoot = options.tempDirectory || os.tmpdir();
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDirectory = await fs.mkdtemp(path.join(tempRoot, "drama15-pdf-"));
  const htmlFilePath = path.join(tempDirectory, "story.html");
  await fs.writeFile(htmlFilePath, html, "utf8");

  try {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const pdfWindow = options.createWindow();
      try {
        await pdfWindow.loadFile(htmlFilePath);
        const pdf = await pdfWindow.webContents.printToPDF(PDF_PRINT_OPTIONS);
        return Buffer.from(pdf);
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          throw new Error(`Failed to generate PDF after ${attempt} attempt(s): ${getErrorMessage(error)}`, {
            cause: error,
          });
        }
      } finally {
        pdfWindow.destroy();
      }
    }

    throw new Error(`Failed to generate PDF: ${getErrorMessage(lastError)}`);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
