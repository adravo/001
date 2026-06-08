// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Musical Key Detector
// Uses a chromagram (12-bin pitch-class energy profile) built from the STFT,
// then correlates against Krumhansl-Schmuckler major/minor key profiles.
// Returns the detected key with Camelot and OpenKey notation.
// ─────────────────────────────────────────────────────────────────────────────

import type { MusicalKey, MusicalNote, ScaleType } from '../types';

// ── Pitch class constants ─────────────────────────────────────────────────────

const NOTE_NAMES: MusicalNote[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ── Camelot wheel mapping ─────────────────────────────────────────────────────
// Key: "C major", Value: "8B" (camelot), open key omitted for brevity

const CAMELOT: Record<string, string> = {
  'C major': '8B',  'G major': '9B',  'D major': '10B', 'A major': '11B',
  'E major': '12B', 'B major': '1B',  'F# major': '2B', 'C# major': '3B',
  'G# major': '4B', 'D# major': '5B', 'A# major': '6B', 'F major': '7B',
  'A minor': '8A',  'E minor': '9A',  'B minor': '10A', 'F# minor': '11A',
  'C# minor': '12A','G# minor': '1A', 'D# minor': '2A', 'A# minor': '3A',
  'F minor': '4A',  'C minor': '5A',  'G minor': '6A',  'D minor': '7A',
};

const OPEN_KEY: Record<string, string> = {
  'C major': '1d',  'G major': '2d',  'D major': '3d',  'A major': '4d',
  'E major': '5d',  'B major': '6d',  'F# major': '7d', 'C# major': '8d',
  'G# major': '9d', 'D# major': '10d','A# major': '11d','F major': '12d',
  'A minor': '1m',  'E minor': '2m',  'B minor': '3m',  'F# minor': '4m',
  'C# minor': '5m', 'G# minor': '6m', 'D# minor': '7m', 'A# minor': '8m',
  'F minor': '9m',  'C minor': '10m', 'G minor': '11m', 'D minor': '12m',
};

// ── Krumhansl-Schmuckler key profiles ─────────────────────────────────────────
// These are empirically derived tonal hierarchies for 12 pitch classes.
// The major profile starts from C; each key is a rotation of this template.

const KS_MAJOR: number[] = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR: number[] = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// ── KeyDetector ───────────────────────────────────────────────────────────────

export class KeyDetector {
  private readonly fftSize = 4096;
  private readonly hopSize = 2048;

  /**
   * Detect the musical key of an audio buffer.
   * Uses the whole track but weights the first and last 10% less
   * (intros/outros often introduce key-foreign material).
   */
  detect(audioBuffer: AudioBuffer): MusicalKey {
    const mono = this.toMono(audioBuffer);
    const chromagram = this.buildChromagram(mono, audioBuffer.sampleRate);
    const { note, scale, confidence } = this.matchKeyProfile(chromagram);

    const keyLabel = `${note} ${scale}`;
    return {
      note,
      scale,
      camelot: CAMELOT[keyLabel] ?? '',
      openKey: OPEN_KEY[keyLabel] ?? '',
    };
  }

  // ── Signal processing ────────────────────────────────────────────────────────

  private toMono(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const l = buffer.getChannelData(0);
    const r = buffer.getChannelData(1);
    const out = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
    return out;
  }

  // ── Chromagram ────────────────────────────────────────────────────────────────

  private buildChromagram(signal: Float32Array, sr: number): Float32Array {
    const chroma = new Float32Array(12);
    const window = this.hannWindow(this.fftSize);
    const totalFrames = Math.floor((signal.length - this.fftSize) / this.hopSize);
    const startFrame = Math.floor(totalFrames * 0.1);  // skip intro
    const endFrame = Math.floor(totalFrames * 0.9);    // skip outro

    for (let frame = startFrame; frame < endFrame; frame++) {
      const offset = frame * this.hopSize;
      const frameData = new Float32Array(this.fftSize);
      for (let i = 0; i < this.fftSize; i++) {
        frameData[i] = (signal[offset + i] ?? 0) * window[i];
      }

      const magnitudes = this.dftMagnitudes(frameData, sr);
      this.accumulateChroma(magnitudes, sr, chroma);
    }

    // Normalize to sum = 1 so we can compare profiles regardless of loudness
    const sum = chroma.reduce((s, v) => s + v, 0);
    if (sum > 0) {
      for (let i = 0; i < 12; i++) chroma[i] /= sum;
    }

    return chroma;
  }

  private dftMagnitudes(frame: Float32Array, sr: number): Map<number, number> {
    // Compute magnitude spectrum; return as Map<freq_hz → magnitude>
    const N = frame.length;
    const half = N / 2;
    const magnitudes = new Map<number, number>();

    // Only compute bins up to 4186 Hz (C8 — top of piano range)
    const maxBin = Math.ceil((4186 * N) / sr);

    for (let k = 1; k < Math.min(half, maxBin); k++) {
      let re = 0;
      let im = 0;
      // Goertzel-style: skip full DFT for performance by computing only needed bins
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        re += frame[n] * Math.cos(angle);
        im -= frame[n] * Math.sin(angle);
      }
      const freq = (k * sr) / N;
      const mag = Math.sqrt(re * re + im * im) / N;
      magnitudes.set(freq, mag);
    }

    return magnitudes;
  }

  private accumulateChroma(magnitudes: Map<number, number>, _sr: number, chroma: Float32Array): void {
    for (const [freq, mag] of magnitudes) {
      if (freq < 27.5) continue; // below A0

      // Map frequency to pitch class
      // MIDI note = 12 * log2(freq/440) + 69
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pitchClass] += mag;
    }
  }

  // ── Key profile matching ──────────────────────────────────────────────────────

  private matchKeyProfile(chroma: Float32Array): { note: MusicalNote; scale: ScaleType; confidence: number } {
    let bestCorr = -Infinity;
    let bestNote: MusicalNote = 'C';
    let bestScale: ScaleType = 'major';

    for (let root = 0; root < 12; root++) {
      const majorCorr = this.pearsonCorrelation(chroma, this.rotateProfile(KS_MAJOR, root));
      const minorCorr = this.pearsonCorrelation(chroma, this.rotateProfile(KS_MINOR, root));

      if (majorCorr > bestCorr) {
        bestCorr = majorCorr;
        bestNote = NOTE_NAMES[root];
        bestScale = 'major';
      }
      if (minorCorr > bestCorr) {
        bestCorr = minorCorr;
        bestNote = NOTE_NAMES[root];
        bestScale = 'minor';
      }
    }

    // Normalize correlation to 0..1 range (Pearson ranges from -1 to +1)
    const confidence = Math.max(0, (bestCorr + 1) / 2);

    return { note: bestNote, scale: bestScale, confidence };
  }

  // Rotate the key profile template so that index 0 represents the given root
  private rotateProfile(profile: number[], root: number): number[] {
    const rotated = new Array<number>(12);
    for (let i = 0; i < 12; i++) {
      rotated[i] = profile[(i + 12 - root) % 12];
    }
    return rotated;
  }

  private pearsonCorrelation(a: Float32Array, b: number[]): number {
    const n = 12;
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;

    let num = 0;
    let denomA = 0;
    let denomB = 0;

    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      num += da * db;
      denomA += da * da;
      denomB += db * db;
    }

    const denom = Math.sqrt(denomA * denomB);
    return denom === 0 ? 0 : num / denom;
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  private hannWindow(size: number): Float32Array {
    const w = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return w;
  }

  // ── Camelot compatibility helpers ─────────────────────────────────────────────

  /**
   * Returns the Camelot keys that are harmonically compatible with a given key.
   * Compatible = same number ±1, or inner/outer ring neighbor.
   */
  static getCompatibleKeys(camelotKey: string): string[] {
    const match = camelotKey.match(/^(\d+)([AB])$/);
    if (!match) return [];

    const num = parseInt(match[1]);
    const ring = match[2] as 'A' | 'B';
    const opposite = ring === 'A' ? 'B' : 'A';

    const compatible: string[] = [
      camelotKey,
      `${((num - 2 + 12) % 12) + 1}${ring}`,  // -1
      `${(num % 12) + 1}${ring}`,               // +1
      `${num}${opposite}`,                       // same number, other ring
    ];

    return compatible;
  }

  /**
   * Compute the harmonic distance between two Camelot keys (0 = identical).
   * Useful for track recommendations.
   */
  static camelotDistance(keyA: string, keyB: string): number {
    if (keyA === keyB) return 0;

    const matchA = keyA.match(/^(\d+)([AB])$/);
    const matchB = keyB.match(/^(\d+)([AB])$/);
    if (!matchA || !matchB) return Infinity;

    const numA = parseInt(matchA[1]);
    const numB = parseInt(matchB[1]);
    const ringA = matchA[2];
    const ringB = matchB[2];

    const ringPenalty = ringA !== ringB ? 1 : 0;
    const clockDiff = Math.min(
      Math.abs(numA - numB),
      12 - Math.abs(numA - numB)
    );

    return clockDiff + ringPenalty;
  }
}

export const keyDetector = new KeyDetector();
