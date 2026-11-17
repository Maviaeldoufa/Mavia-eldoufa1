import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createApp } from './server/app.ts';
import { attachWebSocketHub } from './server/wsHub.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);

  attachWebSocketHub(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mafia platform server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
