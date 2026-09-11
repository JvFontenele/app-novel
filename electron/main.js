import { app, BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// O db.js lê DB_DIR no momento do import — precisa ser definido antes de
// importar createApp/closeBrowser (que puxam src/db.js na cadeia de imports).
// Em produção (app empacotado), usa o diretório de dados do usuário do SO
// (ex.: ~/.config/<app>/ no Linux) em vez do diretório de instalação, que
// normalmente é somente-leitura. Em desenvolvimento (`npm run electron:dev`),
// mantém o data/ do projeto para não duplicar o banco usado pelo modo web.
if (app.isPackaged) {
  process.env.DB_DIR = path.join(app.getPath('userData'), 'data');
}

const { createApp } = await import('../src/app.js');
const { closeBrowser } = await import('../src/scraper/index.js');

const PORT = 3000;
let mainWindow;
let server;

function startServer() {
  return new Promise((resolve, reject) => {
    const expressApp = createApp();
    server = expressApp.listen(PORT, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    title: 'Minhas Novels',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Remove a barra de menu padrão (File/Edit/View/Window) — o app não usa
// nenhum desses menus, e a tela de leitura fica mais limpa sem ela.
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    const detail =
      err.code === 'EADDRINUSE'
        ? `A porta ${PORT} já está em uso por outro processo (talvez outra instância do app, ou "npm start" rodando à parte). Feche o outro processo e abra o app de novo.`
        : err.message;
    dialog.showErrorBox('Não foi possível iniciar o servidor', detail);
    app.exit(1);
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let quitting = false;

app.on('before-quit', async (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();

  // Timeout de segurança: se fechar o Chromium do Playwright travar por
  // qualquer motivo, o app ainda assim fecha em vez de ficar preso para sempre.
  await Promise.race([closeBrowser(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (server) server.close();
  app.exit(0);
});
