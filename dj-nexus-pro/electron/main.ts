import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  powerSaveBlocker,
  shell,
  nativeTheme,
  screen,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

// ─── Logging ────────────────────────────────────────────────────────────────

log.transports.file.level = 'debug';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB rotation
autoUpdater.logger = log;

// ─── Persistent settings ────────────────────────────────────────────────────

interface AppSettings {
  windowBounds: { x: number; y: number; width: number; height: number };
  windowMaximized: boolean;
  audioBufferSize: number;
  audioSampleRate: number;
  audioOutputDevice: string;
  theme: 'dark' | 'light' | 'system';
  hardwareAcceleration: boolean;
}

const store = new Store<AppSettings>({
  defaults: {
    windowBounds: { x: 0, y: 0, width: 1600, height: 900 },
    windowMaximized: false,
    audioBufferSize: 512,
    audioSampleRate: 44100,
    audioOutputDevice: 'default',
    theme: 'dark',
    hardwareAcceleration: true,
  },
});

// ─── Globals ─────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let powerBlockerId: number | null = null;
const isDev = process.env.NODE_ENV === 'development';
const RENDERER_URL = 'http://localhost:5173';

// ─── Hardware acceleration ────────────────────────────────────────────────────

if (!store.get('hardwareAcceleration')) {
  app.disableHardwareAcceleration();
}

// ─── Crash recovery ─────────────────────────────────────────────────────────

const CRASH_SENTINEL = path.join(app.getPath('userData'), '.crash_sentinel');

function didCrashLastSession(): boolean {
  return fs.existsSync(CRASH_SENTINEL);
}

function markSessionStart(): void {
  fs.writeFileSync(CRASH_SENTINEL, Date.now().toString(), 'utf8');
}

function markSessionEnd(): void {
  if (fs.existsSync(CRASH_SENTINEL)) {
    fs.unlinkSync(CRASH_SENTINEL);
  }
}

// ─── Window creation ─────────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const bounds = store.get('windowBounds');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  // Guard against stored bounds outside current display geometry
  const x = Math.min(Math.max(bounds.x, 0), screenW - 100);
  const y = Math.min(Math.max(bounds.y, 0), screenH - 100);

  const win = new BrowserWindow({
    x,
    y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0a0a0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    frame: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for better-sqlite3 via preload
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false, // avoid white flash; show after ready-to-show
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
  });

  if (store.get('windowMaximized')) {
    win.maximize();
  }

  // Persist window position/size on every move/resize
  const persistBounds = () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      store.set('windowBounds', win.getBounds());
    }
    store.set('windowMaximized', win.isMaximized());
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // Intercept navigation to prevent leaving the app shell
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(isDev ? RENDERER_URL : 'file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Capture renderer crashes for diagnostics
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details);
    dialog.showMessageBoxSync(win, {
      type: 'error',
      title: 'DJ Nexus Pro – Renderer Crash',
      message: `The audio renderer crashed (${details.reason}). The app will attempt to reload.`,
    });
    win.reload();
  });

  if (isDev) {
    win.loadURL(RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  return win;
}

// ─── System tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '../../assets/icons/tray.png');
  if (!fs.existsSync(iconPath)) return;

  tray = new Tray(iconPath);
  tray.setToolTip('DJ Nexus Pro');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show DJ Nexus Pro', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('double-click', () => mainWindow?.show());
}

// ─── Application menu ────────────────────────────────────────────────────────

function buildApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Audio Files…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'aiff', 'aac', 'ogg', 'm4a', 'opus'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!result.canceled) {
              mainWindow?.webContents.send('files:opened', result.filePaths);
            }
          },
        },
        {
          label: 'Open Library Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory'],
            });
            if (!result.canceled) {
              mainWindow?.webContents.send('library:folder-opened', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Export Mix Recording…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('recording:export'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // File system operations
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const buffer = await fs.promises.readFile(filePath);
      return { ok: true, data: buffer };
    } catch (err) {
      log.error('fs:readFile error', err);
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return {
        ok: true,
        data: entries.map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(dirPath, e.name),
        })),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const stat = await fs.promises.stat(filePath);
      return { ok: true, data: { size: stat.size, mtime: stat.mtime.getTime(), isDirectory: stat.isDirectory() } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // Dialog helpers
  ipcMain.handle('dialog:openFile', async (_event, options: Electron.OpenDialogOptions) => {
    const win = mainWindow!;
    return dialog.showOpenDialog(win, options);
  });

  ipcMain.handle('dialog:saveFile', async (_event, options: Electron.SaveDialogOptions) => {
    const win = mainWindow!;
    return dialog.showSaveDialog(win, options);
  });

  ipcMain.handle('dialog:showError', (_event, title: string, content: string) => {
    dialog.showErrorBox(title, content);
  });

  // App settings (forwarded from renderer)
  ipcMain.handle('settings:get', (_event, key: keyof AppSettings) => store.get(key));
  ipcMain.handle('settings:set', (_event, key: keyof AppSettings, value: AppSettings[typeof key]) => {
    store.set(key, value);
  });
  ipcMain.handle('settings:getAll', () => store.store);

  // Power management – block sleep during active playback
  ipcMain.handle('power:blockSleep', () => {
    if (powerBlockerId === null) {
      powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      log.info('Power save blocker started, id:', powerBlockerId);
    }
  });

  ipcMain.handle('power:unblockSleep', () => {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
      powerBlockerId = null;
      log.info('Power save blocker stopped');
    }
  });

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));

  // Theme sync
  ipcMain.handle('theme:setNative', (_event, theme: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = theme;
  });

  // Open external links safely
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    const allowed = /^https?:\/\//.test(url);
    if (allowed) shell.openExternal(url);
  });

  // Crash recovery info
  ipcMain.handle('app:didCrashLastSession', () => didCrashLastSession());

  // Reload / window control
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
}

// ─── Auto-updater ────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow?.webContents.send('updater:available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    mainWindow?.webContents.send('updater:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('AutoUpdater error:', err);
  });

  ipcMain.on('updater:install', () => {
    autoUpdater.quitAndInstall();
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
  if (didCrashLastSession()) {
    log.warn('Previous session crashed; showing recovery dialog');
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'DJ Nexus Pro – Crash Recovery',
      message:
        'The previous session ended unexpectedly.\n\nWould you like to restore your last session state, or start fresh?',
      buttons: ['Restore Session', 'Start Fresh'],
      defaultId: 0,
    });
    // Renderer reads this flag via IPC and decides which state snapshot to load
    app.commandLine.appendSwitch('--restore-session', choice === 0 ? '1' : '0');
  }

  markSessionStart();
  buildApplicationMenu();
  registerIpcHandlers();
  setupAutoUpdater();

  mainWindow = createMainWindow();
  createTray();
});

app.on('window-all-closed', () => {
  markSessionEnd();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('before-quit', () => {
  markSessionEnd();
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
});

// Guard against multiple app instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _argv, _workingDir) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
