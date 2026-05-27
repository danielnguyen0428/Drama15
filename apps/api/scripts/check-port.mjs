#!/usr/bin/env node
import net from 'node:net';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

const tester = net.createServer();

tester.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n[check-port] ${HOST}:${PORT} is already in use.`);
    console.error('[check-port] Stop the other API process first.\n');
    process.exit(1);
  }

  console.error('[check-port] unexpected error:', error);
  process.exit(1);
});

tester.once('listening', () => {
  tester.close(() => process.exit(0));
});

tester.listen(PORT, HOST);
