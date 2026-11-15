import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverConfig } from './server/config.ts';
import { logEvent, requestLoggerMiddleware } from './server/logger.ts';
import { errorHandlerMiddleware } from './server/middleware/errorHandler.ts';
import { createApiRouter } from './server/routes/api.ts';
import { startServerScheduler } from './server/services/schedulerService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLoggerMiddleware);

  app.use('/api', createApiRouter());
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.', code: 'NOT_FOUND' });
  });

  if (!serverConfig.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.use(errorHandlerMiddleware);

  app.listen(serverConfig.port, '0.0.0.0', () => {
    logEvent('info', 'server_listening', {
      meta: {
        port: serverConfig.port,
        production: serverConfig.isProduction,
        aiConfigured: Boolean(serverConfig.geminiApiKey),
      },
    });
    startServerScheduler();
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
