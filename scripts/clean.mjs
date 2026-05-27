import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const removeDependencies = process.argv.includes("--deps");

const generatedDirectories = [
  "dist",
  "release",
];

for (const relativePath of generatedDirectories) {
  removeInsideWorkspace(relativePath);
}

cleanOutputs();

if (removeDependencies) {
  removeInsideWorkspace("node_modules");
}

function cleanOutputs() {
  const outputDirectory = path.join(root, "outputs");
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  for (const entry of fs.readdirSync(outputDirectory)) {
    if (entry === ".gitkeep") {
      continue;
    }

    removeInsideWorkspace(path.join("outputs", entry));
  }

  const gitkeepPath = path.join(outputDirectory, ".gitkeep");
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, "\n");
  }
}

function removeInsideWorkspace(relativePath) {
  const targetPath = path.resolve(root, relativePath);
  if (targetPath !== root && targetPath.startsWith(`${root}${path.sep}`)) {
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
