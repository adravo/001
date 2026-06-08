// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — 16-Pad Sampler Component
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback,
  useRef,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { useDJStore } from '../../store';
import type { SamplerPlayMode, Track } from '../../types';

// ── Pad colors per bank ────────────────────────────────────────────────────────

const BANK_COLORS: Record<string, string[]> = {
  A: [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
    '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
    '#0891b2', '#2563eb', '#9333ea', '#db2777',
  ],
  B: [
    '#f87171', '#fb923c', '#facc15', '#4ade80',
    '#22d3ee', '#60a5fa', '#c084fc', '#f472b6',
    '#fca5a5', '#fdba74', '#fde047', '#86efac',
    '#67e8f9', '#93c5fd', '#d8b4fe', '#f9a8d4',
  ],
  C: [
    '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
    '#1d4ed8', '#1e40af', '#1e3a8a', '#172554',
    '#0e7490', '#155e75', '#164e63', '#0c4a6e',
    '#065f46', '#064e3b', '#052e16', '#14532d',
  ],
  D: [
    '#fbbf24', '#f59e0b', '#d97706', '#b45309',
    '#92400e', '#78350f', '#1c1917', '#292524',
    '#44403c', '#57534e', '#78716c', '#a8a29e',
    '#d6d3d1', '#e7e5e4', '#f5f5f4', '#fafaf9',
  ],
};

// ── Velocity bar ───────────────────────────────────────────────────────────────

function VelocityBar({ velocity }: { velocity: number }) {
  return (
    <div className="w-full bg-gray-700 rounded-full h-1">
      <div
        className="h-1 rounded-full transition-all duration-75"
        style={{
          width: `${velocity * 100}%`,
          backgroundColor: velocity > 0.8 ? '#ef4444' : velocity > 0.5 ? '#f59e0b' : '#22c55e',
        }}
      />
    </div>
  );
}

// ── Knob sub-component ────────────────────────────────────────────────────────

interface KnobProps {
  value: number;
  onChange: (v: number) => void;
  label: string;
  color?: string;
  size?: number;
}

function Knob({ value, onChange, label, color = '#3b82f6', size = 30 }: KnobProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const angle = -135 + value * 270;
  const r = size / 2 - 3;
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
      const delta = (startY.current - e.clientY) / 100;
      onChange(Math.max(0, Math.min(1, startValue.current + delta)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onChange]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg width={size} height={size} onMouseDown={onMouseDown} className="cursor-pointer">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r - 2} fill="#111827" stroke="#374151" strokeWidth="1" />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-[7px] text-gray-500 uppercase">{label}</span>
    </div>
  );
}

// ── Sampler Pad ────────────────────────────────────────────────────────────────

interface SamplerPadProps {
  slot: number;
  bank: string;
  onDrop: (slot: number, e: React.DragEvent) => void;
}

function SamplerPadComponent({ slot, bank, onDrop }: SamplerPadProps) {
  const pad = useDJStore(s => s.sampler.pads[slot]);
  const { triggerPad, releasePad, setPadVolume, setPadPitch, setPadPlayMode, unloadSamplerPad } = useDJStore();
  const masterBpm = useDJStore(s => s.mixer.masterBpm);
  const syncToMaster = useDJStore(s => s.sampler.syncToMaster);

  const [isDragOver, setIsDragOver] = useState(false);
  const [velocity, setVelocity] = useState(0);
  const velocityTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const color = BANK_COLORS[bank]?.[slot % 16] ?? '#444466';
  const isPlaying = pad?.isPlaying ?? false;
  const hasTrack = !!pad?.track;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const vel = Math.min(1, e.pressure || 0.8);
    setVelocity(vel);
    triggerPad(slot);
    clearTimeout(velocityTimerRef.current);
    velocityTimerRef.current = setTimeout(() => setVelocity(0), 500);
  }, [slot, triggerPad]);

  const handlePointerUp = useCallback(() => {
    releasePad(slot);
  }, [slot, releasePad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
    onDrop(slot, e);
  }, [slot, onDrop]);

  const bpmIndicator = useMemo(() => {
    if (!syncToMaster || !masterBpm || !pad?.track?.bpm) return null;
    const ratio = masterBpm / pad.track.bpm;
    return ratio.toFixed(2) + 'x';
  }, [syncToMaster, masterBpm, pad?.track?.bpm]);

  if (!pad) return null;

  return (
    <div
      className={`relative flex flex-col rounded-lg overflow-hidden border transition-all duration-75 cursor-pointer select-none ${
        isDragOver ? 'border-white scale-105' : isPlaying ? 'scale-[0.97]' : ''
      }`}
      style={{
        borderColor: isDragOver ? 'white' : isPlaying ? color : color + '44',
        backgroundColor: isPlaying ? color + '33' : hasTrack ? color + '11' : '#0f1117',
        boxShadow: isPlaying ? `0 0 12px ${color}88` : isDragOver ? `0 0 8px white` : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Pad number */}
      <div className="flex items-center justify-between px-1.5 pt-1.5">
        <span
          className="text-[9px] font-bold"
          style={{ color: hasTrack ? color : '#4b5563' }}
        >
          {slot + 1}
        </span>
        {isPlaying && (
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: color }}
          />
        )}
        {bpmIndicator && (
          <span className="text-[7px] font-mono text-yellow-400">{bpmIndicator}</span>
        )}
      </div>

      {/* Track label */}
      <div className="flex-1 flex items-center justify-center px-1 py-0.5 min-h-[28px]">
        {hasTrack ? (
          <p
            className="text-[8px] font-medium text-center leading-tight line-clamp-2"
            style={{ color: isPlaying ? 'white' : color }}
          >
            {pad.track!.metadata.title || pad.label}
          </p>
        ) : (
          <p className="text-[8px] text-gray-600 text-center">
            {isDragOver ? 'Drop here' : 'Empty'}
          </p>
        )}
      </div>

      {/* Velocity bar */}
      <div className="px-1.5 pb-1">
        <VelocityBar velocity={velocity} />
      </div>

      {/* Controls */}
      {hasTrack && (
        <div className="flex items-center justify-between px-1 pb-1 gap-1">
          <Knob
            value={pad.volume}
            onChange={v => setPadVolume(slot, v)}
            label="VOL"
            color={color}
            size={24}
          />
          <Knob
            value={(pad.pitch + 12) / 24}
            onChange={v => setPadPitch(slot, v * 24 - 12)}
            label="PIT"
            color={color}
            size={24}
          />
          <button
            onClick={e => { e.stopPropagation(); unloadSamplerPad(slot); }}
            className="text-[8px] text-red-500 hover:text-red-400 font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Play mode selector ─────────────────────────────────────────────────────────

const PLAY_MODES: { value: SamplerPlayMode; label: string }[] = [
  { value: 'oneshot', label: '1-SHOT' },
  { value: 'loop', label: 'LOOP' },
  { value: 'hold', label: 'HOLD' },
  { value: 'stutter', label: 'STUT' },
];

// ── Bank selector ──────────────────────────────────────────────────────────────

const BANKS = ['A', 'B', 'C', 'D'];

// ── Main Sampler Component ─────────────────────────────────────────────────────

export function Sampler() {
  const sampler = useDJStore(s => s.sampler);
  const masterBpm = useDJStore(s => s.mixer.masterBpm);
  const { setSamplerMasterVolume, setPadPlayMode, loadSamplerPad } = useDJStore();

  const [activeBank, setActiveBank] = useState('A');
  const [globalPlayMode, setGlobalPlayMode] = useState<SamplerPlayMode>('oneshot');
  const syncToMaster = useDJStore(s => s.sampler.syncToMaster);

  // The 16 pad slots for the current bank view
  // In this simplified model all pads are shared (bank is visual grouping)
  const padSlots = useMemo(() => {
    const bankIndex = BANKS.indexOf(activeBank);
    return Array.from({ length: 16 }, (_, i) => bankIndex * 16 + i);
  }, [activeBank]);

  // Apply global play mode to all active pads
  const applyGlobalMode = useCallback((mode: SamplerPlayMode) => {
    setGlobalPlayMode(mode);
    padSlots.forEach(slot => {
      if (sampler.pads[slot]?.track) {
        setPadPlayMode(slot, mode);
      }
    });
  }, [padSlots, sampler.pads, setPadPlayMode]);

  // Handle drag-and-drop
  const handleDrop = useCallback((slot: number, e: React.DragEvent) => {
    e.preventDefault();
    // Accept JSON track data from library drag or plain text as title
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const track = JSON.parse(jsonData) as Track;
        loadSamplerPad(slot, track);
        return;
      } catch {}
    }
    // Fall back to plain text as file path hint
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      const mockTrack: Track = {
        id: `sampler-${Date.now()}-${slot}`,
        filePath: text,
        fileSize: 0,
        fileHash: '',
        duration: 0,
        sampleRate: 44100,
        bitrate: 320,
        channels: 2,
        codec: 'mp3',
        metadata: {
          title: text.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Sample',
          artist: '',
          album: '', albumArtist: '', genre: '', year: null, trackNumber: null,
          discNumber: null, comment: '', composer: '', label: '', isrc: '', artworkDataUrl: null,
        },
        bpm: null, key: null, energy: null, loudness: null,
        waveformData: null, beatGrid: null,
        cuePoints: [], savedLoops: [], tags: [],
        playCount: 0, lastPlayedAt: null, dateAdded: Date.now(),
        analysisStatus: 'pending', analysisError: null, color: null, rating: 0,
      };
      loadSamplerPad(slot, mockTrack);
    }
  }, [loadSamplerPad]);

  return (
    <div className="flex flex-col gap-2 bg-gray-900 rounded-xl border border-gray-700/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold uppercase tracking-widest text-sm">Sampler</h2>
        <div className="flex items-center gap-2">
          {masterBpm && (
            <span className="text-yellow-400 text-xs font-mono">{masterBpm.toFixed(1)} BPM</span>
          )}
          <div
            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              syncToMaster ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-500'
            }`}
          >
            {syncToMaster ? 'SYNCED' : 'FREE'}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
        {/* Bank selector */}
        <div className="flex gap-1">
          {BANKS.map(bank => (
            <button
              key={bank}
              onClick={() => setActiveBank(bank)}
              className={`w-7 h-6 rounded text-[10px] font-bold uppercase transition-colors ${
                activeBank === bank
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {bank}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-700" />

        {/* Play mode buttons */}
        <div className="flex gap-1">
          {PLAY_MODES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => applyGlobalMode(value)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                globalPlayMode === value
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Master volume */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[9px] uppercase tracking-wider">VOL</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sampler.masterVolume}
            onChange={e => setSamplerMasterVolume(parseFloat(e.target.value))}
            className="w-20 h-1.5 appearance-none bg-gray-700 rounded-full cursor-pointer accent-purple-500"
          />
          <span className="text-gray-400 text-[9px] font-mono w-8">
            {Math.round(sampler.masterVolume * 100)}%
          </span>
        </div>
      </div>

      {/* Pad grid */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}
      >
        {Array.from({ length: 16 }, (_, i) => {
          const slot = BANKS.indexOf(activeBank) <= 0 ? i : i; // simplified: always 0-15
          return (
            <SamplerPadComponent
              key={i}
              slot={i}
              bank={activeBank}
              onDrop={handleDrop}
            />
          );
        })}
      </div>

      {/* BPM sync indicator */}
      {syncToMaster && masterBpm && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-400 text-[9px] font-medium">
            Pads synced to master clock · {masterBpm.toFixed(1)} BPM
          </span>
        </div>
      )}
    </div>
  );
}

export default Sampler;
