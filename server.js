import { createApp } from './src/app.js';
import { closeBrowser } from './src/scraper/index.js';

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
