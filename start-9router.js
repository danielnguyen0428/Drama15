#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const NINE_ROUTER_DIR = path.join(process.env.APPDATA, '9router');
const SERVER_JS = path.join(NINE_ROUTER_DIR, 'runtime', 'server.js');

const child = spawn('node', [SERVER_JS], {
  cwd: NINE_ROUTER_DIR,
  stdio: 'inherit',
  env: { ...process.env, PORT: '20128' }
});

child.on('close', (code) => {
  console.log('9router exited with code:', code);
  process.exit(code);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    child.kill(signal);
  });
});
