// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Full Settings Panel
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useStore } from '../../store';
import type {
  AppSettings,
  AudioSettings,
  MidiDevice,
} from '../../types';

// ── Tab definitions ───────────────────────────────────────────────────────────

type SettingsTab =
  | 'audio'
  | 'midi'
  | 'library'
  | 'appearance'
  | 'performance'
  | 'shortcuts'
  | 'backup';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'audio',       label: 'Audio',        icon: '🔊' },
  { id: 'midi',        label: 'MIDI',         icon: '🎹' },
  { id: 'library',     label: 'Library',      icon: '📁' },
  { id: 'appearance',  label: 'Appearance',   icon: '🎨' },
  { id: 'performance', label: 'Performance',  icon: '⚡' },
  { id: 'shortcuts',   label: 'Shortcuts',    icon: '⌨️' },
  { id: 'backup',      label: 'Backup',       icon: '💾' },
];

// ── Default keyboard shortcuts ─────────────────────────────────────────────

interface ShortcutDef {
  id: string;
  label: string;
  category: string;
  defaultKey: string;
  currentKey: string;
}

const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { id: 'play_deck_a',    label: 'Play/Pause Deck A',  category: 'Decks',    defaultKey: 'Space',        currentKey: 'Space'        },
  { id: 'play_deck_b',    label: 'Play/Pause Deck B',  category: 'Decks',    defaultKey: 'Enter',        currentKey: 'Enter'        },
  { id: 'cue_deck_a',     label: 'Cue Deck A',         category: 'Decks',    defaultKey: 'Shift+Space',  currentKey: 'Shift+Space'  },
  { id: 'cue_deck_b',     label: 'Cue Deck B',         category: 'Decks',    defaultKey: 'Shift+Enter',  currentKey: 'Shift+Enter'  },
  { id: 'sync_deck_a',    label: 'Sync Deck A',        category: 'Decks',    defaultKey: 'S',            currentKey: 'S'            },
  { id: 'sync_deck_b',    label: 'Sync Deck B',        category: 'Decks',    defaultKey: 'D',            currentKey: 'D'            },
  { id: 'loop_2bar',      label: 'Loop 2 bars',        category: 'Loops',    defaultKey: 'F1',           currentKey: 'F1'           },
  { id: 'loop_4bar',      label: 'Loop 4 bars',        category: 'Loops',    defaultKey: 'F2',           currentKey: 'F2'           },
  { id: 'loop_8bar',      label: 'Loop 8 bars',        category: 'Loops',    defaultKey: 'F3',           currentKey: 'F3'           },
  { id: 'hotcue_1',       label: 'Hot Cue 1',          category: 'Hot Cues', defaultKey: 'Q',            currentKey: 'Q'            },
  { id: 'hotcue_2',       label: 'Hot Cue 2',          category: 'Hot Cues', defaultKey: 'W',            currentKey: 'W'            },
  { id: 'hotcue_3',       label: 'Hot Cue 3',          category: 'Hot Cues', defaultKey: 'E',            currentKey: 'E'            },
  { id: 'hotcue_4',       label: 'Hot Cue 4',          category: 'Hot Cues', defaultKey: 'R',            currentKey: 'R'            },
  { id: 'xfader_left',    label: 'Crossfader Left',    category: 'Mixer',    defaultKey: 'ArrowLeft',    currentKey: 'ArrowLeft'    },
  { id: 'xfader_right',   label: 'Crossfader Right',   category: 'Mixer',    defaultKey: 'ArrowRight',   currentKey: 'ArrowRight'   },
  { id: 'search_library', label: 'Search Library',     category: 'Library',  defaultKey: 'Ctrl+F',       currentKey: 'Ctrl+F'       },
  { id: 'load_track_a',   label: 'Load to Deck A',     category: 'Library',  defaultKey: 'Ctrl+1',       currentKey: 'Ctrl+1'       },
  { id: 'load_track_b',   label: 'Load to Deck B',     category: 'Library',  defaultKey: 'Ctrl+2',       currentKey: 'Ctrl+2'       },
];

// ── Sub-panel props ───────────────────────────────────────────────────────────

interface SelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({ label, value, options, onChange, disabled }) => (
  <div className="settings-field">
    <label className="settings-label">{label}</label>
    <select
      className="settings-select"
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

const SliderField: React.FC<SliderFieldProps> = ({
  label, value, min, max, step, unit = '', onChange,
}) => (
  <div className="settings-field">
    <label className="settings-label">
      {label}
      <span className="settings-value-badge">{value}{unit}</span>
    </label>
    <input
      type="range"
      className="settings-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
    />
  </div>
);

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ label, description, checked, onChange }) => (
  <div className="settings-field settings-field--toggle">
    <div className="settings-toggle-text">
      <span className="settings-label">{label}</span>
      {description && <span className="settings-description">{description}</span>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      className={`settings-toggle-btn ${checked ? 'settings-toggle-btn--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  </div>
);

// ── Audio settings panel ──────────────────────────────────────────────────────

const BUFFER_SIZES = [64, 128, 256, 512, 1024, 2048, 4096].map(n => ({
  value: String(n),
  label: `${n} samples`,
}));

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000].map(n => ({
  value: String(n),
  label: `${n} Hz`,
}));

interface AudioPanelProps {
  settings: AudioSettings;
  onChange: (patch: Partial<AudioSettings>) => void;
}

const AudioPanel: React.FC<AudioPanelProps> = ({ settings, onChange }) => {
  const [outputDevices, setOutputDevices] = useState<string[]>([]);
  const [inputDevices, setInputDevices]   = useState<string[]>([]);

  useEffect(() => {
    // In production, call into the Rust engine via IPC:
    //   window.electron.ipcRenderer.invoke('audio:listOutputDevices')
    setOutputDevices(['Default', 'Built-in Output', 'Focusrite Scarlett 2i2', 'ASIO4ALL']);
    setInputDevices(['Default', 'Built-in Microphone', 'Focusrite Scarlett 2i2 (Input)']);
  }, []);

  const toOption = (name: string) => ({ value: name, label: name });

  return (
    <div className="settings-panel">
      <h3 className="settings-section-title">Output Device</h3>
      <Select
        label="Output Device"
        value={settings.outputDevice ?? 'Default'}
        options={outputDevices.map(toOption)}
        onChange={v => onChange({ outputDevice: v })}
      />
      <Select
        label="Driver Type"
        value={settings.driverType ?? 'default'}
        options={[
          { value: 'default',  label: 'Default' },
          { value: 'asio',     label: 'ASIO (Windows)' },
          { value: 'wasapi',   label: 'WASAPI (Windows)' },
          { value: 'coreaudio',label: 'Core Audio (macOS)' },
          { value: 'alsa',     label: 'ALSA (Linux)' },
          { value: 'jack',     label: 'JACK (Linux/macOS)' },
        ]}
        onChange={v => onChange({ driverType: v as AudioSettings['driverType'] })}
      />
      <Select
        label="Sample Rate"
        value={String(settings.sampleRate ?? 44100)}
        options={SAMPLE_RATES}
        onChange={v => onChange({ sampleRate: Number(v) as AudioSettings['sampleRate'] })}
      />
      <Select
        label="Buffer Size"
        value={String(settings.bufferSize ?? 256)}
        options={BUFFER_SIZES}
        onChange={v => onChange({ bufferSize: Number(v) as AudioSettings['bufferSize'] })}
      />
      <div className="settings-latency-info">
        Estimated latency:{' '}
        <strong>
          {(((settings.bufferSize ?? 256) / (settings.sampleRate ?? 44100)) * 1000).toFixed(1)} ms
        </strong>
      </div>

      <h3 className="settings-section-title">Input Device (for recording)</h3>
      <Select
        label="Input Device"
        value={settings.inputDevice ?? 'Default'}
        options={inputDevices.map(toOption)}
        onChange={v => onChange({ inputDevice: v })}
      />

      <h3 className="settings-section-title">Monitoring</h3>
      <Toggle
        label="Enable monitoring"
        description="Route input through the mixer for headphone cueing"
        checked={settings.monitoringEnabled ?? false}
        onChange={v => onChange({ monitoringEnabled: v })}
      />
      <SliderField
        label="Master volume"
        value={Math.round((settings.masterVolume ?? 1.0) * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={v => onChange({ masterVolume: v / 100 })}
      />
    </div>
  );
};

// ── MIDI panel ────────────────────────────────────────────────────────────────

interface MidiPanelProps {
  devices: MidiDevice[];
  onToggle: (deviceId: string, enabled: boolean) => void;
}

const MidiPanel: React.FC<MidiPanelProps> = ({ devices, onToggle }) => (
  <div className="settings-panel">
    <h3 className="settings-section-title">MIDI Devices</h3>
    {devices.length === 0 && (
      <p className="settings-empty-state">No MIDI devices detected.</p>
    )}
    {devices.map(dev => (
      <div key={dev.id} className="midi-device-row">
        <div className="midi-device-info">
          <span className="midi-device-name">{dev.name}</span>
          <span className={`midi-device-badge ${dev.type}`}>{dev.type}</span>
        </div>
        <Toggle
          label="Enabled"
          checked={dev.isEnabled}
          onChange={checked => onToggle(dev.id, checked)}
        />
      </div>
    ))}
    <p className="settings-hint">
      Plug in or unplug devices to refresh the list.
    </p>
  </div>
);

// ── Library panel ─────────────────────────────────────────────────────────────

interface LibraryPanelProps {
  folders: string[];
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
  onRescan: () => void;
}

const LibraryPanel: React.FC<LibraryPanelProps> = ({
  folders, onAddFolder, onRemoveFolder, onRescan,
}) => (
  <div className="settings-panel">
    <h3 className="settings-section-title">Music Library Folders</h3>
    <div className="library-folder-list">
      {folders.length === 0 && (
        <p className="settings-empty-state">No folders added yet.</p>
      )}
      {folders.map(folder => (
        <div key={folder} className="library-folder-row">
          <span className="library-folder-path">{folder}</span>
          <button
            className="settings-btn settings-btn--danger settings-btn--sm"
            onClick={() => onRemoveFolder(folder)}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
    <div className="settings-actions">
      <button className="settings-btn" onClick={onAddFolder}>
        + Add Folder
      </button>
      <button className="settings-btn settings-btn--secondary" onClick={onRescan}>
        Rescan All
      </button>
    </div>
    <h3 className="settings-section-title">File Types</h3>
    {['mp3', 'flac', 'wav', 'ogg', 'aiff', 'm4a', 'aac'].map(ext => (
      <Toggle key={ext} label={`.${ext}`} checked={true} onChange={() => {}} />
    ))}
  </div>
);

// ── Appearance panel ──────────────────────────────────────────────────────────

type ThemeName = 'dark' | 'darker' | 'midnight' | 'light';

const ACCENT_COLORS = [
  '#00d1ff', '#ff3366', '#00ff99', '#ff9900',
  '#aa44ff', '#ff6600', '#00aaff', '#ffcc00',
];

interface AppearancePanelProps {
  theme: ThemeName;
  accentColor: string;
  fontSize: number;
  is4KMode: boolean;
  onThemeChange: (t: ThemeName) => void;
  onAccentChange: (c: string) => void;
  onFontSizeChange: (n: number) => void;
  on4KChange: (b: boolean) => void;
}

const AppearancePanel: React.FC<AppearancePanelProps> = ({
  theme, accentColor, fontSize, is4KMode,
  onThemeChange, onAccentChange, onFontSizeChange, on4KChange,
}) => (
  <div className="settings-panel">
    <h3 className="settings-section-title">Theme</h3>
    <div className="theme-selector">
      {(['dark', 'darker', 'midnight', 'light'] as ThemeName[]).map(t => (
        <button
          key={t}
          className={`theme-btn theme-btn--${t} ${theme === t ? 'theme-btn--active' : ''}`}
          onClick={() => onThemeChange(t)}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>

    <h3 className="settings-section-title">Accent Color</h3>
    <div className="accent-color-grid">
      {ACCENT_COLORS.map(color => (
        <button
          key={color}
          className={`accent-swatch ${accentColor === color ? 'accent-swatch--active' : ''}`}
          style={{ background: color }}
          onClick={() => onAccentChange(color)}
          aria-label={`Accent color ${color}`}
        />
      ))}
    </div>

    <h3 className="settings-section-title">Font Size</h3>
    <SliderField
      label="UI font size"
      value={fontSize}
      min={10}
      max={20}
      step={1}
      unit="px"
      onChange={onFontSizeChange}
    />

    <h3 className="settings-section-title">Display</h3>
    <Toggle
      label="4K / High-DPI mode"
      description="Render waveforms and visuals at 2× resolution"
      checked={is4KMode}
      onChange={on4KChange}
    />
  </div>
);

// ── Performance panel ─────────────────────────────────────────────────────────

interface PerformancePanelProps {
  gpuAcceleration: boolean;
  waveformQuality: 'low' | 'medium' | 'high';
  onGpuChange: (b: boolean) => void;
  onWaveformQualityChange: (q: 'low' | 'medium' | 'high') => void;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({
  gpuAcceleration, waveformQuality, onGpuChange, onWaveformQualityChange,
}) => (
  <div className="settings-panel">
    <h3 className="settings-section-title">Rendering</h3>
    <Toggle
      label="GPU acceleration"
      description="Use WebGL for waveform rendering (reduces CPU usage)"
      checked={gpuAcceleration}
      onChange={onGpuChange}
    />
    <Select
      label="Waveform quality"
      value={waveformQuality}
      options={[
        { value: 'low',    label: 'Low (fastest)' },
        { value: 'medium', label: 'Medium (balanced)' },
        { value: 'high',   label: 'High (best quality)' },
      ]}
      onChange={v => onWaveformQualityChange(v as 'low' | 'medium' | 'high')}
    />
    <h3 className="settings-section-title">Analysis</h3>
    <Toggle
      label="Background BPM analysis"
      description="Analyse newly added tracks in the background"
      checked={true}
      onChange={() => {}}
    />
    <Toggle
      label="Stem separation cache"
      description="Cache stem separation results to disk"
      checked={true}
      onChange={() => {}}
    />
  </div>
);

// ── Shortcuts panel ───────────────────────────────────────────────────────────

interface ShortcutsPanelProps {
  shortcuts: ShortcutDef[];
  onUpdate: (id: string, key: string) => void;
  onReset: () => void;
}

const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({ shortcuts, onUpdate, onReset }) => {
  const [capturing, setCapturing] = useState<string | null>(null);

  const handleKeyCapture = useCallback(
    (id: string, e: KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const mods: string[] = [];
      if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
      if (e.altKey)   mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;
      const combo = [...mods, key].join('+');
      onUpdate(id, combo);
      setCapturing(null);
    },
    [onUpdate],
  );

  // Group by category
  const categories = Array.from(new Set(shortcuts.map(s => s.category)));

  return (
    <div className="settings-panel">
      <div className="shortcuts-header">
        <span>Click a key binding to reassign it, then press the new key combination.</span>
        <button className="settings-btn settings-btn--secondary settings-btn--sm" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
      {categories.map(cat => (
        <div key={cat} className="shortcuts-category">
          <h4 className="shortcuts-category-title">{cat}</h4>
          <div className="shortcuts-list">
            {shortcuts.filter(s => s.category === cat).map(s => (
              <div key={s.id} className="shortcut-row">
                <span className="shortcut-label">{s.label}</span>
                <button
                  className={`shortcut-key-btn ${capturing === s.id ? 'shortcut-key-btn--capturing' : ''}`}
                  onClick={() => setCapturing(s.id)}
                  onKeyDown={capturing === s.id ? e => handleKeyCapture(s.id, e) : undefined}
                  onBlur={() => setCapturing(null)}
                >
                  {capturing === s.id ? 'Press key…' : s.currentKey}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Backup panel ──────────────────────────────────────────────────────────────

const BackupPanel: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    try {
      setStatus('Exporting…');
      // In production: window.electron.ipcRenderer.invoke('settings:export')
      await new Promise(r => setTimeout(r, 500));
      setStatus('Settings exported successfully.');
    } catch (err) {
      setStatus(`Export failed: ${String(err)}`);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      setStatus('Importing…');
      await new Promise(r => setTimeout(r, 500));
      setStatus('Settings imported. Restart recommended.');
    } catch (err) {
      setStatus(`Import failed: ${String(err)}`);
    }
  }, []);

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset ALL settings to factory defaults? This cannot be undone.')) return;
    await new Promise(r => setTimeout(r, 300));
    setStatus('Settings reset to defaults. Restart the app to apply.');
  }, []);

  return (
    <div className="settings-panel">
      <h3 className="settings-section-title">Settings Backup</h3>
      <p className="settings-hint">Export your settings to a JSON file to back them up or transfer to another machine.</p>
      <div className="settings-actions">
        <button className="settings-btn" onClick={handleExport}>Export settings…</button>
        <button className="settings-btn settings-btn--secondary" onClick={handleImport}>Import settings…</button>
      </div>
      {status && <p className="settings-status">{status}</p>}
      <h3 className="settings-section-title">Factory Reset</h3>
      <p className="settings-hint settings-hint--danger">
        This will erase all your custom settings, key mappings, and library metadata.
      </p>
      <button className="settings-btn settings-btn--danger" onClick={handleReset}>
        Reset to factory defaults
      </button>
    </div>
  );
};

// ── Main Settings component ───────────────────────────────────────────────────

interface SettingsProps {
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [shortcuts, setShortcuts] = useState<ShortcutDef[]>(DEFAULT_SHORTCUTS);

  // Pull relevant state slices from the Zustand store
  const audioSettings  = useStore(s => s.settings?.audio);
  const midiDevices    = useStore(s => s.midiDevices ?? []);
  const libraryFolders = useStore(s => s.library?.folders ?? []);
  const updateSettings = useStore(s => s.updateSettings);
  const toggleMidiDevice = useStore(s => s.toggleMidiDevice);

  // Local appearance state (synced to store on change)
  const [theme,       setTheme]       = useState<ThemeName>('dark');
  const [accent,      setAccent]      = useState('#00d1ff');
  const [fontSize,    setFontSize]    = useState(13);
  const [is4K,        setIs4K]        = useState(false);
  const [gpuAccel,    setGpuAccel]    = useState(true);
  const [wfQuality,   setWfQuality]   = useState<'low'|'medium'|'high'>('high');

  // Apply accent color as a CSS variable on the document root
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);
  }, [fontSize]);

  const handleAudioChange = useCallback(
    (patch: Partial<AudioSettings>) => {
      updateSettings?.({ audio: { ...(audioSettings ?? {}), ...patch } as AudioSettings });
    },
    [audioSettings, updateSettings],
  );

  const handleAddFolder = useCallback(async () => {
    // In production: window.electron.ipcRenderer.invoke('library:addFolder')
    console.log('Add folder dialog');
  }, []);

  const handleRemoveFolder = useCallback((folder: string) => {
    // dispatch remove action
    console.log('Remove folder', folder);
  }, []);

  const handleRescan = useCallback(() => {
    console.log('Rescan library');
  }, []);

  const handleShortcutUpdate = useCallback((id: string, key: string) => {
    setShortcuts(prev => prev.map(s => s.id === id ? { ...s, currentKey: key } : s));
  }, []);

  const handleShortcutsReset = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS.map(s => ({ ...s, currentKey: s.defaultKey })));
  }, []);

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-window">
        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {/* Sidebar tabs */}
          <nav className="settings-sidebar" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`settings-tab-btn ${activeTab === tab.id ? 'settings-tab-btn--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="settings-tab-icon">{tab.icon}</span>
                <span className="settings-tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="settings-content" role="tabpanel">
            {activeTab === 'audio' && audioSettings && (
              <AudioPanel settings={audioSettings} onChange={handleAudioChange} />
            )}
            {activeTab === 'midi' && (
              <MidiPanel
                devices={midiDevices}
                onToggle={toggleMidiDevice ?? (() => {})}
              />
            )}
            {activeTab === 'library' && (
              <LibraryPanel
                folders={libraryFolders}
                onAddFolder={handleAddFolder}
                onRemoveFolder={handleRemoveFolder}
                onRescan={handleRescan}
              />
            )}
            {activeTab === 'appearance' && (
              <AppearancePanel
                theme={theme}
                accentColor={accent}
                fontSize={fontSize}
                is4KMode={is4K}
                onThemeChange={setTheme}
                onAccentChange={setAccent}
                onFontSizeChange={setFontSize}
                on4KChange={setIs4K}
              />
            )}
            {activeTab === 'performance' && (
              <PerformancePanel
                gpuAcceleration={gpuAccel}
                waveformQuality={wfQuality}
                onGpuChange={setGpuAccel}
                onWaveformQualityChange={setWfQuality}
              />
            )}
            {activeTab === 'shortcuts' && (
              <ShortcutsPanel
                shortcuts={shortcuts}
                onUpdate={handleShortcutUpdate}
                onReset={handleShortcutsReset}
              />
            )}
            {activeTab === 'backup' && <BackupPanel />}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="settings-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <style>{SETTINGS_CSS}</style>
    </div>
  );
};

export default Settings;

// ── Inline CSS ─────────────────────────────────────────────────────────────────

const SETTINGS_CSS = `
.settings-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
}
.settings-window {
  width: 860px; max-width: 95vw;
  height: 600px; max-height: 90vh;
  background: var(--bg-2, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  display: flex; flex-direction: column;
  font-size: var(--font-size-base, 13px);
  color: var(--text-primary, #e8e8f0);
  box-shadow: 0 24px 80px rgba(0,0,0,0.8);
  overflow: hidden;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border, #333);
  background: var(--bg-3, #14142b);
}
.settings-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.settings-close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-secondary, #888); font-size: 16px;
  padding: 4px 8px; border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.settings-close-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
.settings-body {
  display: flex; flex: 1; overflow: hidden;
}
.settings-sidebar {
  width: 160px; flex-shrink: 0;
  background: var(--bg-3, #14142b);
  border-right: 1px solid var(--border, #333);
  display: flex; flex-direction: column;
  padding: 8px 0;
  overflow-y: auto;
}
.settings-tab-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: none; border: none; cursor: pointer;
  color: var(--text-secondary, #888);
  font-size: 13px; text-align: left; width: 100%;
  border-left: 3px solid transparent;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.settings-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
.settings-tab-btn--active {
  color: var(--accent, #00d1ff);
  border-left-color: var(--accent, #00d1ff);
  background: rgba(0, 209, 255, 0.07);
}
.settings-tab-icon { font-size: 16px; }
.settings-content {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}
.settings-panel { display: flex; flex-direction: column; gap: 10px; }
.settings-section-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--text-secondary, #888);
  margin: 12px 0 4px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border, #333);
}
.settings-field { display: flex; flex-direction: column; gap: 4px; }
.settings-field--toggle { flex-direction: row; align-items: center; justify-content: space-between; }
.settings-label { font-size: 13px; color: var(--text-primary, #e8e8f0); display: flex; align-items: center; gap: 8px; }
.settings-value-badge {
  font-size: 11px; color: var(--accent, #00d1ff);
  background: rgba(0,209,255,0.1); padding: 1px 6px; border-radius: 10px;
}
.settings-description { font-size: 11px; color: var(--text-muted, #666); }
.settings-select {
  background: var(--bg-4, #0e0e1a); border: 1px solid var(--border, #333);
  color: var(--text-primary, #e8e8f0); padding: 6px 10px;
  border-radius: 6px; font-size: 13px; cursor: pointer;
  transition: border-color 0.15s;
}
.settings-select:focus { outline: none; border-color: var(--accent, #00d1ff); }
.settings-slider { width: 100%; accent-color: var(--accent, #00d1ff); cursor: pointer; }
.settings-toggle-btn {
  width: 40px; height: 22px; border-radius: 11px;
  background: var(--bg-4, #333); border: none; cursor: pointer;
  position: relative; transition: background 0.2s; flex-shrink: 0;
}
.settings-toggle-btn--on { background: var(--accent, #00d1ff); }
.settings-toggle-thumb {
  position: absolute; top: 3px; left: 3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; transition: transform 0.2s; display: block;
}
.settings-toggle-btn--on .settings-toggle-thumb { transform: translateX(18px); }
.settings-toggle-text { display: flex; flex-direction: column; gap: 2px; }
.settings-hint { font-size: 12px; color: var(--text-muted, #666); margin: 0; }
.settings-hint--danger { color: #ff6666; }
.settings-empty-state { font-size: 13px; color: var(--text-muted, #666); font-style: italic; }
.settings-latency-info { font-size: 12px; color: var(--text-secondary, #888); padding: 4px 0; }
.settings-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.settings-btn {
  padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer;
  background: var(--accent, #00d1ff); color: #000; border: none;
  font-weight: 600; transition: opacity 0.15s, transform 0.1s;
}
.settings-btn:hover { opacity: 0.9; }
.settings-btn:active { transform: scale(0.97); }
.settings-btn--secondary { background: var(--bg-4, #333); color: var(--text-primary, #e8e8f0); }
.settings-btn--danger { background: #cc2244; color: #fff; }
.settings-btn--sm { padding: 4px 10px; font-size: 12px; }
.settings-status { font-size: 12px; color: var(--accent, #00d1ff); padding: 8px; background: rgba(0,209,255,0.08); border-radius: 6px; }
.settings-footer {
  border-top: 1px solid var(--border, #333);
  padding: 12px 20px;
  display: flex; justify-content: flex-end;
}

/* MIDI */
.midi-device-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border, #2a2a3a); }
.midi-device-info { display: flex; align-items: center; gap: 8px; }
.midi-device-name { font-size: 13px; }
.midi-device-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--bg-4, #333); text-transform: uppercase; letter-spacing: 0.5px; }

/* Library */
.library-folder-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.library-folder-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-3, #14142b); border-radius: 6px; }
.library-folder-path { font-size: 12px; font-family: monospace; color: var(--text-primary, #e8e8f0); word-break: break-all; }

/* Appearance */
.theme-selector { display: flex; gap: 8px; flex-wrap: wrap; }
.theme-btn { padding: 6px 14px; border-radius: 6px; border: 2px solid var(--border, #333); cursor: pointer; font-size: 13px; transition: border-color 0.15s, background 0.15s; }
.theme-btn--dark     { background: #1a1a2e; color: #e8e8f0; }
.theme-btn--darker   { background: #0d0d1a; color: #e8e8f0; }
.theme-btn--midnight { background: #060618; color: #e8e8f0; }
.theme-btn--light    { background: #f0f0f5; color: #111; }
.theme-btn--active   { border-color: var(--accent, #00d1ff); }
.accent-color-grid { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0; }
.accent-swatch { width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
.accent-swatch:hover { transform: scale(1.2); }
.accent-swatch--active { border-color: #fff; }

/* Shortcuts */
.shortcuts-header { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-secondary, #888); margin-bottom: 8px; }
.shortcuts-category { margin-bottom: 12px; }
.shortcuts-category-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary, #888); margin: 0 0 6px; }
.shortcuts-list { display: flex; flex-direction: column; gap: 2px; }
.shortcut-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
.shortcut-label { font-size: 13px; color: var(--text-primary, #e8e8f0); }
.shortcut-key-btn {
  min-width: 100px; padding: 4px 10px; border-radius: 4px;
  background: var(--bg-4, #0e0e1a); border: 1px solid var(--border, #333);
  color: var(--accent, #00d1ff); font-size: 12px; font-family: monospace; cursor: pointer;
  text-align: center; transition: border-color 0.15s;
}
.shortcut-key-btn:hover { border-color: var(--accent, #00d1ff); }
.shortcut-key-btn--capturing { border-color: #ffcc00; color: #ffcc00; animation: blink 0.8s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`;
