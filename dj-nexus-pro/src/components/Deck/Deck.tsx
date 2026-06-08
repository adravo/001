// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Deck Component
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useState,
} from 'react';
import { useDJStore, selectDeck } from '../../store';
import type { DeckId, LoopSize } from '../../types';

// ── Constants ──────────────────────────────────────────────────────────────────

const LOOP_SIZES: LoopSize[] = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
const LOOP_SIZE_LABELS: Record<number, string> = {
  0.0625: '1/16',
  0.125: '1/8',
  0.25: '1/4',
  0.5: '1/2',
  1: '1',
  2: '2',
  4: '4',
  8: '8',
  16: '16',
  32: '32',
};

const HOT_CUE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
];

const BEAT_JUMP_SIZES = [1, 2, 4, 8, 16, 32];

const PITCH_RANGES = [
  { label: '±8%', value: 0.08 },
  { label: '±16%', value: 0.16 },
  { label: '±50%', value: 0.50 },
];

// ── Helper: format time ────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '-:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Knob sub-component ────────────────────────────────────────────────────────

interface KnobProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  color?: string;
  size?: number;
}

function Knob({ value, onChange, label, color = '#3b82f6', size = 40 }: KnobProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const angle = -135 + value * 270;

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

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const rad = (angle * Math.PI) / 180;
  const tipX = cx + r * Math.sin(rad);
  const tipY = cy - r * Math.cos(rad);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" style={{ width: size }}>
      <svg
        width={size}
        height={size}
        onMouseDown={onMouseDown}
        className="cursor-pointer"
        style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}
      >
        {/* Track arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="3" />
        {/* Value arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${(value * 270 / 360) * 2 * Math.PI * r} ${2 * Math.PI * r}`}
          strokeDashoffset={`${((-135 / 360) * 2 * Math.PI * r)}`}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        {/* Body */}
        <circle cx={cx} cy={cy} r={r - 4} fill="#1f2937" stroke="#4b5563" strokeWidth="1" />
        {/* Pointer */}
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Jog Wheel sub-component ────────────────────────────────────────────────────

interface JogWheelProps {
  deckId: DeckId;
  isPlaying: boolean;
  vinylMode: boolean;
  playbackRate: number;
}

function JogWheel({ deckId, isPlaying, vinylMode, playbackRate }: JogWheelProps) {
  const setNudge = useDJStore(s => s.setNudge);
  const isDragging = useRef(false);
  const lastAngle = useRef(0);
  const accumulated = useRef(0);
  const [rotation, setRotation] = useState(0);
  const animFrame = useRef<number>(0);

  // Animate platter rotation when playing
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setRotation(r => (r + (dt / 1000) * 360 * (playbackRate / 2)) % 360);
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame.current);
  }, [isPlaying, playbackRate]);

  const getAngle = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent, rect: DOMRect) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);

  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    accumulated.current = 0;
    const rect = svgRef.current!.getBoundingClientRect();
    lastAngle.current = getAngle(e, rect);
    e.preventDefault();
  }, [getAngle]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const angle = getAngle(e, rect);
      let delta = angle - lastAngle.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      lastAngle.current = angle;
      accumulated.current += delta;
      // Normalize: 360 degrees = 1 full rotation = nudge ±1
      const nudge = (delta / 360) * (vinylMode ? 3 : 1);
      setNudge(deckId, nudge);
      setRotation(r => r + delta);
    };
    const onUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setNudge(deckId, 0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [deckId, vinylMode, setNudge, getAngle]);

  const SIZE = 180;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = SIZE / 2 - 4;
  const innerR = outerR - 16;
  const gripR = outerR - 6;

  // Generate grip dots around the rim
  const gripDots = useMemo(() => {
    const dots = [];
    for (let i = 0; i < 36; i++) {
      const a = (i * 10 * Math.PI) / 180;
      const x = cx + gripR * Math.cos(a);
      const y = cy + gripR * Math.sin(a);
      dots.push(<circle key={i} cx={x} cy={y} r={1.5} fill="#4b5563" />);
    }
    return dots;
  }, [cx, cy, gripR]);

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        className="cursor-grab active:cursor-grabbing"
        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}
      >
        {/* Outer rim */}
        <circle cx={cx} cy={cy} r={outerR} fill="#0f1117" stroke="#374151" strokeWidth="2" />
        {/* Grip zone */}
        <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
          <circle cx={cx} cy={cy} r={gripR} fill="transparent" />
          {gripDots}
        </g>
        {/* Inner platter */}
        <circle cx={cx} cy={cy} r={innerR} fill="#111827" stroke="#374151" strokeWidth="1" />
        {/* Spinning label disc */}
        <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
          <circle cx={cx} cy={cy} r={innerR - 2} fill="#1a1f2e" />
          {/* Vinyl grooves */}
          {[20, 30, 40, 50].map(r => (
            <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth="0.5" />
          ))}
          {/* Center spindle */}
          <circle cx={cx} cy={cy} r={5} fill="#374151" />
          <circle cx={cx} cy={cy} r={2} fill="#6b7280" />
        </g>
        {/* Platter position indicator */}
        <line
          x1={cx}
          y1={cy - innerR + 2}
          x2={cx}
          y2={cy - innerR - 4}
          stroke={isPlaying ? '#22c55e' : '#ef4444'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ── Main Deck Component ────────────────────────────────────────────────────────

interface DeckProps {
  deckId: DeckId;
}

export function Deck({ deckId }: DeckProps) {
  const deck = useDJStore(selectDeck(deckId));
  const mixer = useDJStore(s => s.mixer);
  const channel = mixer.channels[deckId];
  const masterBpm = useDJStore(s => s.mixer.masterBpm);

  const {
    play, pause, stop, seek,
    setPlaybackRate, setPitch, setKeyLock,
    setSyncMode, setSyncMaster,
    jumpToHotCue, setHotCue,
    setLoopActive, setLoopSize,
    toggleSlipMode, setVinylMode,
    setChannelFader, setEqHigh, setEqMid, setEqLow,
  } = useDJStore();

  const [pitchRange, setPitchRange] = useState(0.08);

  const isPlaying = deck.playState === 'playing';
  const track = deck.track;
  const remaining = track ? Math.max(0, track.duration - deck.position) : 0;

  // Pitch slider: maps -pitchRange..+pitchRange to playbackRate 1-r..1+r
  const pitchPercent = useMemo(() => {
    const base = deck.playbackRate - 1;
    return Math.max(-1, Math.min(1, base / pitchRange));
  }, [deck.playbackRate, pitchRange]);

  const handlePitchSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const norm = parseFloat(e.target.value); // -1..1
    const rate = 1 + norm * pitchRange;
    setPlaybackRate(deckId, rate);
  }, [deckId, pitchRange, setPlaybackRate]);

  const handleTempoBend = useCallback((direction: 1 | -1) => {
    setPlaybackRate(deckId, deck.playbackRate + direction * 0.01);
  }, [deckId, deck.playbackRate, setPlaybackRate]);

  const handleBeatJump = useCallback((bars: number) => {
    if (!track) return;
    const bpm = track.bpm ?? 120;
    const secondsPerBar = (60 / bpm) * 4;
    seek(deckId, deck.position + bars * secondsPerBar);
  }, [deckId, deck.position, track, seek]);

  const bpmDisplay = useMemo(() => {
    if (!track?.bpm) return '--';
    return (track.bpm * deck.playbackRate).toFixed(1);
  }, [track, deck.playbackRate]);

  const syncActive = deck.syncMode !== 'none';

  return (
    <div
      className={`flex flex-col gap-2 bg-gray-900 border rounded-xl p-3 select-none ${
        deckId === 'A' || deckId === 'C' ? 'border-blue-500/30' : 'border-orange-500/30'
      }`}
      style={{ minWidth: 380 }}
    >
      {/* ── Deck header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg font-bold px-2 py-0.5 rounded ${
              deckId === 'A' || deckId === 'C'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            DECK {deckId}
          </span>
          {deck.isSyncMaster && (
            <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">MASTER</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => toggleSlipMode(deckId)}
            className={`px-2 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider transition-colors ${
              deck.slipMode
                ? 'bg-purple-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            SLIP
          </button>
          <button
            onClick={() => setVinylMode(deckId, !deck.vinylMode)}
            className={`px-2 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider transition-colors ${
              deck.vinylMode
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            VINYL
          </button>
          <button
            onClick={() => setKeyLock(deckId, !deck.keyLock)}
            className={`px-2 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider transition-colors ${
              deck.keyLock
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            KEY
          </button>
        </div>
      </div>

      {/* ── Track info ── */}
      <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-3 min-h-[56px]">
        {track ? (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{track.metadata.title || 'Unknown Title'}</p>
              <p className="text-gray-400 text-xs truncate">{track.metadata.artist || 'Unknown Artist'}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-green-400 font-mono font-bold text-sm">{bpmDisplay} BPM</span>
              {track.key && (
                <span className="text-purple-400 text-xs font-mono">
                  {track.key.note}{track.key.scale === 'minor' ? 'm' : ''} · {track.key.camelot}
                </span>
              )}
              <span className="text-yellow-400 font-mono text-xs">{formatTime(remaining)}</span>
            </div>
          </>
        ) : (
          <p className="text-gray-600 text-sm w-full text-center">No track loaded</p>
        )}
      </div>

      {/* ── Main controls row ── */}
      <div className="flex items-center gap-4 justify-between">
        {/* Jog wheel */}
        <JogWheel
          deckId={deckId}
          isPlaying={isPlaying}
          vinylMode={deck.vinylMode}
          playbackRate={deck.playbackRate}
        />

        {/* Controls column */}
        <div className="flex flex-col gap-2 flex-1">
          {/* Transport buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => stop(deckId)}
              className="flex-1 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              STOP
            </button>
            <button
              onClick={() => {
                if (track) seek(deckId, 0);
              }}
              className="flex-1 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              CUE
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => (isPlaying ? pause(deckId) : play(deckId))}
              className={`flex-1 py-3 rounded font-bold text-sm uppercase tracking-wider transition-colors ${
                isPlaying
                  ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>
          </div>

          {/* Sync button */}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (syncActive) {
                  setSyncMode(deckId, 'none');
                } else {
                  setSyncMode(deckId, 'beat');
                }
              }}
              className={`flex-1 py-1.5 rounded font-bold text-xs uppercase tracking-wider transition-colors ${
                syncActive
                  ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              SYNC
            </button>
            <button
              onClick={() => setSyncMaster(deckId)}
              className={`flex-1 py-1.5 rounded font-bold text-xs uppercase tracking-wider transition-colors ${
                deck.isSyncMaster
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              MASTER
            </button>
          </div>

          {/* Tempo bend */}
          <div className="flex gap-1.5">
            <button
              onMouseDown={() => handleTempoBend(-1)}
              className="flex-1 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold"
            >
              ◀◀
            </button>
            <span className="flex-1 text-center text-xs font-mono text-gray-400 py-1">
              {((deck.playbackRate - 1) * 100).toFixed(1)}%
            </span>
            <button
              onMouseDown={() => handleTempoBend(1)}
              className="flex-1 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold"
            >
              ▶▶
            </button>
          </div>
        </div>
      </div>

      {/* ── Pitch slider ── */}
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider w-10">PITCH</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.001"
          value={pitchPercent}
          onChange={handlePitchSlider}
          className="flex-1 h-2 appearance-none bg-gray-700 rounded-full accent-blue-500 cursor-pointer"
          style={{ writingMode: 'horizontal-tb' }}
        />
        <div className="flex gap-1">
          {PITCH_RANGES.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setPitchRange(value)}
              className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                pitchRange === value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loop controls ── */}
      <div className="bg-gray-800 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">Loop</span>
          <button
            onClick={() => setLoopActive(deckId, !deck.isLoopActive)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              deck.isLoopActive
                ? 'bg-green-500 text-white shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {deck.isLoopActive ? 'LOOP ON' : 'LOOP OFF'}
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {LOOP_SIZES.map(size => (
            <button
              key={size}
              onClick={() => setLoopSize(deckId, size)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                deck.loopSize === size
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {LOOP_SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Beat jump ── */}
      <div className="bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider block mb-1.5">Beat Jump</span>
        <div className="flex gap-1 flex-wrap">
          {BEAT_JUMP_SIZES.map(bars => (
            <React.Fragment key={bars}>
              <button
                onClick={() => handleBeatJump(-bars)}
                className="px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] font-mono transition-colors"
              >
                ←{bars}
              </button>
              <button
                onClick={() => handleBeatJump(bars)}
                className="px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] font-mono transition-colors"
              >
                {bars}→
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Hot cues ── */}
      <div className="bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider block mb-1.5">Hot Cues</span>
        <div className="grid grid-cols-8 gap-1">
          {deck.hotCues.map(({ slot, cue }) => {
            const color = cue?.color ?? HOT_CUE_COLORS[slot];
            const hasColor = !!cue;
            return (
              <button
                key={slot}
                onClick={() => {
                  if (cue) {
                    jumpToHotCue(deckId, slot);
                  } else if (track) {
                    const newCue = {
                      id: `${deckId}-cue-${slot}-${Date.now()}`,
                      trackId: track.id,
                      slot,
                      type: 'hot_cue' as const,
                      position: deck.position,
                      label: `${slot + 1}`,
                      color: HOT_CUE_COLORS[slot],
                      createdAt: Date.now(),
                    };
                    setHotCue(deckId, slot, newCue);
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  setHotCue(deckId, slot, null);
                }}
                className="relative py-2 rounded text-[10px] font-bold transition-all"
                style={{
                  backgroundColor: hasColor ? color + '33' : '#1f2937',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: hasColor ? color : '#374151',
                  color: hasColor ? color : '#6b7280',
                  boxShadow: hasColor ? `0 0 4px ${color}66` : 'none',
                }}
                title={cue ? `Hot Cue ${slot + 1}: ${formatTime(cue.position)}` : `Set Hot Cue ${slot + 1}`}
              >
                {slot + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── EQ Knobs ── */}
      <div className="bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider block mb-2">EQ</span>
        <div className="flex justify-around">
          <Knob
            value={(channel.eq.high.gain + 26) / 32}
            onChange={v => setEqHigh(deckId, v * 32 - 26)}
            label="HI"
            color="#ef4444"
          />
          <Knob
            value={(channel.eq.mid.gain + 26) / 32}
            onChange={v => setEqMid(deckId, v * 32 - 26)}
            label="MID"
            color="#22c55e"
          />
          <Knob
            value={(channel.eq.low.gain + 26) / 32}
            onChange={v => setEqLow(deckId, v * 32 - 26)}
            label="LOW"
            color="#3b82f6"
          />
          <Knob
            value={channel.faderLevel}
            onChange={v => setChannelFader(deckId, v)}
            label="VOL"
            color="#f59e0b"
          />
        </div>
      </div>
    </div>
  );
}

export default Deck;
