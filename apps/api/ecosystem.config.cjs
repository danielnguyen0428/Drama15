/**
 * PM2 ecosystem for the Drama15 API + Cloudflare Tunnel.
 *
 * IMPORTANT — Windows: every entry below must keep `windowsHide: true`
 * and avoid `cmd.exe` wrappers (`script: "cmd.exe", args: "/c ..."`).
 * Both rules together are what stops the brief black console flashes
 * the user reported. PM2 spawns child processes via `child_process.spawn`
 * with `windowsHide: false` by default; without the override, every
 * crash-loop or scheduled restart shows a ~1-frame console window.
 */

module.exports = {
  apps: [
    {
      name: 'drama15-api',
      // Run `tsx` directly through node (no `cmd.exe /c` wrapper). PM2's
      // built-in interpreter resolution would invoke `tsx.cmd` via a shell,
      // which reintroduces the visible console window. Pointing at the
      // ESM CLI script with `interpreter: 'node'` keeps the whole tree
      // headless.
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/startDev.ts',
      interpreter: 'node',
      // Disable `pm2 watch` — `tsx` already watches `src/**`. Doubling
      // the watcher caused EADDRINUSE crash-loops in the past, where
      // each loop's brief Node bootstrap was visible as a flash.
      watch: false,
      cwd: 'D:\\CODEEEEE\\ZZZ\\apps\\api',
      // Headless launch on Windows — no console window for any spawn
      // (initial start, restart-after-crash, manual `pm2 restart`).
      windowsHide: true,
      // Bound restart loop so a misconfiguration does not flash the
      // screen forever. After 50 fast restarts PM2 marks the app
      // `errored` and stops spawning.
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      // Keep stdout/stderr piped to PM2's log files (default). Don't
      // attach to a TTY — that path triggers the cmd window on Windows.
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'drama15-tunnel',
      // `cloudflared.exe` is a native binary; PM2 launches it with
      // `interpreter: 'none'`. Setting `windowsHide: true` keeps the
      // tunnel's own console pane suppressed — it logs to PM2 instead.
      script: 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      args: 'tunnel run drama15-api',
      interpreter: 'none',
      cwd: 'D:\\CODEEEEE\\ZZZ',
      watch: false,
      windowsHide: true,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
    },
  ],
};
