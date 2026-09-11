import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { novelsRouter } from './routes/novels.js';
import { chaptersRouter } from './routes/chapters.js';
import { exportRouter } from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(
    express.static(publicDir, {
      // Evita que o navegador guarde HTML/JS/CSS em cache entre reinícios do
      // servidor — importante durante o desenvolvimento, quando os arquivos
      // mudam com frequência e um cache desatualizado gera bugs "fantasmas".
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
      },
    }),
  );

  app.use('/api', novelsRouter);
  app.use('/api', chaptersRouter);
  app.use('/api', exportRouter);

  return app;
}
