import path from "node:path";

export type DesktopRuntimeRootOptions = {
  dirname: string;
  env?: NodeJS.ProcessEnv;
  execPath: string;
  isDefaultApp: boolean;
};

export type ConfigureDesktopRuntimeRootOptions = DesktopRuntimeRootOptions & {
  isElectronRuntime: boolean;
};

export function resolveDesktopConfigRoot(options: DesktopRuntimeRootOptions) {
  const env = options.env ?? process.env;

  if (env.DRAMA15_APP_ROOT) {
    return path.resolve(env.DRAMA15_APP_ROOT);
  }

  if (options.isDefaultApp) {
    return path.resolve(options.dirname, "..", "..");
  }

  const portableExecutableDir = env.PORTABLE_EXECUTABLE_DIR?.trim();
  if (portableExecutableDir) {
    return path.resolve(portableExecutableDir);
  }

  const portableExecutableFile = env.PORTABLE_EXECUTABLE_FILE?.trim();
  if (portableExecutableFile) {
    return path.dirname(path.resolve(portableExecutableFile));
  }

  return path.dirname(options.execPath);
}

export function configureDesktopRuntimeRoots(options: ConfigureDesktopRuntimeRootOptions) {
  if (!options.isElectronRuntime) {
    return;
  }

  const env = options.env ?? process.env;
  if (!env.DRAMA15_APP_ROOT) {
    env.DRAMA15_APP_ROOT = resolveDesktopConfigRoot({
      dirname: options.dirname,
      env,
      execPath: options.execPath,
      isDefaultApp: options.isDefaultApp,
    });
  }
}
