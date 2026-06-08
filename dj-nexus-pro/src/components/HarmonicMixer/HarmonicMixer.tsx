// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Harmonic Mixer / Camelot Wheel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useCallback, useState } from 'react';
import { useDJStore } from '../../store';
import { camelotCompatibilityScore } from '../../ai/AIEngine';

// ── Camelot data ──────────────────────────────────────────────────────────────

interface CamelotKey {
  camelot: string;     // e.g. "8A"
  musicalKey: string;  // e.g. "Ab minor"
  shortKey: string;    // e.g. "Ab"
  mode: 'A' | 'B';
  num: number;         // 1-12
}

const CAMELOT_KEYS: CamelotKey[] = [
  { camelot: '1A', musicalKey: 'Ab minor', shortKey: 'Ab', mode: 'A', num: 1 },
  { camelot: '1B', musicalKey: 'B major', shortKey: 'B', mode: 'B', num: 1 },
  { camelot: '2A', musicalKey: 'Eb minor', shortKey: 'Eb', mode: 'A', num: 2 },
  { camelot: '2B', musicalKey: 'F# major', shortKey: 'F#', mode: 'B', num: 2 },
  { camelot: '3A', musicalKey: 'Bb minor', shortKey: 'Bb', mode: 'A', num: 3 },
  { camelot: '3B', musicalKey: 'Db major', shortKey: 'Db', mode: 'B', num: 3 },
  { camelot: '4A', musicalKey: 'F minor', shortKey: 'F', mode: 'A', num: 4 },
  { camelot: '4B', musicalKey: 'Ab major', shortKey: 'Ab', mode: 'B', num: 4 },
  { camelot: '5A', musicalKey: 'C minor', shortKey: 'Cm', mode: 'A', num: 5 },
  { camelot: '5B', musicalKey: 'Eb major', shortKey: 'Eb', mode: 'B', num: 5 },
  { camelot: '6A', musicalKey: 'G minor', shortKey: 'Gm', mode: 'A', num: 6 },
  { camelot: '6B', musicalKey: 'Bb major', shortKey: 'Bb', mode: 'B', num: 6 },
  { camelot: '7A', musicalKey: 'D minor', shortKey: 'Dm', mode: 'A', num: 7 },
  { camelot: '7B', musicalKey: 'F major', shortKey: 'F', mode: 'B', num: 7 },
  { camelot: '8A', musicalKey: 'A minor', shortKey: 'Am', mode: 'A', num: 8 },
  { camelot: '8B', musicalKey: 'C major', shortKey: 'C', mode: 'B', num: 8 },
  { camelot: '9A', musicalKey: 'E minor', shortKey: 'Em', mode: 'A', num: 9 },
  { camelot: '9B', musicalKey: 'G major', shortKey: 'G', mode: 'B', num: 9 },
  { camelot: '10A', musicalKey: 'B minor', shortKey: 'Bm', mode: 'A', num: 10 },
  { camelot: '10B', musicalKey: 'D major', shortKey: 'D', mode: 'B', num: 10 },
  { camelot: '11A', musicalKey: 'F# minor', shortKey: 'F#m', mode: 'A', num: 11 },
  { camelot: '11B', musicalKey: 'A major', shortKey: 'A', mode: 'B', num: 11 },
  { camelot: '12A', musicalKey: 'Db minor', shortKey: 'Dbm', mode: 'A', num: 12 },
  { camelot: '12B', musicalKey: 'E major', shortKey: 'E', mode: 'B', num: 12 },
];

// ── Colour scheme ──────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<number, string> = {
  1: '#c0392b', 2: '#e74c3c', 3: '#e67e22', 4: '#f39c12',
  5: '#f1c40f', 6: '#2ecc71', 7: '#1abc9c', 8: '#3498db',
  9: '#2980b9', 10: '#9b59b6', 11: '#8e44ad', 12: '#e91e63',
};

// ── SVG geometry ──────────────────────────────────────────────────────────────

const SVG_SIZE = 340;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const INNER_RADIUS = 52;  // inner ring (A = minor)
const OUTER_RADIUS = 110; // outer ring (B = major)
const NUM_SECTORS = 12;

function polarToXY(angle: number, r: number): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function describeSectorPath(
  num: number, // 1..12
  innerR: number,
  outerR: number,
  gap = 2
): string {
  const sliceAngle = 360 / NUM_SECTORS;
  const startAngle = (num - 1) * sliceAngle + gap / 2;
  const endAngle = num * sliceAngle - gap / 2;

  const [x1, y1] = polarToXY(startAngle, innerR);
  const [x2, y2] = polarToXY(endAngle, innerR);
  const [x3, y3] = polarToXY(endAngle, outerR);
  const [x4, y4] = polarToXY(startAngle, outerR);
  const largeArc = sliceAngle > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

// ── Sector component ──────────────────────────────────────────────────────────

interface SectorProps {
  keyData: CamelotKey;
  isActive: boolean;
  isCompatible: boolean;
  isFiltered: boolean;
  isHovered: boolean;
  onHover: (camelot: string | null) => void;
  onClick: (camelot: string) => void;
}

const Sector: React.FC<SectorProps> = ({
  keyData,
  isActive,
  isCompatible,
  isFiltered,
  isHovered,
  onHover,
  onClick,
}) => {
  const { num, mode, camelot, shortKey } = keyData;
  const innerR = mode === 'A' ? INNER_RADIUS : INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) / 2;
  const outerR = mode === 'A' ? INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) / 2 : OUTER_RADIUS;

  const path = describeSectorPath(num, innerR, outerR, 3);
  const baseColor = SECTOR_COLORS[num] ?? '#555';

  let fill = '#2d3748';
  let opacity = 0.5;
  let strokeWidth = 1;
  let stroke = 'rgba(255,255,255,0.08)';

  if (isActive) {
    fill = baseColor;
    opacity = 1.0;
    stroke = 'white';
    strokeWidth = 2;
  } else if (isCompatible) {
    fill = baseColor;
    opacity = 0.65;
    stroke = 'rgba(255,255,255,0.3)';
    strokeWidth = 1.5;
  } else if (isFiltered) {
    fill = baseColor;
    opacity = 0.3;
  } else if (isHovered) {
    fill = baseColor;
    opacity = 0.8;
    stroke = 'rgba(255,255,255,0.4)';
  }

  // Label placement: midpoint angle of this sector
  const sliceAngle = 360 / NUM_SECTORS;
  const midAngle = (num - 1) * sliceAngle + sliceAngle / 2;
  const labelR = (innerR + outerR) / 2;
  const [lx, ly] = polarToXY(midAngle, labelR);

  return (
    <g
      onClick={() => onClick(camelot)}
      onMouseEnter={() => onHover(camelot)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      <path
        d={path}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={{ transition: 'all 0.15s ease' }}
      />
      <text
        x={lx}
        y={ly - 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isActive ? 11 : 9}
        fontWeight={isActive ? 'bold' : 'normal'}
        fill={isActive || isCompatible ? 'white' : 'rgba(255,255,255,0.5)'}
        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'monospace' }}
      >
        {camelot}
      </text>
      <text
        x={lx}
        y={ly + 7}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fill={isActive || isCompatible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {shortKey}
      </text>
    </g>
  );
};

// ── Compatibility legend ──────────────────────────────────────────────────────

const CompatibilityLegend: React.FC = () => (
  <div className="flex items-center gap-4 text-xs text-gray-400">
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm bg-blue-400 opacity-90" />
      <span>Playing now</span>
    </div>
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm bg-green-500 opacity-65" />
      <span>Compatible</span>
    </div>
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm bg-gray-600 opacity-30" />
      <span>Incompatible</span>
    </div>
  </div>
);

// ── Compatibility score display ────────────────────────────────────────────────

const CompatibilityBadge: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.round(score * 100);
  const color =
    pct >= 90 ? 'text-green-400 border-green-500/50'
    : pct >= 70 ? 'text-yellow-400 border-yellow-500/50'
    : pct >= 50 ? 'text-orange-400 border-orange-500/50'
    : 'text-red-400 border-red-500/50';

  const label =
    pct >= 90 ? 'Perfect Mix'
    : pct >= 70 ? 'Compatible'
    : pct >= 50 ? 'Caution'
    : 'Clash';

  return (
    <div className={`flex flex-col items-center border rounded px-2 py-1 ${color}`}>
      <span className="text-lg font-bold tabular-nums">{pct}%</span>
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

interface HarmonicMixerProps {
  onFilterByKey?: (compatibleKeys: string[]) => void;
}

export const HarmonicMixer: React.FC<HarmonicMixerProps> = ({ onFilterByKey }) => {
  const decks = useDJStore(s => s.decks);
  const setLibraryFilter = useDJStore(s => s.setLibraryFilter);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Determine active keys (from playing decks)
  const activeKeys = useMemo(() => {
    return Object.values(decks)
      .filter(d => d.playState === 'playing' && d.track?.key)
      .map(d => d.track!.key!.camelot);
  }, [decks]);

  // Primary active key: sync master or first playing deck
  const primaryActiveKey = useMemo(() => {
    const master = Object.values(decks).find(d => d.isSyncMaster && d.track?.key);
    if (master?.track?.key) return master.track.key.camelot;
    return activeKeys[0] ?? null;
  }, [decks, activeKeys]);

  const referenceKey = selectedKey ?? primaryActiveKey;

  // Compute compatibility for each key
  const compatibilityMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!referenceKey) return map;
    CAMELOT_KEYS.forEach(k => {
      map[k.camelot] = camelotCompatibilityScore(referenceKey, k.camelot);
    });
    return map;
  }, [referenceKey]);

  const compatibleKeys = useMemo(() => {
    return Object.entries(compatibilityMap)
      .filter(([, score]) => score >= 0.7)
      .map(([key]) => key);
  }, [compatibilityMap]);

  const handleSectorClick = useCallback((camelot: string) => {
    if (selectedKey === camelot) {
      // Deselect
      setSelectedKey(null);
      setLibraryFilter({ key: null });
      onFilterByKey?.([]);
    } else {
      setSelectedKey(camelot);
      setLibraryFilter({ key: camelot });
      // Compute compatible keys and pass to parent
      const compatible = CAMELOT_KEYS
        .filter(k => camelotCompatibilityScore(camelot, k.camelot) >= 0.7)
        .map(k => k.camelot);
      onFilterByKey?.(compatible);
    }
  }, [selectedKey, setLibraryFilter, onFilterByKey]);

  const hoveredKeyData = hoveredKey ? CAMELOT_KEYS.find(k => k.camelot === hoveredKey) : null;
  const hoveredScore = hoveredKey && referenceKey
    ? camelotCompatibilityScore(referenceKey, hoveredKey)
    : null;

  // Deck key info for sidebar
  const deckInfos = Object.values(decks)
    .filter(d => d.track)
    .map(d => ({
      id: d.id,
      title: d.track!.metadata.title,
      artist: d.track!.metadata.artist,
      camelot: d.track!.key?.camelot ?? null,
      note: d.track!.key ? `${d.track!.key.note} ${d.track!.key.scale === 'major' ? 'maj' : 'min'}` : null,
      isPlaying: d.playState === 'playing',
    }));

  return (
    <div className="flex gap-4 p-3 bg-gray-900 text-gray-200 h-full overflow-auto">
      {/* Wheel */}
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div className="text-sm font-semibold text-gray-300">Camelot Wheel</div>

        <div className="relative">
          <svg
            width={SVG_SIZE}
            height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            style={{ display: 'block' }}
          >
            {/* Background circle */}
            <circle cx={CX} cy={CY} r={OUTER_RADIUS + 6} fill="#111827" stroke="#374151" strokeWidth={1} />

            {/* Sector slices */}
            {CAMELOT_KEYS.map(key => (
              <Sector
                key={key.camelot}
                keyData={key}
                isActive={activeKeys.includes(key.camelot) || key.camelot === selectedKey}
                isCompatible={
                  referenceKey
                    ? key.camelot !== referenceKey && compatibilityMap[key.camelot] >= 0.7
                    : false
                }
                isFiltered={
                  referenceKey
                    ? compatibilityMap[key.camelot] < 0.3 && key.camelot !== referenceKey
                    : false
                }
                isHovered={key.camelot === hoveredKey}
                onHover={setHoveredKey}
                onClick={handleSectorClick}
              />
            ))}

            {/* Center hub */}
            <circle cx={CX} cy={CY} r={INNER_RADIUS - 2} fill="#111827" stroke="#374151" strokeWidth={1} />
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize={10} fill="#6b7280" style={{ userSelect: 'none' }}>
              Camelot
            </text>
            <text x={CX} y={CY + 8} textAnchor="middle" fontSize={10} fill="#6b7280" style={{ userSelect: 'none' }}>
              Wheel
            </text>

            {/* Inner / outer ring labels */}
            <text x={CX} y={CY + 24} textAnchor="middle" fontSize={8} fill="#4b5563" style={{ userSelect: 'none' }}>
              A=min B=maj
            </text>
          </svg>

          {/* Hovered key tooltip */}
          {hoveredKeyData && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white whitespace-nowrap z-10 pointer-events-none shadow-lg">
              <span className="font-mono font-bold">{hoveredKeyData.camelot}</span>
              {' — '}
              {hoveredKeyData.musicalKey}
              {hoveredScore !== null && referenceKey !== hoveredKey && (
                <span className="ml-2 text-gray-400">
                  {Math.round(hoveredScore * 100)}% compat.
                </span>
              )}
            </div>
          )}
        </div>

        <CompatibilityLegend />

        {selectedKey && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Filtering by key:</span>
            <span className="font-mono font-bold text-white">{selectedKey}</span>
            <button
              className="text-gray-500 hover:text-red-400"
              onClick={() => { setSelectedKey(null); setLibraryFilter({ key: null }); onFilterByKey?.([]); }}
            >
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      {/* Sidebar: deck info + compatibility scores */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
        {/* Deck key indicators */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Decks</div>
          {deckInfos.length === 0 && (
            <div className="text-xs text-gray-600">No tracks loaded</div>
          )}
          {deckInfos.map(deck => (
            <div
              key={deck.id}
              className={`flex items-center gap-3 p-2 rounded mb-1 border ${
                deck.isPlaying ? 'border-green-700/50 bg-green-900/20' : 'border-gray-700 bg-gray-800/50'
              }`}
            >
              <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                deck.isPlaying ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}>
                {deck.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-200 truncate">{deck.title || '—'}</div>
                <div className="text-[10px] text-gray-500 truncate">{deck.artist}</div>
              </div>
              {deck.camelot ? (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span
                    className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: SECTOR_COLORS[parseInt(deck.camelot, 10)] + '33',
                      color: SECTOR_COLORS[parseInt(deck.camelot, 10)] ?? '#aaa',
                      border: `1px solid ${SECTOR_COLORS[parseInt(deck.camelot, 10)] ?? '#555'}55`,
                    }}
                  >
                    {deck.camelot}
                  </span>
                  <span className="text-[10px] text-gray-500">{deck.note}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-600 flex-shrink-0">No key</span>
              )}
            </div>
          ))}
        </div>

        {/* Deck-to-deck compatibility matrix */}
        {deckInfos.filter(d => d.camelot).length >= 2 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Compatibility</div>
            <div className="flex flex-col gap-2">
              {deckInfos.filter(d => d.camelot).flatMap((a, ai, arr) =>
                arr.slice(ai + 1).filter(b => b.camelot).map(b => {
                  const score = camelotCompatibilityScore(a.camelot!, b.camelot!);
                  return (
                    <div key={`${a.id}-${b.id}`} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono">
                        Deck {a.id} ↔ Deck {b.id}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        ({a.camelot} ↔ {b.camelot})
                      </span>
                      <div className="flex-1 h-1.5 bg-gray-700 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${score * 100}%`,
                            backgroundColor:
                              score >= 0.9 ? '#22c55e' : score >= 0.7 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <CompatibilityBadge score={score} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Compatible keys list (when key selected/playing) */}
        {referenceKey && compatibleKeys.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Compatible with {referenceKey}
            </div>
            <div className="flex flex-wrap gap-2">
              {compatibleKeys.map(camelot => {
                const kd = CAMELOT_KEYS.find(k => k.camelot === camelot);
                const score = compatibilityMap[camelot];
                const color = SECTOR_COLORS[parseInt(camelot, 10)] ?? '#555';
                return (
                  <div
                    key={camelot}
                    className="flex flex-col items-center gap-0.5 px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ borderColor: color + '55', backgroundColor: color + '22' }}
                    onClick={() => handleSectorClick(camelot)}
                  >
                    <span className="font-mono text-xs font-bold" style={{ color }}>
                      {camelot}
                    </span>
                    <span className="text-[9px] text-gray-400">{kd?.shortKey}</span>
                    <span className="text-[9px] tabular-nums" style={{ color }}>
                      {Math.round(score * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Usage tip */}
        {!referenceKey && (
          <div className="text-xs text-gray-600 bg-gray-800 border border-gray-700 rounded p-3">
            <strong className="text-gray-500">Tip:</strong> Load a track to a deck and start playing it to see harmonic compatibility. Click a key on the wheel to filter the library.
          </div>
        )}
      </div>
    </div>
  );
};

export default HarmonicMixer;
