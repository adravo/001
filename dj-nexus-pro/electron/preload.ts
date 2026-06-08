/**
 * Preload script – runs in a privileged context with access to Node APIs but
 * exposes only a deliberately narrow surface to the renderer via contextBridge.
 * Every method validates its inputs before forwarding to the main process.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ─── Type definitions mirrored here so the renderer can import them ──────────

type IpcCallback<T = unknown> = (data: T) => void;
type UnsubscribeFn = () => void;

interface FsEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface FileStat {
  size: number;
  mtime: number;
  isDirectory: boolean;
}

interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Utility: typed listener helper ─────────────────────────────────────────

function listen<T>(channel: string, cb: IpcCallback<T>): UnsubscribeFn {
  const handler = (_event: IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

function listenOnce<T>(channel: string, cb: IpcCallback<T>): void {
  ipcRenderer.once(channel, (_event: IpcRendererEvent, data: T) => cb(data));
}

// ─── Validated channel allowlists ────────────────────────────────────────────

const INVOKE_CHANNELS = new Set([
  'fs:readFile',
  'fs:readDir',
  'fs:stat',
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:showError',
  'settings:get',
  'settings:set',
  'settings:getAll',
  'power:blockSleep',
  'power:unblockSleep',
  'app:getVersion',
  'app:getPlatform',
  'app:getUserDataPath',
  'theme:setNative',
  'shell:openExternal',
  'app:didCrashLastSession',
]);

const SEND_CHANNELS = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'updater:install',
]);

const RECEIVE_CHANNELS = new Set([
  'files:opened',
  'library:folder-opened',
  'recording:export',
  'updater:available',
  'updater:downloaded',
]);

// ─── Exposed API ─────────────────────────────────────────────────────────────

const electronAPI = {
  // File system
  fs: {
    readFile: (filePath: string): Promise<IpcResult<Buffer>> => {
      if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid filePath');
      return ipcRenderer.invoke('fs:readFile', filePath);
    },
    readDir: (dirPath: string): Promise<IpcResult<FsEntry[]>> => {
      if (typeof dirPath !== 'string' || !dirPath) throw new Error('Invalid dirPath');
      return ipcRenderer.invoke('fs:readDir', dirPath);
    },
    stat: (filePath: string): Promise<IpcResult<FileStat>> => {
      if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid filePath');
      return ipcRenderer.invoke('fs:stat', filePath);
    },
  },

  // Dialogs
  dialog: {
    openFile: (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> =>
      ipcRenderer.invoke('dialog:saveFile', options),
    showError: (title: string, content: string): Promise<void> =>
      ipcRenderer.invoke('dialog:showError', title, content),
  },

  // Persistent settings
  settings: {
    get: <T>(key: string): Promise<T> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value),
    getAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:getAll'),
  },

  // Power management
  power: {
    blockSleep: (): Promise<void> => ipcRenderer.invoke('power:blockSleep'),
    unblockSleep: (): Promise<void> => ipcRenderer.invoke('power:unblockSleep'),
  },

  // App meta
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getPlatform'),
    getUserDataPath: (): Promise<string> => ipcRenderer.invoke('app:getUserDataPath'),
    didCrashLastSession: (): Promise<boolean> => ipcRenderer.invoke('app:didCrashLastSession'),
  },

  // Theme
  theme: {
    setNative: (theme: 'dark' | 'light' | 'system'): Promise<void> =>
      ipcRenderer.invoke('theme:setNative', theme),
  },

  // Shell
  shell: {
    openExternal: (url: string): Promise<void> => {
      if (!/^https?:\/\//.test(url)) throw new Error('Only http/https URLs are allowed');
      return ipcRenderer.invoke('shell:openExternal', url);
    },
  },

  // Window controls (fire-and-forget)
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // Auto-updater
  updater: {
    install: () => ipcRenderer.send('updater:install'),
    onAvailable: (cb: IpcCallback<{ version: string }>) => listen('updater:available', cb),
    onDownloaded: (cb: IpcCallback<{ version: string }>) => listen('updater:downloaded', cb),
  },

  // Generic subscribe / unsubscribe (only whitelisted channels)
  on: <T>(channel: string, cb: IpcCallback<T>): UnsubscribeFn => {
    if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Channel not allowed: ${channel}`);
    return listen(channel, cb);
  },

  once: <T>(channel: string, cb: IpcCallback<T>): void => {
    if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Channel not allowed: ${channel}`);
    listenOnce(channel, cb);
  },

  // Low-level escape hatch – still channel-gated
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!INVOKE_CHANNELS.has(channel)) throw new Error(`Channel not allowed: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },

  send: (channel: string, ...args: unknown[]): void => {
    if (!SEND_CHANNELS.has(channel)) throw new Error(`Channel not allowed: ${channel}`);
    ipcRenderer.send(channel, ...args);
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);

// Export the type for use in renderer TypeScript
export type ElectronAPI = typeof electronAPI;
