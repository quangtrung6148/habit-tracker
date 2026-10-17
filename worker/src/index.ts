import { loadConfig } from './config.js';
import { runWorker } from './runner.js';

const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Only --once is supported');
  const config = loadConfig(process.env);
  await runWorker(config, controller.signal, process.argv.includes('--once'));
} catch (error) {
  // Config messages contain variable names, never their values.
  console.error(JSON.stringify({ event: 'worker_exit', message: error instanceof Error ? error.message : 'Worker failed' }));
  process.exitCode = 1;
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
}
