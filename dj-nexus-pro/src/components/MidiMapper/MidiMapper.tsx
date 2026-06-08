// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — MIDI Mapper UI
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDJStore } from '../../store';
import { midiEngine, CONTROLLER_PROFILES } from '../../midi/MidiEngine';
import type { MidiMapping, MidiMessage, MidiDevice, DeckId } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeAction(mapping: MidiMapping): string {
  const a = mapping.action;
  switch (a.type) {
    case 'deck_play': return `Deck ${a.deckId} Play/Pause`;
    case 'deck_cue': return `Deck ${a.deckId} Cue`;
    case 'deck_sync': return `Deck ${a.deckId} Sync`;
    case 'deck_volume': return `Deck ${a.deckId} Volume`;
    case 'deck_pitch': return `Deck ${a.deckId} Pitch`;
    case 'deck_hot_cue': return `Deck ${a.deckId} Hot Cue ${a.slot + 1}`;
    case 'deck_loop_toggle': return `Deck ${a.deckId} Loop Toggle`;
    case 'deck_loop_size': return `Deck ${a.deckId} Loop Size`;
    case 'crossfader': return 'Crossfader';
    case 'channel_fader': return `Channel ${a.deckId} Fader`;
    case 'eq_high': return `EQ High ${a.deckId}`;
    case 'eq_mid': return `EQ Mid ${a.deckId}`;
    case 'eq_low': return `EQ Low ${a.deckId}`;
    case 'effect_toggle': return `Effect Slot ${a.effectSlot + 1} Toggle`;
    case 'effect_param': return `Effect ${a.effectSlot + 1} Param`;
    case 'sampler_pad': return `Sampler Pad ${a.padSlot + 1}`;
    case 'jog_wheel': return `Deck ${a.deckId} Jog (${a.mode})`;
    case 'custom_script': return `Custom Script: ${a.scriptId}`;
    default: return 'Unknown';
  }
}

function describeMidiMessage(msg: MidiMessage): string {
  const ch = msg.channel + 1;
  switch (msg.type) {
    case 'note_on': return `Note On Ch${ch} #${msg.note}`;
    case 'note_off': return `Note Off Ch${ch} #${msg.note}`;
    case 'control_change': return `CC Ch${ch} #${msg.controller}`;
    case 'pitch_bend': return `Pitch Bend Ch${ch}`;
    case 'program_change': return `PC Ch${ch} #${msg.note}`;
    default: return 'Unknown';
  }
}

// ── Controller diagram (simplified visual) ────────────────────────────────────

const ControllerDiagram: React.FC<{ deviceName: string }> = ({ deviceName }) => {
  const isDDJ = deviceName.toLowerCase().includes('pioneer') || deviceName.toLowerCase().includes('ddj');
  const isDenon = deviceName.toLowerCase().includes('denon');

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">
        Controller Layout — {deviceName || 'Generic'}
      </div>
      <div className="flex gap-4">
        {/* Left deck */}
        <div className="flex-1 bg-gray-750 border border-gray-600 rounded p-3 flex flex-col gap-2">
          <div className="text-xs text-blue-400 font-semibold">Deck A/C</div>
          <div className="flex gap-1">
            {['HOT1','HOT2','HOT3','HOT4','HOT5','HOT6','HOT7','HOT8'].map(l => (
              <div key={l} className="flex-1 h-5 bg-orange-800/50 border border-orange-700 rounded text-[8px] flex items-center justify-center text-orange-400">{l.replace('HOT','')}</div>
            ))}
          </div>
          <div className="w-full h-16 bg-gray-700 border border-gray-600 rounded flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-gray-500 flex items-center justify-center text-xs text-gray-400">JOG</div>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 h-5 bg-green-800/50 border border-green-700 rounded text-[9px] flex items-center justify-center text-green-400">▶</div>
            <div className="flex-1 h-5 bg-yellow-800/50 border border-yellow-700 rounded text-[9px] flex items-center justify-center text-yellow-400">CUE</div>
            <div className="flex-1 h-5 bg-blue-800/50 border border-blue-700 rounded text-[9px] flex items-center justify-center text-blue-400">SYNC</div>
          </div>
          <div className="flex justify-center">
            <div className="w-2 h-12 bg-gradient-to-t from-blue-500 to-transparent rounded border border-gray-600" title="Pitch Fader" />
          </div>
        </div>

        {/* Mixer center */}
        <div className="w-32 bg-gray-750 border border-gray-600 rounded p-3 flex flex-col gap-2">
          <div className="text-xs text-gray-400 font-semibold text-center">Mixer</div>
          <div className="flex gap-3 justify-center">
            {['A','B'].map(id => (
              <div key={id} className="flex flex-col items-center gap-1">
                <div className="text-[9px] text-gray-500">{id}</div>
                <div className="w-2 h-14 bg-gradient-to-t from-white/20 to-transparent rounded border border-gray-600" />
              </div>
            ))}
          </div>
          <div className="text-[9px] text-center text-gray-500">Channel Faders</div>
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="w-full h-2 bg-gradient-to-r from-blue-400 via-gray-700 to-orange-400 rounded" />
            <div className="text-[9px] text-gray-500">Crossfader</div>
          </div>
          <div className="flex gap-1 mt-1">
            {['H','M','L'].map(band => (
              <div key={band} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-3 h-3 rounded-full border border-gray-500 bg-gray-700" />
                <div className="text-[8px] text-gray-600">{band}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right deck */}
        <div className="flex-1 bg-gray-750 border border-gray-600 rounded p-3 flex flex-col gap-2">
          <div className="text-xs text-blue-400 font-semibold">Deck B/D</div>
          <div className="flex gap-1">
            {['HOT1','HOT2','HOT3','HOT4','HOT5','HOT6','HOT7','HOT8'].map(l => (
              <div key={l} className="flex-1 h-5 bg-orange-800/50 border border-orange-700 rounded text-[8px] flex items-center justify-center text-orange-400">{l.replace('HOT','')}</div>
            ))}
          </div>
          <div className="w-full h-16 bg-gray-700 border border-gray-600 rounded flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-gray-500 flex items-center justify-center text-xs text-gray-400">JOG</div>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 h-5 bg-green-800/50 border border-green-700 rounded text-[9px] flex items-center justify-center text-green-400">▶</div>
            <div className="flex-1 h-5 bg-yellow-800/50 border border-yellow-700 rounded text-[9px] flex items-center justify-center text-yellow-400">CUE</div>
            <div className="flex-1 h-5 bg-blue-800/50 border border-blue-700 rounded text-[9px] flex items-center justify-center text-blue-400">SYNC</div>
          </div>
          <div className="flex justify-center">
            <div className="w-2 h-12 bg-gradient-to-t from-blue-500 to-transparent rounded border border-gray-600" title="Pitch Fader" />
          </div>
        </div>
      </div>
      {isDDJ && (
        <div className="mt-2 text-[9px] text-gray-600 text-center">Pioneer DDJ layout</div>
      )}
      {isDenon && (
        <div className="mt-2 text-[9px] text-gray-600 text-center">Denon SC layout</div>
      )}
    </div>
  );
};

// ── New mapping form ──────────────────────────────────────────────────────────

interface NewMappingFormProps {
  devices: MidiDevice[];
  learnedMessage: { msg: MidiMessage; deviceId: string } | null;
  onLearn: () => void;
  onCancelLearn: () => void;
  isLearning: boolean;
  onAdd: (mapping: Omit<MidiMapping, 'id'>) => void;
  onClose: () => void;
}

const ACTION_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Deck A Play/Pause', value: 'deck_play:A' },
  { label: 'Deck B Play/Pause', value: 'deck_play:B' },
  { label: 'Deck C Play/Pause', value: 'deck_play:C' },
  { label: 'Deck D Play/Pause', value: 'deck_play:D' },
  { label: 'Deck A Cue', value: 'deck_cue:A' },
  { label: 'Deck B Cue', value: 'deck_cue:B' },
  { label: 'Deck A Pitch', value: 'deck_pitch:A' },
  { label: 'Deck B Pitch', value: 'deck_pitch:B' },
  { label: 'Deck A Volume', value: 'deck_volume:A' },
  { label: 'Deck B Volume', value: 'deck_volume:B' },
  { label: 'Deck A Jog Scratch', value: 'jog_wheel:A:scratch' },
  { label: 'Deck B Jog Scratch', value: 'jog_wheel:B:scratch' },
  { label: 'Deck A Jog Nudge', value: 'jog_wheel:A:nudge' },
  { label: 'Deck B Jog Nudge', value: 'jog_wheel:B:nudge' },
  { label: 'Crossfader', value: 'crossfader' },
  { label: 'Channel A Fader', value: 'channel_fader:A' },
  { label: 'Channel B Fader', value: 'channel_fader:B' },
  { label: 'EQ High A', value: 'eq_high:A' },
  { label: 'EQ Mid A', value: 'eq_mid:A' },
  { label: 'EQ Low A', value: 'eq_low:A' },
  { label: 'EQ High B', value: 'eq_high:B' },
  { label: 'EQ Mid B', value: 'eq_mid:B' },
  { label: 'EQ Low B', value: 'eq_low:B' },
  { label: 'Effect Slot 1 Toggle', value: 'effect_toggle:0' },
  { label: 'Effect Slot 2 Toggle', value: 'effect_toggle:1' },
  { label: 'Effect Slot 3 Toggle', value: 'effect_toggle:2' },
  ...Array.from({ length: 8 }, (_, i) => ({ label: `Deck A Hot Cue ${i + 1}`, value: `deck_hot_cue:A:${i}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ label: `Deck B Hot Cue ${i + 1}`, value: `deck_hot_cue:B:${i}` })),
  ...Array.from({ length: 16 }, (_, i) => ({ label: `Sampler Pad ${i + 1}`, value: `sampler_pad:${i}` })),
];

function parseActionValue(val: string): MidiMapping['action'] {
  const parts = val.split(':');
  const type = parts[0];
  const deckId = parts[1] as DeckId;
  switch (type) {
    case 'deck_play': return { type: 'deck_play', deckId };
    case 'deck_cue': return { type: 'deck_cue', deckId };
    case 'deck_pitch': return { type: 'deck_pitch', deckId };
    case 'deck_volume': return { type: 'deck_volume', deckId };
    case 'deck_sync': return { type: 'deck_sync', deckId };
    case 'deck_hot_cue': return { type: 'deck_hot_cue', deckId, slot: parseInt(parts[2], 10) };
    case 'deck_loop_toggle': return { type: 'deck_loop_toggle', deckId };
    case 'jog_wheel': return { type: 'jog_wheel', deckId, mode: (parts[2] ?? 'scratch') as 'scratch' | 'nudge' };
    case 'crossfader': return { type: 'crossfader' };
    case 'channel_fader': return { type: 'channel_fader', deckId };
    case 'eq_high': return { type: 'eq_high', deckId };
    case 'eq_mid': return { type: 'eq_mid', deckId };
    case 'eq_low': return { type: 'eq_low', deckId };
    case 'effect_toggle': return { type: 'effect_toggle', effectSlot: parseInt(parts[1], 10) as 0 | 1 | 2 };
    case 'sampler_pad': return { type: 'sampler_pad', padSlot: parseInt(parts[1], 10) };
    default: return { type: 'deck_play', deckId: 'A' };
  }
}

const NewMappingForm: React.FC<NewMappingFormProps> = ({
  devices,
  learnedMessage,
  onLearn,
  onCancelLearn,
  isLearning,
  onAdd,
  onClose,
}) => {
  const [label, setLabel] = useState('');
  const [actionValue, setActionValue] = useState('deck_play:A');
  const [deviceId, setDeviceId] = useState('');
  const [scaleMin, setScaleMin] = useState(-1);
  const [scaleMax, setScaleMax] = useState(1);

  const inputDevices = devices.filter(d => d.isInput);

  const handleSubmit = () => {
    if (!learnedMessage) return;
    const action = parseActionValue(actionValue);
    onAdd({
      label: label || describeAction({ id: '', label: '', message: learnedMessage.msg, action, scaleMin, scaleMax, isEnabled: true, deviceName: '', deviceId: learnedMessage.deviceId }),
      message: learnedMessage.msg,
      action,
      scaleMin,
      scaleMax,
      isEnabled: true,
      deviceName: inputDevices.find(d => d.id === (deviceId || learnedMessage.deviceId))?.name ?? '',
      deviceId: deviceId || learnedMessage.deviceId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-5 w-[460px] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Add MIDI Mapping</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Learn section */}
        <div className="bg-gray-750 border border-gray-700 rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">MIDI Input</span>
            {isLearning ? (
              <button
                className="px-2 py-1 rounded bg-red-600 text-white text-xs animate-pulse"
                onClick={onCancelLearn}
              >
                Cancel Learn
              </button>
            ) : (
              <button
                className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500"
                onClick={onLearn}
              >
                Learn
              </button>
            )}
          </div>
          {isLearning && (
            <div className="text-xs text-yellow-400 animate-pulse">
              Move a control on your MIDI controller…
            </div>
          )}
          {learnedMessage && (
            <div className="text-xs text-green-400 font-mono">
              ✓ Captured: {describeMidiMessage(learnedMessage.msg)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-gray-400">Label (optional)</label>
            <input
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Deck A Play"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-gray-400">Action</label>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
              value={actionValue}
              onChange={e => setActionValue(e.target.value)}
            >
              {ACTION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Device</label>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">Any device</option>
              {inputDevices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Scale Min / Max</label>
            <div className="flex gap-1">
              <input
                type="number"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
                value={scaleMin}
                onChange={e => setScaleMin(Number(e.target.value))}
              />
              <input
                type="number"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
                value={scaleMax}
                onChange={e => setScaleMax(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600" onClick={onClose}>Cancel</button>
          <button
            className={`px-3 py-1.5 rounded text-white text-sm ${learnedMessage ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-600 cursor-not-allowed opacity-50'}`}
            onClick={handleSubmit}
            disabled={!learnedMessage}
          >
            Add Mapping
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

export const MidiMapper: React.FC = () => {
  const { midiMappings, midiDevices, addMidiMapping, updateMidiMapping, removeMidiMapping } = useDJStore();

  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [learnedMessage, setLearnedMessage] = useState<{ msg: MidiMessage; deviceId: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputDevices = midiDevices.filter(d => d.isInput);
  const outputDevices = midiDevices.filter(d => d.isOutput);

  const filteredMappings = midiMappings.filter(m => {
    const q = search.toLowerCase();
    return (
      m.label.toLowerCase().includes(q) ||
      describeMidiMessage(m.message).toLowerCase().includes(q) ||
      describeAction(m).toLowerCase().includes(q)
    );
  });

  const handleLearn = useCallback(() => {
    setIsLearning(true);
    setLearnedMessage(null);
    midiEngine.startLearn((msg, deviceId) => {
      setLearnedMessage({ msg, deviceId });
      setIsLearning(false);
      midiEngine.stopLearn();
    });
  }, []);

  const handleCancelLearn = useCallback(() => {
    setIsLearning(false);
    midiEngine.stopLearn();
  }, []);

  const handleLoadProfile = useCallback(() => {
    if (!selectedProfile) return;
    const profile = CONTROLLER_PROFILES[selectedProfile];
    if (!profile) return;
    const deviceId = selectedDevice || '';
    midiEngine.loadProfile(profile, deviceId);
  }, [selectedProfile, selectedDevice]);

  const handleExport = useCallback(() => {
    const json = midiEngine.exportMappings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dj-nexus-midi-mappings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        midiEngine.importMappings(evt.target?.result as string);
      } catch {
        alert('Failed to import mappings. Check the file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const diagramDevice = inputDevices[0]?.name ?? 'Generic';

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-semibold text-white">MIDI Mapper</h1>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
            onClick={() => { setShowNewForm(true); setLearnedMessage(null); }}
          >
            + Add Mapping
          </button>
          <button className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm" onClick={handleExport}>
            Export
          </button>
          <button className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
        {/* Sidebar: devices + profiles */}
        <div className="w-56 flex-shrink-0 border-r border-gray-700 bg-gray-850 flex flex-col overflow-y-auto p-3 gap-4">
          {/* Devices */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Devices</div>
            {midiDevices.length === 0 && (
              <div className="text-xs text-gray-600">No devices connected</div>
            )}
            {midiDevices.map(d => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-gray-800">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate">{d.name}</div>
                  <div className="text-[10px] text-gray-500">{d.isInput ? 'Input' : ''}{d.isInput && d.isOutput ? ' + ' : ''}{d.isOutput ? 'Output' : ''}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Profiles */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Controller Preset</div>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-xs mb-2"
              value={selectedProfile}
              onChange={e => setSelectedProfile(e.target.value)}
            >
              <option value="">Select preset…</option>
              {Object.entries(CONTROLLER_PROFILES).map(([key, p]) => (
                <option key={key} value={key}>{p.name}</option>
              ))}
            </select>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-xs mb-2"
              value={selectedDevice}
              onChange={e => setSelectedDevice(e.target.value)}
            >
              <option value="">Any device</option>
              {inputDevices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              className={`w-full py-1.5 rounded text-xs ${selectedProfile ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
              onClick={handleLoadProfile}
              disabled={!selectedProfile}
            >
              Load Preset
            </button>
          </div>

          {/* MIDI Clock */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">MIDI Clock</div>
            <div className="flex gap-1">
              <button
                className="flex-1 py-1 rounded bg-green-700 hover:bg-green-600 text-white text-xs"
                onClick={() => midiEngine.startClock(120)}
              >
                Start
              </button>
              <button
                className="flex-1 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs"
                onClick={() => midiEngine.stopClock()}
              >
                Stop
              </button>
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Controller diagram */}
          <div className="p-3 border-b border-gray-700 flex-shrink-0">
            <ControllerDiagram deviceName={diagramDevice} />
          </div>

          {/* Mapping list */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Search mappings…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-gray-800 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-6" />
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Label</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">MIDI Input</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Action</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Device</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 text-right">Scale</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map(mapping => (
                    <tr key={mapping.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={mapping.isEnabled}
                          onChange={e => updateMidiMapping(mapping.id, { isEnabled: e.target.checked })}
                          className="accent-blue-500"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-sm text-gray-200">{mapping.label}</td>
                      <td className="px-3 py-1.5 text-xs text-yellow-400 font-mono">{describeMidiMessage(mapping.message)}</td>
                      <td className="px-3 py-1.5 text-xs text-blue-400">{describeAction(mapping)}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-500 truncate max-w-[100px]">{mapping.deviceName || 'Any'}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-500 text-right tabular-nums">
                        {mapping.scaleMin} → {mapping.scaleMax}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          className="text-gray-600 hover:text-red-400 text-sm"
                          onClick={() => removeMidiMapping(mapping.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredMappings.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">
                        {midiMappings.length === 0 ? 'No mappings yet. Add a mapping or load a preset.' : 'No matches.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* New mapping modal */}
      {showNewForm && (
        <NewMappingForm
          devices={midiDevices}
          learnedMessage={learnedMessage}
          onLearn={handleLearn}
          onCancelLearn={handleCancelLearn}
          isLearning={isLearning}
          onAdd={mapping => addMidiMapping(mapping)}
          onClose={() => { setShowNewForm(false); handleCancelLearn(); }}
        />
      )}
    </div>
  );
};

export default MidiMapper;
