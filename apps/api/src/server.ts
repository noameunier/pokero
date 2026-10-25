import 'dotenv/config';
import { buildApp } from './app.ts';
import { getEnv } from './config/env.ts';
import { disconnectPrisma } from './db/prisma.ts';
import { attachRealtime, startScheduler } from './realtime.ts';

const env = getEnv();
const app = await buildApp();

await app.listen({ port: env.PORT, host: env.HOST });

const io = attachRealtime(app, app.server);
const stopScheduler = startScheduler(app);

app.log.info(
  { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
  'Pokero API démarrée',
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Arrêt en cours');
  stopScheduler();
  io.close();
  try {
    await app.close();
    await disconnectPrisma();
  } catch (error) {
    app.log.error({ err: error }, 'Erreur pendant l’arrêt');
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'Promesse rejetée non gérée');
});
