// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — AI Stem Separator
// Uses ONNX Runtime (Web or Node depending on execution context) to run an
// inference-time stem separation model (e.g. Demucs-style 4-stem).
// The model is expected to accept a mono or stereo Float32 tensor of shape
// [batch=1, channels=2, samples] and output [batch=1, stems=4, channels=2, samples].
// ─────────────────────────────────────────────────────────────────────────────

import type { StemType, TrackStems, Stem } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StemSeparationResult {
  stems: Record<StemType, Float32Array[]>; // stem type → [left, right] channel arrays
  sampleRate: number;
  modelVersion: string;
}

export interface StemSeparatorOptions {
  modelPath: string;
  /** Chunk duration in seconds (long tracks are processed in overlapping chunks) */
  chunkDuration?: number;
  /** Overlap between chunks as a fraction of chunk duration */
  overlapRatio?: number;
  /** Progress callback called with fraction 0..1 */
  onProgress?: (progress: number) => void;
  /** Signal to cancel in-flight separation */
  signal?: AbortSignal;
}

// Stem index as output by the model (order matches Demucs convention)
const STEM_ORDER: StemType[] = ['drums', 'bass', 'other', 'vocals'];

// ── StemSeparator ─────────────────────────────────────────────────────────────

export class StemSeparator {
  private session: OrtSession | null = null;
  private modelPath = '';
  private modelVersion = 'unknown';
  private isLoading = false;

  // ── ONNX session management ───────────────────────────────────────────────────

  async loadModel(modelPath: string): Promise<void> {
    if (this.modelPath === modelPath && this.session) return;
    if (this.isLoading) throw new Error('Model is already loading');

    this.isLoading = true;
    this.modelPath = modelPath;

    try {
      const ort = await this.importOrt();
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: this.getExecutionProviders(),
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true,
        enableMemPattern: true,
      });

      // Extract version from model metadata if available
      const meta = this.session.handler?.sessionOptions ?? {};
      this.modelVersion = (meta as Record<string, string>)['version'] ?? '1.0.0';
    } finally {
      this.isLoading = false;
    }
  }

  isReady(): boolean { return this.session !== null; }

  dispose(): void {
    this.session?.release?.();
    this.session = null;
  }

  // ── Separation pipeline ───────────────────────────────────────────────────────

  async separate(
    audioBuffer: AudioBuffer,
    options: StemSeparatorOptions
  ): Promise<StemSeparationResult> {
    if (!this.session) {
      await this.loadModel(options.modelPath);
    }

    const chunkDuration = options.chunkDuration ?? 8.0;
    const overlapRatio = options.overlapRatio ?? 0.25;
    const onProgress = options.onProgress ?? (() => {});
    const signal = options.signal;

    const sr = audioBuffer.sampleRate;
    const chunkSamples = Math.floor(chunkDuration * sr);
    const overlapSamples = Math.floor(chunkSamples * overlapRatio);
    const hopSamples = chunkSamples - overlapSamples;

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const totalSamples = left.length;

    // Initialize output accumulators (one per stem, stereo)
    const stemOutputsL: Record<StemType, Float32Array> = {} as Record<StemType, Float32Array>;
    const stemOutputsR: Record<StemType, Float32Array> = {} as Record<StemType, Float32Array>;
    const weightBuffer = new Float32Array(totalSamples);

    for (const stemType of STEM_ORDER) {
      stemOutputsL[stemType] = new Float32Array(totalSamples);
      stemOutputsR[stemType] = new Float32Array(totalSamples);
    }

    // Build a cross-fade window for overlap-add reconstruction
    const fadeWindow = this.buildCrossfadeWindow(chunkSamples, overlapSamples);

    let chunkStart = 0;
    let chunkIndex = 0;
    const totalChunks = Math.ceil(totalSamples / hopSamples);

    while (chunkStart < totalSamples) {
      if (signal?.aborted) {
        throw new DOMException('Stem separation cancelled', 'AbortError');
      }

      const chunkEnd = Math.min(chunkStart + chunkSamples, totalSamples);
      const actualChunkSize = chunkEnd - chunkStart;

      // Pad to chunkSamples if at end of track
      const chunkL = new Float32Array(chunkSamples);
      const chunkR = new Float32Array(chunkSamples);
      chunkL.set(left.subarray(chunkStart, chunkEnd));
      chunkR.set(right.subarray(chunkStart, chunkEnd));

      const chunkStems = await this.inferChunk(chunkL, chunkR);

      // Overlap-add into output buffers
      for (const stemType of STEM_ORDER) {
        const stemL = chunkStems[stemType][0];
        const stemR = chunkStems[stemType][1];
        for (let i = 0; i < actualChunkSize; i++) {
          const outIdx = chunkStart + i;
          stemOutputsL[stemType][outIdx] += stemL[i] * fadeWindow[i];
          stemOutputsR[stemType][outIdx] += stemR[i] * fadeWindow[i];
        }
      }

      for (let i = 0; i < actualChunkSize; i++) {
        weightBuffer[chunkStart + i] += fadeWindow[i];
      }

      chunkStart += hopSamples;
      chunkIndex++;
      onProgress(Math.min(1, chunkIndex / totalChunks));
    }

    // Normalize by accumulated weights (overlap-add normalization)
    for (const stemType of STEM_ORDER) {
      for (let i = 0; i < totalSamples; i++) {
        const w = weightBuffer[i];
        if (w > 0) {
          stemOutputsL[stemType][i] /= w;
          stemOutputsR[stemType][i] /= w;
        }
      }
    }

    const stems: Record<StemType, Float32Array[]> = {
      drums: [stemOutputsL.drums, stemOutputsR.drums],
      bass: [stemOutputsL.bass, stemOutputsR.bass],
      other: [stemOutputsL.other, stemOutputsR.other],
      vocals: [stemOutputsL.vocals, stemOutputsR.vocals],
      melody: [stemOutputsL.other, stemOutputsR.other], // melody = "other" in 4-stem model
    };

    onProgress(1);

    return {
      stems,
      sampleRate: sr,
      modelVersion: this.modelVersion,
    };
  }

  private async inferChunk(
    chunkL: Float32Array,
    chunkR: Float32Array
  ): Promise<Record<StemType, [Float32Array, Float32Array]>> {
    if (!this.session) throw new Error('Model not loaded');

    const ort = await this.importOrt();

    // Shape: [1, 2, samples]
    const inputData = new Float32Array(2 * chunkL.length);
    inputData.set(chunkL, 0);
    inputData.set(chunkR, chunkL.length);

    const inputTensor = new ort.Tensor('float32', inputData, [1, 2, chunkL.length]);
    const feeds: Record<string, OrtTensor> = { input: inputTensor };

    const results = await this.session.run(feeds);
    const outputData = results['output'].data as Float32Array;

    // Output shape: [1, 4, 2, samples] — 4 stems, stereo
    const samplesPerStem = chunkL.length;
    const samplesPerChannel = samplesPerStem;

    const output: Record<StemType, [Float32Array, Float32Array]> = {} as Record<StemType, [Float32Array, Float32Array]>;

    STEM_ORDER.forEach((stemType, stemIdx) => {
      const baseL = stemIdx * 2 * samplesPerChannel;
      const baseR = baseL + samplesPerChannel;
      output[stemType] = [
        outputData.slice(baseL, baseL + samplesPerChannel),
        outputData.slice(baseR, baseR + samplesPerChannel),
      ];
    });

    // Melody is synthesized from "other" in a 4-stem model
    output.melody = output.other;

    return output;
  }

  // ── Crossfade window for overlap-add ─────────────────────────────────────────

  private buildCrossfadeWindow(chunkSize: number, overlapSize: number): Float32Array {
    const window = new Float32Array(chunkSize).fill(1.0);

    // Fade in
    for (let i = 0; i < overlapSize; i++) {
      window[i] = Math.sin((i / overlapSize) * (Math.PI / 2));
    }
    // Fade out
    for (let i = 0; i < overlapSize; i++) {
      window[chunkSize - overlapSize + i] = Math.cos((i / overlapSize) * (Math.PI / 2));
    }

    return window;
  }

  // ── ONNX Runtime dynamic import ───────────────────────────────────────────────
  // The renderer uses onnxruntime-web; the main/worker process uses onnxruntime-node.

  private async importOrt(): Promise<typeof import('onnxruntime-web')> {
    // Try web runtime first (renderer context)
    try {
      return await import('onnxruntime-web');
    } catch {
      // Fall back to Node runtime (Electron main process via IPC worker)
      return await import('onnxruntime-node') as unknown as typeof import('onnxruntime-web');
    }
  }

  private getExecutionProviders(): string[] {
    // Prefer WebGL/WASM acceleration; Node falls back to cpu
    if (typeof window !== 'undefined') {
      return ['webgl', 'wasm'];
    }
    return ['cpu'];
  }

  // ── Utility: stems → AudioBuffer ─────────────────────────────────────────────

  static stemToAudioBuffer(
    ctx: AudioContext,
    stems: Record<StemType, Float32Array[]>,
    stemType: StemType,
    sampleRate: number
  ): AudioBuffer {
    const [left, right] = stems[stemType];
    const buffer = ctx.createBuffer(2, left.length, sampleRate);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right ?? left);
    return buffer;
  }

  /**
   * Encode a stem result into a TrackStems domain object for the store.
   * filePaths are set to null — the caller persists the audio blobs and updates them.
   */
  static resultToTrackStems(
    trackId: string,
    result: StemSeparationResult
  ): TrackStems {
    const stemTypes: StemType[] = ['vocals', 'drums', 'bass', 'other', 'melody'];
    const stems: TrackStems['stems'] = {} as TrackStems['stems'];

    for (const type of stemTypes) {
      stems[type] = {
        type,
        filePath: null,
        audioBuffer: null, // populated after AudioBuffer creation
        volume: 1.0,
        isMuted: false,
      } as Stem;
    }

    return {
      trackId,
      stems,
      modelVersion: result.modelVersion,
      separatedAt: Date.now(),
    };
  }
}

// ── Minimal ONNX type stubs (avoids hard dependency on ort types in this file) ──

interface OrtTensor {
  data: Float32Array;
  dims: number[];
  type: string;
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?(): void;
  handler?: Record<string, unknown>;
}

export const stemSeparator = new StemSeparator();
