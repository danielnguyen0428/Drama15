#!/usr/bin/env node
/**
 * Pre-flight port check.
 *
 * Bails out of `npm run dev` if port 3000 is already taken — typically
 * by PM2's `drama15-api`. Without this guard, `tsx watch` enters a
 * crash-loop on EADDRINUSE and on Windows each crash spawns a brief
 * console window, producing the "terminal flashes" the user reported.
 *
 * Exit codes:
 *   0  -> port is free, dev can start
 *   1  -> port is in use, prints which PID owns it and a hint
 */
import net from 'node:net';
import { execSync } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3000);

function findOwner(port) {
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
    const re = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'm');
    const m = out.match(re);
    if (!m) return null;
    return Number(m[1]);
  } catch {
    return null;
  }
}

const tester = net.createServer();
tester.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const pid = findOwner(PORT);
    console.error(`\n[check-port] Port ${PORT} is already in use.`);
    if (pid !== null) {
      console.error(`[check-port] Owner: PID ${pid}`);
    }
    console.error('[check-port] Likely culprit: PM2 is already running drama15-api.');
    console.error('[check-port] Fix: stop the other listener first');
    console.error('[check-port]   pm2 stop drama15-api');
    console.error('[check-port] or kill the orphan process:');
    console.error(`[check-port]   Stop-Process -Id ${pid ?? '<pid>'} -Force\n`);
    process.exit(1);
  }
  console.error('[check-port] unexpected error:', err);
  process.exit(1);
});
tester.once('listening', () => {
  tester.close(() => process.exit(0));
});
tester.listen(PORT, '0.0.0.0');
