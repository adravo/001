// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Plugin System (VST3 / AU / LV2 host)
//
// Architecture:
//   • PluginScanner  — finds plugin files on disk and extracts metadata.
//   • PluginHost     — loads plugins, manages instances and sandboxes.
//   • PluginInstance — runtime wrapper with parameter automation and GUI.
//
// Each plugin instance runs in an isolated Worker thread to prevent crashes
// in misbehaving native plugins from taking down the main process.
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ── Type definitions ──────────────────────────────────────────────────────────

export type PluginFormat = 'vst3' | 'au' | 'lv2' | 'vst2';

export interface PluginParameter {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  /** Normalised value 0.0 – 1.0 */
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  numSteps: number;
  isAutomatable: boolean;
  isDiscrete: boolean;
  category: string;
}

export interface PluginMetadata {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: PluginFormat;
  category: 'instrument' | 'effect' | 'analyzer' | 'other';
  filePath: string;
  /** Unix timestamp (ms) of file modification — used to detect stale cache */
  fileModifiedAt: number;
  numInputs: number;
  numOutputs: number;
  hasEditor: boolean;
  isSynth: boolean;
  parameters: PluginParameter[];
}

export interface PluginState {
  pluginId: string;
  instanceId: string;
  isEnabled: boolean;
  parameters: Record<string, number>;
  /** Opaque base64-encoded binary state blob (vendor-specific) */
  binaryState?: string;
}

export interface AutomationPoint {
  timeSeconds: number;
  value: number; // normalised 0.0 – 1.0
}

export interface AutomationLane {
  parameterId: string;
  points: AutomationPoint[];
  isActive: boolean;
}

// ── Plugin scanner ────────────────────────────────────────────────────────────

/** Platform-default plugin search paths */
function defaultSearchPaths(format: PluginFormat): string[] {
  const platform = process.platform;
  switch (format) {
    case 'vst3':
      if (platform === 'darwin') {
        return [
          '/Library/Audio/Plug-Ins/VST3',
          `${process.env.HOME}/Library/Audio/Plug-Ins/VST3`,
        ];
      }
      if (platform === 'win32') {
        return [
          'C:\\Program Files\\Common Files\\VST3',
          'C:\\Program Files (x86)\\Common Files\\VST3',
        ];
      }
      // Linux
      return [
        `${process.env.HOME}/.vst3`,
        '/usr/lib/vst3',
        '/usr/local/lib/vst3',
      ];

    case 'au':
      return [
        '/Library/Audio/Plug-Ins/Components',
        `${process.env.HOME}/Library/Audio/Plug-Ins/Components`,
      ];

    case 'lv2':
      return [
        `${process.env.HOME}/.lv2`,
        '/usr/lib/lv2',
        '/usr/local/lib/lv2',
      ];

    default:
      return [];
  }
}

/** File extensions associated with each format */
function pluginExtension(format: PluginFormat): string {
  switch (format) {
    case 'vst3':  return '.vst3';
    case 'au':    return '.component';
    case 'lv2':   return '.lv2';
    case 'vst2':  return '.so'; // Linux; .dll Win; .vst macOS
    default:      return '';
  }
}

export class PluginScanner extends EventEmitter {
  private cacheFile: string;
  private cache: Map<string, PluginMetadata> = new Map();

  constructor(cacheFile: string) {
    super();
    this.cacheFile = cacheFile;
    this.loadCache();
  }

  // ── Cache I/O ────────────────────────────────────────────────────────────

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const raw = fs.readFileSync(this.cacheFile, 'utf-8');
        const entries: PluginMetadata[] = JSON.parse(raw);
        entries.forEach(e => this.cache.set(e.filePath, e));
      }
    } catch {
      // Corrupt cache — start fresh
      this.cache.clear();
    }
  }

  private saveCache(): void {
    try {
      const entries = Array.from(this.cache.values());
      fs.writeFileSync(this.cacheFile, JSON.stringify(entries, null, 2), 'utf-8');
    } catch { /* non-fatal */ }
  }

  // ── Scanning ─────────────────────────────────────────────────────────────

  /**
   * Scan all default paths for the given formats.
   * Emits `progress` events: { scanned, total, current: filePath }
   * Returns an array of PluginMetadata.
   */
  async scanAll(
    formats: PluginFormat[] = ['vst3', 'au', 'lv2'],
    extraPaths: string[] = [],
  ): Promise<PluginMetadata[]> {
    const allPaths: string[] = [];
    for (const fmt of formats) {
      allPaths.push(...defaultSearchPaths(fmt), ...extraPaths);
    }

    const pluginFiles = await this.findPluginFiles(allPaths, formats);
    const total = pluginFiles.length;
    const results: PluginMetadata[] = [];

    for (let i = 0; i < pluginFiles.length; i++) {
      const { filePath, format } = pluginFiles[i];
      this.emit('progress', { scanned: i, total, current: filePath });

      try {
        const stat = fs.statSync(filePath);
        const cached = this.cache.get(filePath);
        if (cached && cached.fileModifiedAt === stat.mtimeMs) {
          results.push(cached);
          continue;
        }

        const meta = await this.extractMetadata(filePath, format);
        this.cache.set(filePath, meta);
        results.push(meta);
      } catch (err) {
        console.warn(`[PluginScanner] Failed to scan ${filePath}:`, err);
      }
    }

    this.saveCache();
    this.emit('progress', { scanned: total, total, current: null });
    return results;
  }

  private async findPluginFiles(
    searchPaths: string[],
    formats: PluginFormat[],
  ): Promise<{ filePath: string; format: PluginFormat }[]> {
    const results: { filePath: string; format: PluginFormat }[] = [];

    for (const dir of searchPaths) {
      if (!fs.existsSync(dir)) continue;
      this.walkDir(dir, formats, results);
    }

    return results;
  }

  private walkDir(
    dir: string,
    formats: PluginFormat[],
    results: { filePath: string; format: PluginFormat }[],
    depth = 0,
  ): void {
    if (depth > 6) return; // guard against symlink loops

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Check if this directory IS a plugin bundle
        for (const fmt of formats) {
          const ext = pluginExtension(fmt);
          if (full.endsWith(ext)) {
            results.push({ filePath: full, format: fmt });
            // Don't recurse into bundle
            break;
          }
        }
        // Recurse into regular dirs
        if (!formats.some(f => full.endsWith(pluginExtension(f)))) {
          this.walkDir(full, formats, results, depth + 1);
        }
      } else if (entry.isFile()) {
        for (const fmt of formats) {
          if (entry.name.endsWith(pluginExtension(fmt))) {
            results.push({ filePath: full, format: fmt });
          }
        }
      }
    }
  }

  /**
   * Extract metadata from a plugin file.
   * In a real implementation this would load the plugin binary (in a sandbox)
   * and call vendor-specific introspection APIs (VST3 IEditController,
   * LV2 lilv, etc.). Here we return a stub with the file info.
   */
  private async extractMetadata(
    filePath: string,
    format: PluginFormat,
  ): Promise<PluginMetadata> {
    const stat = fs.statSync(filePath);
    const baseName = path.basename(filePath, pluginExtension(format));

    // Stub metadata — replace with real plugin introspection
    return {
      id: uuidv4(),
      name: baseName,
      vendor: 'Unknown Vendor',
      version: '1.0.0',
      format,
      category: 'effect',
      filePath,
      fileModifiedAt: stat.mtimeMs,
      numInputs: 2,
      numOutputs: 2,
      hasEditor: true,
      isSynth: false,
      parameters: [],
    };
  }
}

// ── Plugin instance ───────────────────────────────────────────────────────────

type WorkerMessageType =
  | 'ready'
  | 'error'
  | 'parameterChanged'
  | 'stateLoaded'
  | 'stateSaved'
  | 'processingComplete';

interface WorkerMessage {
  type: WorkerMessageType;
  payload?: unknown;
}

export class PluginInstance extends EventEmitter {
  readonly instanceId: string;
  readonly metadata: PluginMetadata;

  private worker: Worker | null = null;
  private parameters: Map<string, number>;
  private automationLanes: Map<string, AutomationLane> = new Map();
  private isEnabled = true;
  private workerReady = false;

  constructor(metadata: PluginMetadata) {
    super();
    this.instanceId = uuidv4();
    this.metadata = metadata;
    this.parameters = new Map(
      metadata.parameters.map(p => [p.id, p.defaultValue]),
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Sandbox: each plugin instance runs in a dedicated Worker thread.
      // The worker script loads the native plugin binary and communicates
      // via message passing — a crash in the native plugin only kills the
      // worker, not the main process.
      this.worker = new Worker(
        path.join(__dirname, 'pluginWorker.js'),
        {
          workerData: {
            filePath: this.metadata.filePath,
            format:   this.metadata.format,
            instanceId: this.instanceId,
          },
          // Resource limits per plugin
          resourceLimits: {
            maxOldGenerationSizeMb: 512,
            maxYoungGenerationSizeMb: 64,
          },
        },
      );

      const timeout = setTimeout(() => {
        reject(new Error(`Plugin '${this.metadata.name}' load timeout`));
        this.worker?.terminate();
      }, 10_000);

      this.worker.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.workerReady = true;
          resolve();
        } else {
          this.handleWorkerMessage(msg);
        }
      });

      this.worker.on('error', err => {
        clearTimeout(timeout);
        this.emit('error', err);
        if (!this.workerReady) reject(err);
      });

      this.worker.on('exit', code => {
        this.workerReady = false;
        this.emit('exit', code);
      });
    });
  }

  async unload(): Promise<void> {
    this.workerReady = false;
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  // ── Parameter control ──────────────────────────────────────────────────────

  setParameter(parameterId: string, value: number): void {
    if (!this.metadata.parameters.find(p => p.id === parameterId)) {
      console.warn(`[PluginInstance] Unknown parameter: ${parameterId}`);
      return;
    }
    const clamped = Math.max(0, Math.min(1, value));
    this.parameters.set(parameterId, clamped);
    this.sendToWorker({ type: 'setParameter', parameterId, value: clamped });
    this.emit('parameterChanged', { parameterId, value: clamped });
  }

  getParameter(parameterId: string): number {
    return this.parameters.get(parameterId) ?? 0;
  }

  getAllParameters(): Record<string, number> {
    return Object.fromEntries(this.parameters.entries());
  }

  // ── Automation ─────────────────────────────────────────────────────────────

  setAutomationLane(lane: AutomationLane): void {
    this.automationLanes.set(lane.parameterId, lane);
  }

  removeAutomationLane(parameterId: string): void {
    this.automationLanes.delete(parameterId);
  }

  /**
   * Evaluate all active automation lanes at `timeSeconds` and apply values.
   * Called by the transport engine on each audio frame.
   */
  applyAutomation(timeSeconds: number): void {
    for (const lane of this.automationLanes.values()) {
      if (!lane.isActive || lane.points.length === 0) continue;
      const value = interpolateAutomation(lane.points, timeSeconds);
      this.setParameter(lane.parameterId, value);
    }
  }

  // ── State persistence ──────────────────────────────────────────────────────

  async saveState(): Promise<PluginState> {
    const binaryState = await this.requestWorker<string>('saveState');
    return {
      pluginId:    this.metadata.id,
      instanceId:  this.instanceId,
      isEnabled:   this.isEnabled,
      parameters:  this.getAllParameters(),
      binaryState,
    };
  }

  async loadState(state: PluginState): Promise<void> {
    for (const [id, value] of Object.entries(state.parameters)) {
      this.parameters.set(id, value);
    }
    this.isEnabled = state.isEnabled;
    if (state.binaryState) {
      await this.requestWorker('loadState', state.binaryState);
    } else {
      // Apply individual parameters
      for (const [id, value] of this.parameters.entries()) {
        this.sendToWorker({ type: 'setParameter', parameterId: id, value });
      }
    }
  }

  // ── Enable / bypass ────────────────────────────────────────────────────────

  enable(): void  { this.isEnabled = true;  this.sendToWorker({ type: 'bypass', bypass: false }); }
  disable(): void { this.isEnabled = false; this.sendToWorker({ type: 'bypass', bypass: true });  }
  toggle(): void  { this.isEnabled ? this.disable() : this.enable(); }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private sendToWorker(msg: Record<string, unknown>): void {
    if (this.worker && this.workerReady) {
      this.worker.postMessage(msg);
    }
  }

  private requestWorker<T>(type: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.workerReady) {
        reject(new Error('Plugin worker not ready'));
        return;
      }
      const requestId = uuidv4();
      const handler = (msg: WorkerMessage & { requestId?: string; result?: T; error?: string }) => {
        if (msg.requestId !== requestId) return;
        this.worker?.off('message', handler);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.result as T);
      };
      this.worker.on('message', handler);
      this.sendToWorker({ type, payload, requestId });

      setTimeout(() => {
        this.worker?.off('message', handler);
        reject(new Error(`Worker request '${type}' timed out`));
      }, 5_000);
    });
  }

  private handleWorkerMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'parameterChanged': {
        const { parameterId, value } = msg.payload as { parameterId: string; value: number };
        this.parameters.set(parameterId, value);
        this.emit('parameterChanged', { parameterId, value });
        break;
      }
      case 'error': {
        this.emit('error', new Error(String(msg.payload)));
        break;
      }
      default:
        this.emit(msg.type, msg.payload);
    }
  }
}

// ── Plugin host ───────────────────────────────────────────────────────────────

export class PluginHost extends EventEmitter {
  private scanner: PluginScanner;
  private instances: Map<string, PluginInstance> = new Map();
  private knownPlugins: Map<string, PluginMetadata> = new Map();

  constructor(cacheDir: string) {
    super();
    this.scanner = new PluginScanner(path.join(cacheDir, 'plugin-cache.json'));

    // Bubble scanner progress events
    this.scanner.on('progress', (p) => this.emit('scanProgress', p));
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  async scanPlugins(
    formats: PluginFormat[] = ['vst3', 'au', 'lv2'],
    extraPaths: string[] = [],
  ): Promise<PluginMetadata[]> {
    const plugins = await this.scanner.scanAll(formats, extraPaths);
    plugins.forEach(p => this.knownPlugins.set(p.id, p));
    this.emit('pluginsUpdated', plugins);
    return plugins;
  }

  getKnownPlugins(): PluginMetadata[] {
    return Array.from(this.knownPlugins.values());
  }

  findPlugin(id: string): PluginMetadata | undefined {
    return this.knownPlugins.get(id);
  }

  // ── Instance management ────────────────────────────────────────────────────

  async createInstance(pluginId: string): Promise<PluginInstance> {
    const meta = this.knownPlugins.get(pluginId);
    if (!meta) throw new Error(`Plugin not found: ${pluginId}`);

    const instance = new PluginInstance(meta);
    await instance.load();

    this.instances.set(instance.instanceId, instance);
    instance.on('exit', () => this.instances.delete(instance.instanceId));
    this.emit('instanceCreated', instance);
    return instance;
  }

  async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    await instance.unload();
    this.instances.delete(instanceId);
    this.emit('instanceDestroyed', instanceId);
  }

  getInstance(instanceId: string): PluginInstance | undefined {
    return this.instances.get(instanceId);
  }

  getAllInstances(): PluginInstance[] {
    return Array.from(this.instances.values());
  }

  async destroyAll(): Promise<void> {
    await Promise.all(
      Array.from(this.instances.keys()).map(id => this.destroyInstance(id)),
    );
  }

  // ── State persistence ──────────────────────────────────────────────────────

  async saveAllStates(): Promise<PluginState[]> {
    return Promise.all(
      Array.from(this.instances.values()).map(i => i.saveState()),
    );
  }

  async restoreStates(states: PluginState[]): Promise<void> {
    for (const state of states) {
      const meta = this.knownPlugins.get(state.pluginId);
      if (!meta) {
        console.warn(`[PluginHost] Cannot restore state for unknown plugin: ${state.pluginId}`);
        continue;
      }
      const instance = new PluginInstance(meta);
      await instance.load();
      await instance.loadState(state);
      this.instances.set(instance.instanceId, instance);
    }
  }
}

// ── Automation interpolation ──────────────────────────────────────────────────

function interpolateAutomation(points: AutomationPoint[], time: number): number {
  if (points.length === 0) return 0;
  if (time <= points[0].timeSeconds) return points[0].value;
  if (time >= points[points.length - 1].timeSeconds) return points[points.length - 1].value;

  // Binary search for the surrounding segment
  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timeSeconds <= time) lo = mid;
    else hi = mid;
  }

  const t0 = points[lo].timeSeconds;
  const t1 = points[hi].timeSeconds;
  const v0 = points[lo].value;
  const v1 = points[hi].value;
  const t = (time - t0) / (t1 - t0);
  return v0 + (v1 - v0) * t;
}

// ── Singleton export ──────────────────────────────────────────────────────────

let _host: PluginHost | null = null;

export function getPluginHost(cacheDir?: string): PluginHost {
  if (!_host) {
    if (!cacheDir) throw new Error('PluginHost not initialised — provide cacheDir');
    _host = new PluginHost(cacheDir);
  }
  return _host;
}
