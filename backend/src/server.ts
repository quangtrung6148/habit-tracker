import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAuth, createSummaryRunner } from './repository.js';

const config = loadConfig();
const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const runSummaries = createSummaryRunner(config);
if (!runSummaries) log({ event: 'worker_disabled', reason: 'worker_credentials_missing' });
const server = createApp(config, { authenticate: createAuth(config), runSummaries, log }).listen(config.PORT, '0.0.0.0', () => log({ event: 'listening', port: config.PORT }));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.on('error', () => { log({ event: 'server_error' }); process.exitCode = 1; });
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  log({ event: 'shutdown' });
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
