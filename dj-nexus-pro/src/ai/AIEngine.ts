// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — AI Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { Track, MusicalKey, DeckId } from '../types';

// ── Camelot wheel adjacency ────────────────────────────────────────────────────

const CAMELOT_NUM_POSITIONS = 12;

/**
 * Returns a compatibility score 0..1 between two Camelot keys.
 * 1.0 = identical, 0.9 = perfect mix (adjacent or relative major/minor),
 * 0.5 = energy boost (+1 semitone), 0.0 = incompatible
 */
export function camelotCompatibilityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const numA = parseInt(a, 10);
  const modeA = a.slice(-1); // 'A' or 'B'
  const numB = parseInt(b, 10);
  const modeB = b.slice(-1);

  const diff = ((numB - numA + CAMELOT_NUM_POSITIONS) % CAMELOT_NUM_POSITIONS);

  // Same mode, adjacent position (±1)
  if (modeA === modeB && (diff === 1 || diff === CAMELOT_NUM_POSITIONS - 1)) return 0.9;

  // Relative major/minor swap (same number, different mode)
  if (numA === numB && modeA !== modeB) return 0.9;

  // Same mode, +2 positions (energy jump)
  if (modeA === modeB && diff === 2) return 0.5;

  // Same mode, +7 semitones / dominant key
  if (modeA === modeB && diff === 7) return 0.6;

  return 0.1;
}

// ── BPM compatibility ──────────────────────────────────────────────────────────

export function bpmCompatibilityScore(bpmA: number | null, bpmB: number | null): number {
  if (!bpmA || !bpmB) return 0.5;
  const ratio = bpmA > bpmB ? bpmA / bpmB : bpmB / bpmA;

  // Exact or near-exact
  if (ratio < 1.03) return 1.0;
  // ±6%
  if (ratio < 1.06) return 0.8;
  // Harmonic (2:1 / 1:2 doubling)
  if (Math.abs(ratio - 2.0) < 0.06 || Math.abs(ratio - 0.5) < 0.03) return 0.7;
  // ±10%
  if (ratio < 1.10) return 0.5;
  return Math.max(0, 1 - (ratio - 1));
}

// ── Energy scoring ────────────────────────────────────────────────────────────

export function energyCompatibilityScore(energyA: number | null, energyB: number | null): number {
  if (energyA === null || energyB === null) return 0.5;
  return 1 - Math.abs(energyA - energyB);
}

// ── Track similarity scoring ──────────────────────────────────────────────────

export interface TrackSimilarityScore {
  trackId: string;
  totalScore: number;
  keyScore: number;
  bpmScore: number;
  energyScore: number;
  genreScore: number;
}

export function scoreSimilarity(
  reference: Track,
  candidate: Track,
  weights = { key: 0.35, bpm: 0.30, energy: 0.20, genre: 0.15 }
): TrackSimilarityScore {
  const keyScore = camelotCompatibilityScore(
    reference.key?.camelot ?? '',
    candidate.key?.camelot ?? ''
  );
  const bpmScore = bpmCompatibilityScore(reference.bpm, candidate.bpm);
  const energyScore = energyCompatibilityScore(reference.energy, candidate.energy);
  const genreScore =
    reference.metadata.genre && candidate.metadata.genre
      ? reference.metadata.genre.toLowerCase() === candidate.metadata.genre.toLowerCase()
        ? 1.0
        : 0.2
      : 0.5;

  const totalScore =
    keyScore * weights.key +
    bpmScore * weights.bpm +
    energyScore * weights.energy +
    genreScore * weights.genre;

  return {
    trackId: candidate.id,
    totalScore,
    keyScore,
    bpmScore,
    energyScore,
    genreScore,
  };
}

// ── Recommendation engine ─────────────────────────────────────────────────────

export interface TrackRecommendation {
  track: Track;
  score: TrackSimilarityScore;
  reason: string;
}

export function recommendNextTracks(
  currentTrack: Track,
  library: Track[],
  options: {
    count?: number;
    excludeIds?: Set<string>;
    filterGenre?: string | null;
    energyDirection?: 'up' | 'down' | 'maintain';
  } = {}
): TrackRecommendation[] {
  const { count = 5, excludeIds = new Set(), filterGenre, energyDirection } = options;

  let candidates = library.filter(t => {
    if (t.id === currentTrack.id) return false;
    if (excludeIds.has(t.id)) return false;
    if (filterGenre && t.metadata.genre !== filterGenre) return false;
    return true;
  });

  // Apply energy direction preference
  if (energyDirection === 'up' && currentTrack.energy !== null) {
    candidates = candidates.filter(t => (t.energy ?? 0.5) >= (currentTrack.energy ?? 0.5) - 0.1);
  } else if (energyDirection === 'down' && currentTrack.energy !== null) {
    candidates = candidates.filter(t => (t.energy ?? 0.5) <= (currentTrack.energy ?? 0.5) + 0.1);
  }

  const scored = candidates.map(candidate => ({
    track: candidate,
    score: scoreSimilarity(currentTrack, candidate),
  }));

  scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return scored.slice(0, count).map(({ track, score }) => {
    let reason = '';
    if (score.keyScore >= 0.9) reason = 'Harmonically compatible';
    else if (score.bpmScore >= 0.9) reason = 'Perfect BPM match';
    else if (score.genreScore >= 1.0) reason = 'Same genre';
    else if (score.energyScore >= 0.9) reason = 'Similar energy';
    else reason = 'Good overall match';
    return { track, score, reason };
  });
}

// ── Playlist generation ────────────────────────────────────────────────────────

export interface PlaylistGenerationOptions {
  seedTrackId?: string;
  genre?: string;
  energyTarget?: number; // 0..1
  mood?: 'uplifting' | 'dark' | 'groovy' | 'chill' | 'peak';
  length?: number; // number of tracks
  energyArc?: 'flat' | 'rising' | 'drop' | 'wave';
  bpmRange?: [number, number];
}

export function generatePlaylist(
  library: Track[],
  options: PlaylistGenerationOptions = {}
): Track[] {
  const {
    seedTrackId,
    genre,
    energyTarget,
    mood,
    length = 20,
    energyArc = 'rising',
    bpmRange,
  } = options;

  let pool = [...library];

  // Filter by genre
  if (genre) pool = pool.filter(t => t.metadata.genre.toLowerCase().includes(genre.toLowerCase()));

  // Filter by BPM range
  if (bpmRange) {
    pool = pool.filter(t => {
      if (!t.bpm) return true;
      return t.bpm >= bpmRange[0] && t.bpm <= bpmRange[1];
    });
  }

  // Filter by mood (approximated via energy)
  if (mood) {
    const moodEnergyMap: Record<string, [number, number]> = {
      chill: [0, 0.3],
      groovy: [0.3, 0.6],
      uplifting: [0.5, 0.8],
      peak: [0.7, 1.0],
      dark: [0.4, 0.7],
    };
    const [lo, hi] = moodEnergyMap[mood] ?? [0, 1];
    pool = pool.filter(t => {
      const e = t.energy ?? 0.5;
      return e >= lo && e <= hi;
    });
  }

  if (pool.length === 0) return [];

  const result: Track[] = [];
  const usedIds = new Set<string>();

  // Pick seed track
  let current: Track | null = null;
  if (seedTrackId) {
    current = pool.find(t => t.id === seedTrackId) ?? pool[0];
  } else if (energyTarget !== undefined) {
    current = pool.reduce((best, t) => {
      const diff = Math.abs((t.energy ?? 0.5) - energyTarget);
      const bestDiff = Math.abs((best.energy ?? 0.5) - energyTarget);
      return diff < bestDiff ? t : best;
    }, pool[0]);
  } else {
    current = pool[Math.floor(Math.random() * pool.length)];
  }

  result.push(current);
  usedIds.add(current.id);

  for (let i = 1; i < length && i < pool.length; i++) {
    // Calculate target energy for this position based on arc
    let targetEnergy = current.energy ?? 0.5;
    if (energyArc === 'rising') {
      targetEnergy = (i / length) * 0.8;
    } else if (energyArc === 'drop') {
      targetEnergy = i < length / 2 ? (i / (length / 2)) : 1 - ((i - length / 2) / (length / 2));
    } else if (energyArc === 'wave') {
      targetEnergy = 0.4 + 0.4 * Math.sin((i / length) * Math.PI * 2);
    }

    const recs = recommendNextTracks(current, pool, {
      count: 3,
      excludeIds: usedIds,
      energyDirection: energyArc === 'rising' ? 'up' : energyArc === 'flat' ? 'maintain' : undefined,
    });

    // Pick from top recommendations with slight randomization
    const pick = recs[Math.floor(Math.random() * Math.min(recs.length, 3))];
    if (!pick) break;

    result.push(pick.track);
    usedIds.add(pick.track.id);
    current = pick.track;
  }

  return result;
}

// ── Auto-mix transition suggestions ──────────────────────────────────────────

export type TransitionType = 'eq_swap' | 'filter_sweep' | 'echo_out' | 'loop_exit' | 'cut' | 'blend';

export interface TransitionSuggestion {
  type: TransitionType;
  label: string;
  description: string;
  barsBeforeEnd: number; // when to start transition relative to outgoing track end
  confidence: number; // 0..1
}

export function suggestTransition(
  outgoing: Track,
  incoming: Track
): TransitionSuggestion[] {
  const suggestions: TransitionSuggestion[] = [];
  const keySimilarity = camelotCompatibilityScore(
    outgoing.key?.camelot ?? '',
    incoming.key?.camelot ?? ''
  );
  const bpmSim = bpmCompatibilityScore(outgoing.bpm, incoming.bpm);
  const energyDelta = (incoming.energy ?? 0.5) - (outgoing.energy ?? 0.5);

  // BPM compatible → smooth blend
  if (bpmSim >= 0.8) {
    suggestions.push({
      type: 'blend',
      label: 'EQ Swap Blend',
      description: 'Gradually swap EQ bands over 16 bars for a smooth harmonic mix.',
      barsBeforeEnd: 16,
      confidence: keySimilarity >= 0.8 ? 0.95 : 0.7,
    });
  }

  // High energy drop → echo out
  if (energyDelta < -0.2) {
    suggestions.push({
      type: 'echo_out',
      label: 'Echo Out',
      description: 'Apply echo effect and fade out for a dramatic energy drop.',
      barsBeforeEnd: 4,
      confidence: 0.85,
    });
  }

  // Key compatible → filter sweep
  if (keySimilarity >= 0.9) {
    suggestions.push({
      type: 'filter_sweep',
      label: 'Filter Sweep',
      description: 'Hi-pass filter sweep on outgoing, lo-pass lift on incoming.',
      barsBeforeEnd: 8,
      confidence: 0.80,
    });
  }

  // Loop exit for precise beat grids
  if (outgoing.beatGrid && incoming.beatGrid && bpmSim >= 0.95) {
    suggestions.push({
      type: 'loop_exit',
      label: 'Loop + Drop',
      description: 'Loop the last 2 bars of outgoing track then drop incoming on beat 1.',
      barsBeforeEnd: 2,
      confidence: 0.88,
    });
  }

  // Default: EQ swap
  if (suggestions.length === 0) {
    suggestions.push({
      type: 'eq_swap',
      label: 'Basic EQ Swap',
      description: 'Simple low-frequency swap over 8 bars.',
      barsBeforeEnd: 8,
      confidence: 0.6,
    });
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions;
}

// ── Energy curve analysis ─────────────────────────────────────────────────────

export interface EnergyCurvePoint {
  index: number;
  trackId: string;
  title: string;
  energy: number;
  bpm: number | null;
  key: string;
}

export interface EnergyCurveAnalysis {
  points: EnergyCurvePoint[];
  avgEnergy: number;
  peakIndex: number;
  dropIndex: number;
  trend: 'rising' | 'falling' | 'flat' | 'wave';
  warnings: string[];
}

export function analyzeEnergyCurve(tracks: Track[]): EnergyCurveAnalysis {
  if (tracks.length === 0) {
    return { points: [], avgEnergy: 0, peakIndex: 0, dropIndex: 0, trend: 'flat', warnings: [] };
  }

  const points: EnergyCurvePoint[] = tracks.map((t, i) => ({
    index: i,
    trackId: t.id,
    title: t.metadata.title,
    energy: t.energy ?? 0.5,
    bpm: t.bpm,
    key: t.key?.camelot ?? '?',
  }));

  const energies = points.map(p => p.energy);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const peakIndex = energies.indexOf(Math.max(...energies));
  const dropIndex = energies.indexOf(Math.min(...energies));

  // Determine trend using linear regression
  const n = energies.length;
  const xMean = (n - 1) / 2;
  const yMean = avgEnergy;
  const slope =
    energies.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0) /
    energies.reduce((sum, _y, x) => sum + (x - xMean) ** 2, 0);

  let trend: EnergyCurveAnalysis['trend'];
  if (Math.abs(slope) < 0.005) trend = 'flat';
  else if (slope > 0) trend = 'rising';
  else trend = 'falling';

  // Detect wave pattern
  const aboveAvg = energies.filter(e => e > avgEnergy).length;
  if (aboveAvg > n * 0.3 && aboveAvg < n * 0.7 && trend === 'flat') trend = 'wave';

  // Warnings
  const warnings: string[] = [];

  // Consecutive BPM jumps > 10%
  for (let i = 1; i < tracks.length; i++) {
    const a = tracks[i - 1].bpm;
    const b = tracks[i].bpm;
    if (a && b) {
      const ratio = Math.max(a, b) / Math.min(a, b);
      if (ratio > 1.10) {
        warnings.push(`Large BPM jump between tracks ${i} and ${i + 1}: ${a.toFixed(1)} → ${b.toFixed(1)}`);
      }
    }
  }

  // Consecutive key clashes
  for (let i = 1; i < tracks.length; i++) {
    const a = tracks[i - 1].key?.camelot;
    const b = tracks[i].key?.camelot;
    if (a && b && camelotCompatibilityScore(a, b) < 0.3) {
      warnings.push(`Key clash between tracks ${i} and ${i + 1}: ${a} → ${b}`);
    }
  }

  // Energy cliff (drop > 0.4 in one step)
  for (let i = 1; i < energies.length; i++) {
    if (energies[i - 1] - energies[i] > 0.4) {
      warnings.push(`Sudden energy drop at track ${i + 1}`);
    }
  }

  return { points, avgEnergy, peakIndex, dropIndex, trend, warnings };
}

// ── Main AIEngine class ────────────────────────────────────────────────────────

export class AIEngine {
  recommend(currentTrack: Track, library: Track[], count = 5): TrackRecommendation[] {
    return recommendNextTracks(currentTrack, library, { count });
  }

  generatePlaylist(library: Track[], options: PlaylistGenerationOptions = {}): Track[] {
    return generatePlaylist(library, options);
  }

  suggestTransition(outgoing: Track, incoming: Track): TransitionSuggestion[] {
    return suggestTransition(outgoing, incoming);
  }

  analyzeEnergyCurve(tracks: Track[]): EnergyCurveAnalysis {
    return analyzeEnergyCurve(tracks);
  }

  scoreTrackSimilarity(reference: Track, candidate: Track): TrackSimilarityScore {
    return scoreSimilarity(reference, candidate);
  }

  harmonicCompatibility(a: MusicalKey | null, b: MusicalKey | null): number {
    if (!a || !b) return 0;
    return camelotCompatibilityScore(a.camelot, b.camelot);
  }

  getCompatibleKeys(key: string): string[] {
    const num = parseInt(key, 10);
    const mode = key.slice(-1);
    const compatible: string[] = [key];

    // Adjacent same mode
    const prev = ((num - 2 + CAMELOT_NUM_POSITIONS) % CAMELOT_NUM_POSITIONS) + 1;
    const next = (num % CAMELOT_NUM_POSITIONS) + 1;
    compatible.push(`${prev}${mode}`, `${next}${mode}`);

    // Relative major/minor
    const oppositeMode = mode === 'A' ? 'B' : 'A';
    compatible.push(`${num}${oppositeMode}`);

    return [...new Set(compatible)];
  }
}

// Singleton
export const aiEngine = new AIEngine();
