// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Effects Rack Component
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useDJStore } from '../../store';
import type { EffectType, Effect } from '../../types';

// ── Effect catalog ────────────────────────────────────────────────────────────

const EFFECT_TYPES: { value: EffectType; label: string }[] = [
  { value: 'reverb', label: 'Reverb' },
  { value: 'delay', label: 'Delay' },
  { value: 'filter', label: 'Filter' },
  { value: 'flanger', label: 'Flanger' },
  { value: 'phaser', label: 'Phaser' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'compressor', label: 'Compressor' },
  { value: 'distortion', label: 'Distortion' },
  { value: 'bitcrusher', label: 'Bitcrusher' },
  { value: 'beat_repeat', label: 'Beat Repeat' },
  { value: 'stutter', label: 'Stutter' },
  { value: 'granular', label: 'Granular' },
  { value: 'vinyl_brake', label: 'Vinyl Brake' },
  { value: 'echo_out', label: 'Echo Out' },
];

interface EffectParameterDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}

const EFFECT_PARAMS: Record<EffectType, EffectParameterDef[]> = {
  reverb: [
    { id: 'roomSize', label: 'Room', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 },
    { id: 'decay', label: 'Decay', min: 0.1, max: 10, step: 0.1, unit: 's', default: 2 },
    { id: 'preDelay', label: 'Pre-dly', min: 0, max: 100, step: 1, unit: 'ms', default: 20 },
    { id: 'damping', label: 'Damp', min: 0, max: 1, step: 0.01, unit: '', default: 0.3 },
  ],
  delay: [
    { id: 'time', label: 'Time', min: 0.01, max: 2, step: 0.01, unit: 's', default: 0.5 },
    { id: 'feedback', label: 'Feedbk', min: 0, max: 0.99, step: 0.01, unit: '', default: 0.4 },
    { id: 'filter', label: 'Filter', min: 200, max: 8000, step: 100, unit: 'Hz', default: 4000 },
  ],
  filter: [
    { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, step: 10, unit: 'Hz', default: 1000 },
    { id: 'resonance', label: 'Reso', min: 0.1, max: 20, step: 0.1, unit: '', default: 1 },
  ],
  flanger: [
    { id: 'rate', label: 'Rate', min: 0.01, max: 5, step: 0.01, unit: 'Hz', default: 0.5 },
    { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 },
    { id: 'feedback', label: 'Feedbk', min: -0.99, max: 0.99, step: 0.01, unit: '', default: 0.3 },
  ],
  phaser: [
    { id: 'rate', label: 'Rate', min: 0.01, max: 5, step: 0.01, unit: 'Hz', default: 0.5 },
    { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: '', default: 0.8 },
    { id: 'stages', label: 'Stages', min: 2, max: 12, step: 2, unit: '', default: 4 },
  ],
  chorus: [
    { id: 'rate', label: 'Rate', min: 0.01, max: 10, step: 0.01, unit: 'Hz', default: 1.5 },
    { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 },
    { id: 'delay', label: 'Delay', min: 1, max: 30, step: 0.5, unit: 'ms', default: 7 },
  ],
  compressor: [
    { id: 'threshold', label: 'Thresh', min: -60, max: 0, step: 1, unit: 'dB', default: -12 },
    { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1', default: 4 },
    { id: 'attack', label: 'Attack', min: 0.1, max: 100, step: 0.1, unit: 'ms', default: 5 },
    { id: 'release', label: 'Release', min: 10, max: 500, step: 5, unit: 'ms', default: 100 },
  ],
  distortion: [
    { id: 'drive', label: 'Drive', min: 1, max: 100, step: 1, unit: '', default: 10 },
    { id: 'tone', label: 'Tone', min: 200, max: 8000, step: 100, unit: 'Hz', default: 3000 },
  ],
  bitcrusher: [
    { id: 'bits', label: 'Bits', min: 1, max: 16, step: 1, unit: 'bit', default: 8 },
    { id: 'rate', label: 'Rate', min: 0.01, max: 1, step: 0.01, unit: '', default: 0.5 },
  ],
  beat_repeat: [
    { id: 'division', label: 'Div', min: 0.0625, max: 4, step: 0.0625, unit: '', default: 0.5 },
    { id: 'chance', label: 'Chance', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 },
    { id: 'gate', label: 'Gate', min: 0, max: 1, step: 0.01, unit: '', default: 0.8 },
  ],
  stutter: [
    { id: 'rate', label: 'Rate', min: 0.0625, max: 1, step: 0.0625, unit: '', default: 0.25 },
    { id: 'mode', label: 'Mode', min: 0, max: 2, step: 1, unit: '', default: 0 },
  ],
  granular: [
    { id: 'grainSize', label: 'Grain', min: 10, max: 500, step: 10, unit: 'ms', default: 100 },
    { id: 'scatter', label: 'Scatter', min: 0, max: 1, step: 0.01, unit: '', default: 0.3 },
    { id: 'pitch', label: 'Pitch', min: -12, max: 12, step: 0.5, unit: 'st', default: 0 },
  ],
  vinyl_brake: [
    { id: 'brakeTime', label: 'Time', min: 0.1, max: 4, step: 0.1, unit: 's', default: 1 },
  ],
  echo_out: [
    { id: 'time', label: 'Time', min: 0.01, max: 2, step: 0.01, unit: 's', default: 0.5 },
    { id: 'feedback', label: 'Feedbk', min: 0, max: 0.99, step: 0.01, unit: '', default: 0.5 },
    { id: 'cutoff', label: 'Cutoff', min: 200, max: 8000, step: 100, unit: 'Hz', default: 4000 },
  ],
};

// ── Knob sub-component ────────────────────────────────────────────────────────

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  size?: number;
}

function Knob({ value, min, max, onChange, label, size = 36 }: KnobProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const rad = (angle * Math.PI) / 180;
  const tipX = cx + r * Math.sin(rad);
  const tipY = cy - r * Math.cos(rad);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    e.preventDefault();
  }, [value]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = (startY.current - e.clientY) / 150;
      const range = max - min;
      onChange(Math.max(min, Math.min(max, startValue.current + delta * range)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [min, max, onChange]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg width={size} height={size} onMouseDown={onMouseDown} className="cursor-pointer">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={r - 3} fill="#1f2937" stroke="#4b5563" strokeWidth="1" />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[8px] text-gray-500 uppercase tracking-wider text-center leading-tight">{label}</span>
      <span className="text-[8px] text-gray-400 font-mono">{typeof value === 'number' ? value.toFixed(2) : value}</span>
    </div>
  );
}

// ── Preset management ─────────────────────────────────────────────────────────

interface Preset {
  name: string;
  type: EffectType;
  wetDry: number;
  params: Record<string, number>;
}

const DEFAULT_PRESETS: Preset[] = [
  { name: 'Hall Reverb', type: 'reverb', wetDry: 0.3, params: { roomSize: 0.8, decay: 4, preDelay: 30, damping: 0.5 } },
  { name: 'Slapback', type: 'delay', wetDry: 0.4, params: { time: 0.12, feedback: 0.1, filter: 6000 } },
  { name: 'Sweep Filter', type: 'filter', wetDry: 1, params: { cutoff: 500, resonance: 3 } },
  { name: 'Tape Echo', type: 'delay', wetDry: 0.5, params: { time: 0.5, feedback: 0.55, filter: 3000 } },
];

// ── Effect slot ────────────────────────────────────────────────────────────────

interface EffectSlotProps {
  slotIndex: 0 | 1 | 2;
  effect: Effect | null;
}

function EffectSlot({ slotIndex, effect }: EffectSlotProps) {
  const { addEffect, removeEffect, toggleEffect, setEffectWetDry, setEffectParam } = useDJStore();
  const effectsEnabled = useDJStore(s => s.mixer.effectsUnit.isEnabled);

  const [selectedType, setSelectedType] = useState<EffectType>('reverb');
  const [bpmSync, setBpmSync] = useState(false);
  const masterBpm = useDJStore(s => s.mixer.masterBpm);

  const slotColors = ['#3b82f6', '#a855f7', '#22c55e'];
  const color = slotColors[slotIndex];

  const paramDefs = effect ? (EFFECT_PARAMS[effect.type] ?? []) : [];

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-lg border transition-all ${
        effect?.isEnabled
          ? 'bg-gray-800 border-opacity-60'
          : 'bg-gray-800/50 border-gray-700/30'
      }`}
      style={{ borderColor: effect ? color + '55' : '#374151' }}
    >
      {/* Slot header */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: color + '22', color }}
        >
          FX{slotIndex + 1}
        </span>

        {/* Effect type selector */}
        <select
          value={effect?.type ?? selectedType}
          onChange={e => {
            const t = e.target.value as EffectType;
            setSelectedType(t);
            if (effect) {
              removeEffect(slotIndex);
              addEffect(slotIndex, t);
            }
          }}
          className="flex-1 bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">— Select Effect —</option>
          {EFFECT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Toggle on/off */}
        {effect ? (
          <button
            onClick={() => toggleEffect(slotIndex)}
            className={`w-7 h-7 rounded font-bold text-xs transition-colors ${
              effect.isEnabled
                ? 'bg-green-500 text-black'
                : 'bg-gray-600 text-gray-400'
            }`}
          >
            {effect.isEnabled ? 'ON' : 'OFF'}
          </button>
        ) : (
          <button
            onClick={() => addEffect(slotIndex, selectedType)}
            className="w-7 h-7 rounded bg-gray-600 hover:bg-gray-500 text-gray-300 text-lg font-bold flex items-center justify-center"
          >
            +
          </button>
        )}

        {effect && (
          <button
            onClick={() => removeEffect(slotIndex)}
            className="w-6 h-6 rounded bg-red-800/50 hover:bg-red-700 text-red-400 text-xs font-bold"
          >
            ×
          </button>
        )}
      </div>

      {effect && (
        <>
          {/* Wet/Dry and BPM sync */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <div className="flex items-center gap-2 w-full">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider w-10">WET</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={effect.wetDry}
                  onChange={e => setEffectWetDry(slotIndex, parseFloat(e.target.value))}
                  className="flex-1 h-1.5 appearance-none bg-gray-700 rounded-full cursor-pointer"
                  style={{ accentColor: color }}
                />
                <span className="text-[9px] font-mono text-gray-400 w-8 text-right">
                  {Math.round(effect.wetDry * 100)}%
                </span>
              </div>
            </div>
            <button
              onClick={() => setBpmSync(s => !s)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                bpmSync
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              title={masterBpm ? `Sync to ${masterBpm.toFixed(1)} BPM` : 'No master BPM'}
            >
              BPM
            </button>
          </div>

          {/* Parameter knobs */}
          {paramDefs.length > 0 && (
            <div className="flex gap-2 justify-center flex-wrap">
              {paramDefs.map(def => {
                const paramValue = effect.parameters[def.id]?.value ?? def.default;
                return (
                  <Knob
                    key={def.id}
                    value={paramValue}
                    min={def.min}
                    max={def.max}
                    onChange={v => setEffectParam(slotIndex, def.id, v)}
                    label={def.label}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Effect chain visualization ─────────────────────────────────────────────────

function ChainVisualization({ slots }: { slots: (Effect | null)[] }) {
  return (
    <div className="flex items-center gap-1 bg-gray-800/50 rounded px-2 py-1">
      <span className="text-[9px] text-gray-600 uppercase tracking-wider mr-1">CHAIN</span>
      {slots.map((effect, i) => (
        <React.Fragment key={i}>
          <div
            className={`px-2 py-0.5 rounded text-[9px] font-medium ${
              effect?.isEnabled
                ? 'bg-gray-600 text-gray-200'
                : 'bg-gray-800 text-gray-600 border border-gray-700 border-dashed'
            }`}
          >
            {effect ? effect.label : `FX${i + 1}`}
          </div>
          {i < slots.length - 1 && (
            <span className="text-gray-600 text-[9px]">→</span>
          )}
        </React.Fragment>
      ))}
      <span className="text-gray-600 text-[9px] ml-1">→ OUT</span>
    </div>
  );
}

// ── Main EffectsRack Component ─────────────────────────────────────────────────

export function EffectsRack() {
  const effectsUnit = useDJStore(s => s.mixer.effectsUnit);
  const toggleEffectsUnit = useDJStore(s => s.toggleEffectsUnit);

  const [presets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
  const [showPresets, setShowPresets] = useState(false);

  const { addEffect, setEffectWetDry } = useDJStore();

  const loadPreset = useCallback((preset: Preset) => {
    // Find empty slot
    const emptySlot = effectsUnit.slots.findIndex(s => s === null) as 0 | 1 | 2;
    if (emptySlot === -1) return;
    addEffect(emptySlot, preset.type);
    setEffectWetDry(emptySlot, preset.wetDry);
    // Note: params would be set after effect is loaded in real implementation
  }, [effectsUnit.slots, addEffect, setEffectWetDry]);

  const saveCurrentPreset = useCallback(() => {
    const activeEffect = effectsUnit.slots.find(s => s !== null);
    if (!activeEffect) return;
    const name = `Custom ${Date.now()}`;
    const params: Record<string, number> = {};
    Object.entries(activeEffect.parameters).forEach(([k, v]) => {
      params[k] = v.value;
    });
    setSavedPresets(p => [...p, { name, type: activeEffect.type, wetDry: activeEffect.wetDry, params }]);
  }, [effectsUnit.slots]);

  return (
    <div className="flex flex-col gap-2 bg-gray-900 rounded-xl border border-gray-700/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold uppercase tracking-widest text-sm">FX Rack</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPresets(s => !s)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              showPresets ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            PRESETS
          </button>
          <button
            onClick={toggleEffectsUnit}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              effectsUnit.isEnabled
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {effectsUnit.isEnabled ? 'ENABLED' : 'BYPASSED'}
          </button>
        </div>
      </div>

      {/* Chain visualization */}
      <ChainVisualization slots={effectsUnit.slots} />

      {/* Presets panel */}
      {showPresets && (
        <div className="bg-gray-800 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-gray-400 text-[10px] uppercase tracking-wider">Presets</span>
            <button
              onClick={saveCurrentPreset}
              className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-wider hover:bg-blue-500/30 transition-colors"
            >
              + Save Current
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {[...presets, ...savedPresets].map((preset, i) => (
              <button
                key={i}
                onClick={() => loadPreset(preset)}
                className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-[9px] transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Effect slots */}
      <div className="flex flex-col gap-2">
        {(effectsUnit.slots as (Effect | null)[]).map((effect, i) => (
          <EffectSlot key={i} slotIndex={i as 0 | 1 | 2} effect={effect} />
        ))}
      </div>
    </div>
  );
}

export default EffectsRack;
