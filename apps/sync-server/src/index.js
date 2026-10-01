import { createSyncServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.SYNC_DB ?? 'sync-server.db';

const server = createSyncServer({
  port,
  dbPath,
  log: (...args) => console.warn('[sync]', ...args),
});
await server.ready;
console.warn(`[sync] listening on ws://localhost:${server.port} (store: ${dbPath})`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
