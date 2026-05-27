// Wrapper to run TypeScript files with tsx in PM2
// Usage: pm2 start startDev-wrapper.js --name drama15-api
const { spawn } = require('child_process');
const path = require('path');
const tsxPath = path.join(__dirname, '..', '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const scriptPath = path.join(__dirname, 'startDev.ts');

const child = spawn('node', [tsxPath, scriptPath], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('close', (code) => {
  process.exit(code);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    child.kill(signal);
  });
});
