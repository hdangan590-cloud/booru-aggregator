import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let backendProcess = null;
let mainWindow = null;

function startBackend() {
  // Путь к backend (в packaged app будет resources/backend)
  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.js')
    : path.join(__dirname, '..', 'backend', 'server.js');

  console.log('Starting backend:', backendPath);
  backendProcess = spawn(process.execPath, [backendPath], {
    env: { ...process.env, PORT: '3001' },
    cwd: path.dirname(backendPath),
    stdio: 'inherit'
  });
  backendProcess.on('error', (e) => console.error('Backend error', e));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0b0b12',
    title: 'Booru Aggregator — 18+ (238 тегов)',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Ждём пока бэкенд поднимется (1.5 сек) и грузим
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3001');
  }, 1500);

  // Внешние ссылки — в браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools по F12 в dev
  if (!app.isPackaged) {
    // mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
