import path from "node:path";

type SeaModule = {
  isSea(): boolean;
  getAsset(key: string, encoding?: BufferEncoding): string | ArrayBuffer;
};

function loadSeaModule(): SeaModule | null {
  try {
    return require("node:sea") as SeaModule;
  } catch {
    return null;
  }
}

const seaModule = loadSeaModule();

export const isSeaRuntime = seaModule?.isSea?.() ?? false;

export function getConfigRoot() {
  if (process.env.DRAMA15_APP_ROOT) {
    return path.resolve(process.env.DRAMA15_APP_ROOT);
  }

  return isSeaRuntime ? path.dirname(process.execPath) : process.cwd();
}

export function getAssetRoot() {
  if (process.env.DRAMA15_ASSET_ROOT) {
    return path.resolve(process.env.DRAMA15_ASSET_ROOT);
  }

  return isSeaRuntime ? path.dirname(process.execPath) : process.cwd();
}

export function getAppRoot() {
  return getConfigRoot();
}

export function resolveAssetPath(...segments: string[]) {
  return path.resolve(getAssetRoot(), ...segments);
}

export function getEmbeddedTextAsset(assetKey: string) {
  if (!isSeaRuntime || !seaModule) {
    return null;
  }

  try {
    const asset = seaModule.getAsset(assetKey, "utf8");
    if (typeof asset === "string") {
      return asset;
    }

    return Buffer.from(asset).toString("utf8");
  } catch {
    return null;
  }
}
