// PM2 process manager config for Drama15.
// Keeps the API (port 3001) and web dev server (port 5174) always running:
// auto-restart on crash and auto-start after reboot (via `pm2 startup` + `pm2 save`).
//
// Usage:
//   pm2 start ecosystem.config.cjs   # start both
//   pm2 status                       # see state
//   pm2 logs                         # tail logs
//   pm2 restart all                  # restart both
//   pm2 stop all                     # stop both
module.exports = {
  apps: [
    {
      name: 'drama15-api',
      cwd: './apps/api',
      script: 'npm',
      args: 'run start',
      interpreter: 'none',
      env: {
        PORT: '3001',
        HOST: '127.0.0.1',
        // Point the app at the repo root so src/lib/env.ts loads the root .env
        // (the API process cwd is apps/api, which has no .env of its own).
        DRAMA15_APP_ROOT: __dirname,
        DRAMA15_ASSET_ROOT: __dirname,
      },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 2000,
      time: true,
    },
    {
      name: 'drama15-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run dev',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 2000,
      time: true,
    },
  ],
};
