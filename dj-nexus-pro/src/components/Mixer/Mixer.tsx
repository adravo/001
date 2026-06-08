// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — 4-Channel Mixer Component
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useDJStore } from '../../store';
import type { DeckId, CrossfaderCurve } from '../../types';

// ── VU Meter ──────────────────────────────────────────────────────────────────

interface VUMeterProps {
  dbLeft: number;
  dbRight: number;
  height?: number;
}

function VUMeter({ dbLeft, dbRight, height = 120 }: VUMeterProps) {
  // Convert dB to 0..1 (clamp at -60dB floor, 0dB = 1.0, +6 = over)
  const toLevel = (db: number) => Math.max(0, Math.min(1.1, (db + 60) / 66));
  const leftLevel = toLevel(dbLeft);
  const rightLevel = toLevel(dbRight);

  const renderBar = (level: number, key: string) => {
    const segments = 20;
    return (
      <div key={key} className="flex flex-col-reverse gap-px" style={{ height }}>
        {Array.from({ length: segments }, (_, i) => {
          const threshold = (i + 1) / segments;
          const active = level >= threshold;
          let color = 'bg-green-500';
          if (threshold > 0.95) color = 'bg-red-500';
          else if (threshold > 0.8) color = 'bg-yellow-400';
          return (
            <div
              key={i}
              className={`w-2.5 rounded-sm transition-all duration-75 ${
                active ? color : 'bg-gray-700'
              }`}
              style={{ flex: '1' }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex gap-0.5">
      {renderBar(leftLevel, 'L')}
      {renderBar(rightLevel, 'R')}
    </div>
  );
}

// ── Vertical Fader ─────────────────────────────────────────────────────────────

interface FaderProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  height?: number;
  color?: string;
  label?: string;
}

function VerticalFader({ value, onChange, height = 120, color = '#3b82f6', label }: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const getValueFromY = useCallback((clientY: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const frac = 1 - (clientY - rect.top) / rect.height;
    return Math.max(0, Math.min(1, frac));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    onChange(getValueFromY(e.clientY));
    e.preventDefault();
  }, [getValueFromY, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onChange(getValueFromY(e.clientY));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [getValueFromY, onChange]);

  const thumbTop = (1 - value) * (height - 16);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        ref={trackRef}
        className="relative rounded-full bg-gray-700 cursor-pointer"
        style={{ width: 8, height }}
        onMouseDown={onMouseDown}
      >
        {/* Track fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{ height: `${value * 100}%`, backgroundColor: color + '66' }}
        />
        {/* Thumb */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-sm border border-gray-400 cursor-grab active:cursor-grabbing"
          style={{
            width: 20,
            height: 16,
            top: thumbTop,
            background: 'linear-gradient(180deg, #6b7280, #374151)',
          }}
        />
      </div>
      {label && <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>}
    </div>
  );
}

// ── Horizontal Fader (crossfader) ──────────────────────────────────────────────

interface HFaderProps {
  value: number; // -1..1
  onChange: (v: number) => void;
  width?: number;
}

function HorizontalFader({ value, onChange, width = 200 }: HFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const getValueFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(-1, Math.min(1, frac * 2 - 1));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    onChange(getValueFromX(e.clientX));
    e.preventDefault();
  }, [getValueFromX, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onChange(getValueFromX(e.clientX));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [getValueFromX, onChange]);

  const thumbLeft = ((value + 1) / 2) * (width - 16);

  return (
    <div
      ref={trackRef}
      className="relative rounded-full bg-gray-700 cursor-pointer select-none"
      style={{ height: 8, width }}
      onMouseDown={onMouseDown}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm border border-gray-400 cursor-grab active:cursor-grabbing"
        style={{
          width: 16,
          height: 20,
          left: thumbLeft,
          background: 'linear-gradient(90deg, #6b7280, #374151)',
        }}
      />
    </div>
  );
}

// ── Knob ──────────────────────────────────────────────────────────────────────

interface KnobProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  color?: string;
  size?: number;
  centerDetent?: boolean;
}

function Knob({ value, onChange, label, color = '#3b82f6', size = 36, centerDetent = false }: KnobProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const angle = -135 + value * 270;
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
      let next = Math.max(0, Math.min(1, startValue.current + delta));
      // Snap to center if within 2%
      if (centerDetent && Math.abs(next - 0.5) < 0.02) next = 0.5;
      onChange(next);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onChange, centerDetent]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" style={{ width: size }}>
      <svg width={size} height={size} onMouseDown={onMouseDown} className="cursor-pointer">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={r - 3} fill="#1f2937" stroke="#4b5563" strokeWidth="1" />
        {centerDetent && (
          <line x1={cx} y1={cy - r + 3} x2={cx} y2={cy - r - 1} stroke="#4b5563" strokeWidth="1" />
        )}
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Channel Strip ─────────────────────────────────────────────────────────────

interface ChannelStripProps {
  deckId: DeckId;
}

function ChannelStrip({ deckId }: ChannelStripProps) {
  const channel = useDJStore(s => s.mixer.channels[deckId]);
  const deck = useDJStore(s => s.decks[deckId]);
  const {
    setChannelFader, setChannelTrim,
    setEqHigh, setEqMid, setEqLow,
    setPflu,
  } = useDJStore();

  const isPlaying = deck.playState === 'playing';
  const deckColors: Record<DeckId, string> = {
    A: '#3b82f6',
    B: '#f97316',
    C: '#a855f7',
    D: '#22c55e',
  };
  const color = deckColors[deckId];

  return (
    <div className="flex flex-col items-center gap-2 px-2 py-3 bg-gray-800 rounded-lg border border-gray-700/50">
      {/* Deck label */}
      <div
        className="text-xs font-bold px-3 py-0.5 rounded"
        style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
      >
        {deckId}
      </div>

      {/* VU Meter */}
      <VUMeter dbLeft={channel.meterLeft} dbRight={channel.meterRight} height={100} />

      {/* Gain/Trim knob */}
      <Knob
        value={channel.trim / 2}
        onChange={v => setChannelTrim(deckId, v * 2)}
        label="GAIN"
        color={color}
      />

      {/* EQ knobs */}
      <Knob
        value={(channel.eq.high.gain + 26) / 32}
        onChange={v => setEqHigh(deckId, v * 32 - 26)}
        label="HI"
        color="#ef4444"
        centerDetent
      />
      <Knob
        value={(channel.eq.mid.gain + 26) / 32}
        onChange={v => setEqMid(deckId, v * 32 - 26)}
        label="MID"
        color="#22c55e"
        centerDetent
      />
      <Knob
        value={(channel.eq.low.gain + 26) / 32}
        onChange={v => setEqLow(deckId, v * 32 - 26)}
        label="LOW"
        color="#3b82f6"
        centerDetent
      />

      {/* Filter knob */}
      <Knob
        value={0.5}
        onChange={() => {}}
        label="FILTER"
        color="#f59e0b"
        centerDetent
      />

      {/* Headphone cue button */}
      <button
        onClick={() => setPflu(deckId, !channel.pfluActive)}
        className={`w-8 h-6 rounded text-[9px] font-bold uppercase transition-colors ${
          channel.pfluActive
            ? 'bg-yellow-400 text-black'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
        title="Pre-fader listen (headphone cue)"
      >
        CUE
      </button>

      {/* Channel fader */}
      <VerticalFader
        value={channel.faderLevel}
        onChange={v => setChannelFader(deckId, v)}
        height={100}
        color={color}
        label="VOL"
      />

      {/* Playing indicator */}
      <div
        className={`w-2 h-2 rounded-full transition-all ${
          isPlaying ? 'bg-green-400 shadow-[0_0_6px_#22c55e]' : 'bg-gray-600'
        }`}
      />
    </div>
  );
}

// ── Crossfader curve selector ─────────────────────────────────────────────────

const CROSSFADER_CURVES: { label: string; value: CrossfaderCurve }[] = [
  { label: 'Sharp', value: 'scratch' },
  { label: 'Smooth', value: 'constant_power' },
  { label: 'Linear', value: 'linear' },
  { label: 'Fast', value: 'fast' },
  { label: 'Slow', value: 'slow' },
];

// ── Main Mixer Component ──────────────────────────────────────────────────────

export function Mixer() {
  const mixer = useDJStore(s => s.mixer);
  const {
    setCrossfader, setCrossfaderCurve,
    setMasterVolume, setBoothVolume,
    setHeadphoneVolume, setSplitCue,
    setHeadphoneCueMix,
  } = useDJStore();

  const deckIds: DeckId[] = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-3 bg-gray-900 rounded-xl border border-gray-700/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold uppercase tracking-widest text-sm">Mixer</h2>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">
            {mixer.masterBpm ? `${mixer.masterBpm.toFixed(1)} BPM` : '-- BPM'}
          </span>
        </div>
      </div>

      {/* Channel strips */}
      <div className="flex gap-2 justify-center">
        {deckIds.map(id => (
          <ChannelStrip key={id} deckId={id} />
        ))}

        {/* Master strip */}
        <div className="flex flex-col items-center gap-2 px-3 py-3 bg-gray-800 rounded-lg border border-gray-600/50 ml-2">
          <div className="text-xs font-bold text-gray-300 px-3 py-0.5 rounded bg-gray-700 border border-gray-600">
            MASTER
          </div>
          <VUMeter dbLeft={mixer.masterMeterLeft} dbRight={mixer.masterMeterRight} height={100} />
          <Knob
            value={mixer.masterVolume / 1.5}
            onChange={v => setMasterVolume(v * 1.5)}
            label="VOL"
            color="#f59e0b"
          />
          <Knob
            value={mixer.boothVolume}
            onChange={v => setBoothVolume(v)}
            label="BOOTH"
            color="#6b7280"
          />
          <VerticalFader
            value={mixer.masterVolume / 1.5}
            onChange={v => setMasterVolume(v * 1.5)}
            height={100}
            color="#f59e0b"
            label="MASTER"
          />
        </div>

        {/* Headphone strip */}
        <div className="flex flex-col items-center gap-2 px-3 py-3 bg-gray-800 rounded-lg border border-gray-600/50">
          <div className="text-xs font-bold text-gray-300 px-3 py-0.5 rounded bg-gray-700 border border-gray-600">
            PHONES
          </div>
          <Knob
            value={mixer.headphoneVolume}
            onChange={v => setHeadphoneVolume(v)}
            label="VOL"
            color="#a855f7"
          />
          <Knob
            value={mixer.headphoneCueMix}
            onChange={v => setHeadphoneCueMix(v)}
            label="MIX"
            color="#a855f7"
            centerDetent
          />
          <button
            onClick={() => setSplitCue(!mixer.splitCue)}
            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
              mixer.splitCue
                ? 'bg-purple-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            SPLIT
          </button>
        </div>
      </div>

      {/* Crossfader section */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">Crossfader</span>
          <div className="flex gap-1">
            {CROSSFADER_CURVES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setCrossfaderCurve(value)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                  mixer.crossfaderCurve === value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-blue-400 text-xs font-bold">A</span>
          <HorizontalFader
            value={mixer.crossfader}
            onChange={v => setCrossfader(v)}
            width={300}
          />
          <span className="text-orange-400 text-xs font-bold">B</span>
          <span className="text-gray-500 font-mono text-xs w-12 text-right">
            {mixer.crossfader > 0 ? '+' : ''}{(mixer.crossfader * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default Mixer;
