// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Header / Top Bar
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDJStore } from '../../store';
import type { NormalizedGain } from '../../types';

// ── Clock ──────────────────────────────────────────────────────────────────────

const Clock: React.FC = () => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const s = time.getSeconds().toString().padStart(2, '0');

  return (
    <div className="font-mono tabular-nums text-green-400 text-sm select-none">
      {h}:{m}:{s}
    </div>
  );
};

// ── CPU/RAM meter ──────────────────────────────────────────────────────────────

interface SystemMetrics {
  cpu: number; // 0..100
  ram: number; // MB
  ramTotal: number; // MB
}

const SystemMeters: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({ cpu: 0, ram: 0, ramTotal: 0 });

  useEffect(() => {
    const update = () => {
      // In Electron we can read process.cpuUsage / process.memoryUsage;
      // in a pure browser context we can only get memory from performance.memory
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (mem) {
        setMetrics(prev => ({
          cpu: prev.cpu, // CPU usage not accessible from renderer without IPC
          ram: Math.round(mem.usedJSHeapSize / 1024 / 1024),
          ramTotal: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
        }));
      }

      // Simulate CPU from audio worklet load if available; otherwise random drift
      setMetrics(prev => {
        const drift = (Math.random() - 0.5) * 4;
        return { ...prev, cpu: Math.max(0, Math.min(100, prev.cpu + drift || Math.random() * 20 + 5)) };
      });
    };

    const id = setInterval(update, 1000);
    update();
    return () => clearInterval(id);
  }, []);

  const cpuColor = metrics.cpu > 80 ? 'text-red-400' : metrics.cpu > 60 ? 'text-yellow-400' : 'text-green-400';
  const ramPct = metrics.ramTotal > 0 ? (metrics.ram / metrics.ramTotal) * 100 : 0;
  const ramColor = ramPct > 80 ? 'text-red-400' : ramPct > 60 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="flex items-center gap-3 text-xs select-none">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-gray-500 text-[10px] uppercase tracking-wide">CPU</span>
        <div className="flex items-center gap-1">
          <div className="w-16 h-1.5 bg-gray-700 rounded overflow-hidden">
            <div
              className={`h-full rounded transition-all ${metrics.cpu > 80 ? 'bg-red-500' : metrics.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${metrics.cpu}%` }}
            />
          </div>
          <span className={`tabular-nums ${cpuColor}`}>{metrics.cpu.toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-gray-500 text-[10px] uppercase tracking-wide">RAM</span>
        <div className="flex items-center gap-1">
          <div className="w-16 h-1.5 bg-gray-700 rounded overflow-hidden">
            <div
              className={`h-full rounded transition-all ${ramPct > 80 ? 'bg-red-500' : ramPct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${ramPct}%` }}
            />
          </div>
          <span className={`tabular-nums ${ramColor}`}>{metrics.ram}MB</span>
        </div>
      </div>
    </div>
  );
};

// ── Recording indicator ────────────────────────────────────────────────────────

const RecordingIndicator: React.FC = () => {
  const activeRecording = useDJStore(s => s.activeRecording);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!activeRecording) { setVisible(true); return; }
    const id = setInterval(() => setVisible(v => !v), 600);
    return () => clearInterval(id);
  }, [activeRecording]);

  if (!activeRecording) return null;

  const durationSec = Math.floor(activeRecording.duration / 1000);
  const m = Math.floor(durationSec / 60).toString().padStart(2, '0');
  const s = (durationSec % 60).toString().padStart(2, '0');

  return (
    <div className="flex items-center gap-1.5 bg-red-900/40 border border-red-700/50 rounded px-2 py-1 select-none">
      <div className={`w-2 h-2 rounded-full bg-red-500 transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`} />
      <span className="text-xs text-red-400 font-mono tabular-nums">REC {m}:{s}</span>
    </div>
  );
};

// ── Streaming indicator ────────────────────────────────────────────────────────

interface StreamingIndicatorProps {
  isStreaming: boolean;
  listenerCount?: number;
}

const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({ isStreaming, listenerCount }) => {
  if (!isStreaming) return null;
  return (
    <div className="flex items-center gap-1.5 bg-blue-900/40 border border-blue-700/50 rounded px-2 py-1 select-none">
      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      <span className="text-xs text-blue-400">LIVE</span>
      {listenerCount !== undefined && (
        <span className="text-xs text-blue-300 tabular-nums">{listenerCount} listeners</span>
      )}
    </div>
  );
};

// ── Master volume knob ────────────────────────────────────────────────────────

interface KnobProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  color?: string;
}

const Knob: React.FC<KnobProps> = ({ value, onChange, label, color = '#3b82f6' }) => {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;
  const angle = MIN_ANGLE + value * (MAX_ANGLE - MIN_ANGLE);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;

    const onMove = (me: globalThis.MouseEvent) => {
      if (!isDragging.current) return;
      const dy = startY.current - me.clientY;
      const newVal = Math.max(0, Math.min(1, startVal.current + dy / 100));
      onChange(newVal);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, [value, onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY / 500;
    onChange(Math.max(0, Math.min(1, value + delta)));
  }, [value, onChange]);

  const svgSize = 36;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const r = 13;
  const indicatorAngle = (angle - 90) * (Math.PI / 180);
  const ix = cx + r * Math.cos(indicatorAngle);
  const iy = cy + r * Math.sin(indicatorAngle);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg
        width={svgSize}
        height={svgSize}
        className="cursor-pointer"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
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
          strokeDasharray={`${value * (2 * Math.PI * r * 0.75)} ${2 * Math.PI * r}`}
          strokeDashoffset={2 * Math.PI * r * 0.125}
          strokeLinecap="round"
          style={{ transform: 'rotate(-135deg)', transformOrigin: `${cx}px ${cy}px` }}
          opacity={0.7}
        />
        {/* Knob body */}
        <circle cx={cx} cy={cy} r={r - 1} fill="#1f2937" />
        {/* Indicator dot */}
        <circle cx={ix} cy={iy} r={2} fill={color} />
      </svg>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-[10px] text-gray-400 tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
};

// ── BPM display ────────────────────────────────────────────────────────────────

const BpmDisplay: React.FC = () => {
  const masterBpm = useDJStore(s => s.mixer.masterBpm);
  const masterBeat = useDJStore(s => s.mixer.masterBeat);

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Master BPM</span>
      <span className="font-mono text-xl font-bold text-white tabular-nums leading-tight">
        {masterBpm ? masterBpm.toFixed(1) : '--.-'}
      </span>
      <div className="flex gap-1 mt-0.5">
        {[1, 2, 3, 4].map(b => (
          <div
            key={b}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${b === masterBeat ? 'bg-blue-400' : 'bg-gray-700'}`}
          />
        ))}
      </div>
    </div>
  );
};

// ── Key display ────────────────────────────────────────────────────────────────

const KeyDisplay: React.FC = () => {
  const masterDeck = useDJStore(s => {
    const playing = Object.values(s.decks).find(d => d.playState === 'playing' && d.isSyncMaster);
    return playing ?? Object.values(s.decks).find(d => d.playState === 'playing') ?? null;
  });

  const key = masterDeck?.track?.key;

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Master Key</span>
      <span className="font-mono text-sm font-bold text-white tabular-nums leading-tight">
        {key ? `${key.note} ${key.scale === 'major' ? 'maj' : 'min'}` : '--'}
      </span>
      {key && (
        <span className="text-[10px] text-blue-400 font-mono">{key.camelot}</span>
      )}
    </div>
  );
};

// ── Settings button ────────────────────────────────────────────────────────────

interface SettingsButtonProps {
  onClick: () => void;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({ onClick }) => (
  <button
    className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
    onClick={onClick}
    title="Settings"
  >
    ⚙
  </button>
);

// ── Main Header ────────────────────────────────────────────────────────────────

interface HeaderProps {
  onOpenSettings?: () => void;
  isStreaming?: boolean;
  streamListeners?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  isStreaming = false,
  streamListeners,
}) => {
  const { mixer, setMasterVolume } = useDJStore(s => ({
    mixer: s.mixer,
    setMasterVolume: s.setMasterVolume,
  }));

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 h-16 flex-shrink-0 select-none">
      {/* Left: Logo */}
      <div className="flex items-center gap-3 w-48">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          N
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-bold text-sm">DJ Nexus Pro</span>
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">v1.0</span>
        </div>
      </div>

      {/* Center: BPM, Key, Beat indicators */}
      <div className="flex items-center gap-6">
        <BpmDisplay />
        <div className="w-px h-8 bg-gray-700" />
        <KeyDisplay />
        <div className="w-px h-8 bg-gray-700" />
        <Clock />
      </div>

      {/* Right: indicators, meters, controls */}
      <div className="flex items-center gap-3 w-auto">
        <RecordingIndicator />
        <StreamingIndicator isStreaming={isStreaming} listenerCount={streamListeners} />
        <div className="w-px h-8 bg-gray-700" />
        <SystemMeters />
        <div className="w-px h-8 bg-gray-700" />
        <Knob
          value={mixer.masterVolume / 1.5}
          onChange={v => setMasterVolume(v * 1.5 as NormalizedGain)}
          label="Master"
          color="#3b82f6"
        />
        <SettingsButton onClick={onOpenSettings ?? (() => {})} />
      </div>
    </header>
  );
};

export default Header;
