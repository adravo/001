// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — BPM Detector
// Two-stage algorithm:
//   1. Onset detection using spectral flux (energy delta across frequency bins)
//   2. Autocorrelation of the onset strength signal to find period → BPM
// Also builds a beat grid from the detected BPM and onset positions.
// ─────────────────────────────────────────────────────────────────────────────

import type { BeatGrid, BeatMarker } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ── Constants ─────────────────────────────────────────────────────────────────

const FFT_SIZE = 2048;
const HOP_SIZE = 512;
// BPM search range covers most DJ-relevant material
const BPM_MIN = 60;
const BPM_MAX = 220;
// Minimum confidence before we accept a beat grid
const MIN_CONFIDENCE = 0.4;
// Downbeat detection: look for energy peaks that are markedly stronger than nearby beats
const DOWNBEAT_ENERGY_RATIO = 1.3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BPMResult {
  bpm: number;
  confidence: number;
  offset: number;     // beat 1 position in seconds
  beatGrid: BeatGrid;
}

export interface OnsetFrame {
  time: number;       // seconds
  strength: number;   // 0..1 normalized spectral flux
}

// ── BPMDetector ───────────────────────────────────────────────────────────────

export class BPMDetector {
  /**
   * Full analysis pipeline: decode → onset detection → autocorrelation → beat grid.
   * Runs synchronously on the raw PCM data (already decoded by the caller).
   */
  analyze(audioBuffer: AudioBuffer, trackId: string): BPMResult {
    const mono = this.toMono(audioBuffer);
    const sr = audioBuffer.sampleRate;

    const onsets = this.detectOnsets(mono, sr);
    if (onsets.length < 8) {
      return this.fallbackResult(trackId, sr);
    }

    const { bpm, confidence } = this.autocorrelationBPM(onsets, sr);
    const correctedBpm = this.harmonicCorrection(bpm);
    const offset = this.estimateDownbeat(onsets, correctedBpm);
    const beatGrid = this.buildBeatGrid(trackId, correctedBpm, offset, audioBuffer.duration, confidence, onsets);

    return { bpm: correctedBpm, confidence, offset, beatGrid };
  }

  // ── Signal preprocessing ─────────────────────────────────────────────────────

  private toMono(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0);
    }
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) * 0.5;
    }
    return mono;
  }

  // ── Onset detection using spectral flux ───────────────────────────────────────

  private detectOnsets(signal: Float32Array, sr: number): OnsetFrame[] {
    const frames = this.computeSTFT(signal, FFT_SIZE, HOP_SIZE);
    const fluxes: number[] = [];

    let prevMagnitudes: Float32Array | null = null;

    for (const frame of frames) {
      const magnitudes = this.computeMagnitudes(frame);

      if (prevMagnitudes) {
        // Half-wave rectified spectral flux: only count positive energy changes
        let flux = 0;
        for (let k = 0; k < magnitudes.length; k++) {
          const diff = magnitudes[k] - prevMagnitudes[k];
          if (diff > 0) flux += diff;
        }
        fluxes.push(flux);
      } else {
        fluxes.push(0);
      }

      prevMagnitudes = magnitudes;
    }

    // Normalize flux
    const maxFlux = Math.max(...fluxes) || 1;
    const normalized = fluxes.map(f => f / maxFlux);

    // Adaptive threshold: mean of local window
    const WINDOW = 10;
    const threshold = normalized.map((_, i) => {
      const start = Math.max(0, i - WINDOW);
      const end = Math.min(normalized.length, i + WINDOW);
      const local = normalized.slice(start, end);
      return local.reduce((s, v) => s + v, 0) / local.length * 1.5;
    });

    // Peak-picking with minimum distance constraint
    const onsets: OnsetFrame[] = [];
    const minDistFrames = Math.floor((sr / HOP_SIZE) * 0.05); // 50 ms min between onsets

    for (let i = 1; i < normalized.length - 1; i++) {
      if (
        normalized[i] > threshold[i] &&
        normalized[i] > normalized[i - 1] &&
        normalized[i] >= normalized[i + 1]
      ) {
        const time = (i * HOP_SIZE) / sr;
        // Enforce minimum distance
        if (onsets.length === 0 || time - onsets[onsets.length - 1].time > (minDistFrames * HOP_SIZE / sr)) {
          onsets.push({ time, strength: normalized[i] });
        }
      }
    }

    return onsets;
  }

  // ── Short-time Fourier Transform (DFT approximation) ─────────────────────────

  private computeSTFT(signal: Float32Array, fftSize: number, hopSize: number): Float32Array[] {
    const frames: Float32Array[] = [];
    const window = this.hannWindow(fftSize);

    for (let i = 0; i + fftSize <= signal.length; i += hopSize) {
      const frame = new Float32Array(fftSize);
      for (let j = 0; j < fftSize; j++) {
        frame[j] = signal[i + j] * window[j];
      }
      frames.push(frame);
    }

    return frames;
  }

  private hannWindow(size: number): Float32Array {
    const w = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return w;
  }

  private computeMagnitudes(frame: Float32Array): Float32Array {
    // Simple DFT magnitude calculation for first half of spectrum
    const N = frame.length;
    const half = N / 2;
    const magnitudes = new Float32Array(half);

    for (let k = 0; k < half; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        re += frame[n] * Math.cos(angle);
        im -= frame[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(re * re + im * im) / N;
    }

    return magnitudes;
  }

  // ── Autocorrelation-based tempo estimation ────────────────────────────────────

  private autocorrelationBPM(onsets: OnsetFrame[], sr: number): { bpm: number; confidence: number } {
    if (onsets.length < 4) return { bpm: 120, confidence: 0 };

    // Build an onset strength signal on a fixed time grid
    const frameDuration = HOP_SIZE / sr;
    const totalDuration = onsets[onsets.length - 1].time + 0.1;
    const nFrames = Math.ceil(totalDuration / frameDuration);
    const odf = new Float32Array(nFrames);

    for (const onset of onsets) {
      const idx = Math.round(onset.time / frameDuration);
      if (idx < nFrames) odf[idx] = Math.max(odf[idx], onset.strength);
    }

    // Autocorrelation over the lag range corresponding to BPM_MIN..BPM_MAX
    const lagMin = Math.floor(sr / (BPM_MAX / 60) / HOP_SIZE);
    const lagMax = Math.ceil(sr / (BPM_MIN / 60) / HOP_SIZE);

    let bestLag = lagMin;
    let bestCorr = -Infinity;

    for (let lag = lagMin; lag <= lagMax; lag++) {
      let corr = 0;
      let norm = 0;
      for (let i = 0; i + lag < nFrames; i++) {
        corr += odf[i] * odf[i + lag];
        norm += odf[i] * odf[i];
      }
      if (norm > 0) corr /= norm;

      // Also check harmonics: a lag at half the period should also correlate
      const halfLag = Math.round(lag / 2);
      if (halfLag >= lagMin) {
        let halfCorr = 0;
        let halfNorm = 0;
        for (let i = 0; i + halfLag < nFrames; i++) {
          halfCorr += odf[i] * odf[i + halfLag];
          halfNorm += odf[i] * odf[i];
        }
        if (halfNorm > 0) corr += (halfCorr / halfNorm) * 0.3;
      }

      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    const bpm = 60 / (bestLag * HOP_SIZE / sr);
    // Normalize confidence to 0..1 (empirically calibrated)
    const confidence = Math.min(1, bestCorr * 2);

    return { bpm: Math.round(bpm * 100) / 100, confidence };
  }

  // ── Harmonic correction ───────────────────────────────────────────────────────
  // Autocorrelation may detect half or double the actual BPM.
  // Fold into a "canonical" range by doubling/halving until within bounds.

  private harmonicCorrection(bpm: number): number {
    const TARGET_MIN = 80;
    const TARGET_MAX = 175;

    let corrected = bpm;
    while (corrected < TARGET_MIN && corrected * 2 <= BPM_MAX) corrected *= 2;
    while (corrected > TARGET_MAX && corrected / 2 >= BPM_MIN) corrected /= 2;

    return Math.round(corrected * 100) / 100;
  }

  // ── Beat grid construction ────────────────────────────────────────────────────

  private estimateDownbeat(onsets: OnsetFrame[], bpm: number): number {
    // Find the onset closest to t=0 that aligns with the detected BPM grid
    const beatDuration = 60 / bpm;
    if (onsets.length === 0) return 0;

    let bestOffset = onsets[0].time;
    let bestScore = -Infinity;

    // Try each strong onset as a candidate for beat 1
    const strongOnsets = onsets.filter(o => o.strength > 0.5).slice(0, 20);
    for (const candidate of strongOnsets) {
      let score = 0;
      for (const onset of onsets) {
        const phase = ((onset.time - candidate.time) / beatDuration) % 1;
        const alignedPhase = Math.min(phase, 1 - phase);
        // Reward onsets that fall close to expected beat positions
        score += onset.strength * (1 - alignedPhase * 2);
      }
      if (score > bestScore) {
        bestScore = score;
        bestOffset = candidate.time;
      }
    }

    // Adjust offset to be the first beat before the analysis start
    while (bestOffset > 0) bestOffset -= beatDuration;
    bestOffset += beatDuration;

    return Math.max(0, bestOffset);
  }

  private buildBeatGrid(
    trackId: string,
    bpm: number,
    offset: number,
    duration: number,
    confidence: number,
    onsets: OnsetFrame[]
  ): BeatGrid {
    const beatDuration = 60 / bpm;
    const markers: BeatMarker[] = [];
    let beatNumber = 1;
    let pos = offset;

    while (pos < duration) {
      // Find the nearest onset to this expected beat position
      const nearest = onsets.reduce((best, onset) => {
        return Math.abs(onset.time - pos) < Math.abs(best.time - pos) ? onset : best;
      }, { time: pos, strength: 0 });

      // If onset is very close, snap to it for better feel
      const snapped = Math.abs(nearest.time - pos) < beatDuration * 0.1 ? nearest.time : pos;

      // Detect downbeats by checking if this beat is significantly stronger than its neighbors
      const localBeats = onsets.filter(o => Math.abs(o.time - snapped) < beatDuration * 4);
      const avgStrength = localBeats.reduce((s, o) => s + o.strength, 0) / Math.max(1, localBeats.length);
      const isDownbeat = beatNumber === 1 || (nearest.strength > avgStrength * DOWNBEAT_ENERGY_RATIO && beatNumber % 4 === 1);

      markers.push({
        position: snapped,
        beatNumber: ((beatNumber - 1) % 4) + 1, // 1-4 within a bar
        isDownbeat: beatNumber % 4 === 1,
        confidence: isDownbeat ? Math.min(1, nearest.strength + 0.2) : nearest.strength,
      });

      pos += beatDuration;
      beatNumber++;
    }

    return {
      trackId,
      bpm,
      offset,
      algorithm: 'autocorrelation',
      confidence,
      markers,
      isManuallyEdited: false,
      lastAnalyzed: Date.now(),
    };
  }

  // ── Fallback for tracks with insufficient onset data ──────────────────────────

  private fallbackResult(trackId: string, _sr: number): BPMResult {
    const bpm = 120;
    const offset = 0;
    const beatGrid: BeatGrid = {
      trackId,
      bpm,
      offset,
      algorithm: 'autocorrelation',
      confidence: 0,
      markers: [],
      isManuallyEdited: false,
      lastAnalyzed: Date.now(),
    };
    return { bpm, confidence: 0, offset, beatGrid };
  }

  // ── Phase-lock utility (for sync engine) ─────────────────────────────────────

  /**
   * Given a target BPM and master beat phase, compute the playback rate adjustment
   * needed to phase-lock this deck to the master clock.
   */
  computeSyncRate(
    deckBpm: number,
    masterBpm: number,
    deckPhase: number,   // 0..1 within the current beat
    masterPhase: number, // 0..1 within the current beat
    strength = 0.1
  ): number {
    const tempoRatio = masterBpm / deckBpm;

    // Phase error: how far ahead/behind the deck is relative to the master
    let phaseError = masterPhase - deckPhase;
    if (phaseError > 0.5) phaseError -= 1;
    if (phaseError < -0.5) phaseError += 1;

    // Proportional controller: small nudge toward zero phase error
    const correction = phaseError * strength;
    return tempoRatio + correction;
  }
}

export const bpmDetector = new BPMDetector();
