// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Core Audio Engine
// Manages the Web Audio API graph for up to 4 decks, effects chain,
// EQ, crossfader, headphone cue mix, master output, and mix recording.
// ─────────────────────────────────────────────────────────────────────────────

import type { DeckId, NormalizedGain, Decibels, BPM } from '../types';
import { DSPEffects, type EffectNode } from './DSPEffects';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeckAudioNodes {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;           // pre-fader trim/gain
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  channelFader: GainNode;
  analyser: AnalyserNode;       // for waveform visualization
  meterAnalyser: AnalyserNode;  // for VU metering (separate from visualizer)
  pfluGain: GainNode;           // pre-fader listen send level
  crossfaderGain: GainNode;     // controlled by crossfader position
}

export interface MeterData {
  left: Decibels;
  right: Decibels;
  peak: Decibels;
}

export type CrossfaderCurve = 'linear' | 'fast' | 'slow' | 'scratch' | 'constant_power';

export interface AudioEngineOptions {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory | number;
}

type MeterCallback = (deckId: DeckId, left: Decibels, right: Decibels) => void;
type MasterMeterCallback = (left: Decibels, right: Decibels) => void;
type BeatCallback = (deckId: DeckId, beat: number, bpm: BPM) => void;
type PositionCallback = (deckId: DeckId, position: number) => void;

// ── Constants ─────────────────────────────────────────────────────────────────

const DECK_IDS: DeckId[] = ['A', 'B', 'C', 'D'];
// dBFS floor for silence (below this we report -Infinity)
const SILENCE_DB = -96;

// ── AudioEngine ───────────────────────────────────────────────────────────────

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private decks: Map<DeckId, DeckAudioNodes> = new Map();
  private deckBuffers: Map<DeckId, AudioBuffer> = new Map();
  private deckStartTimes: Map<DeckId, number> = new Map();   // ctx.currentTime at play start
  private deckOffsets: Map<DeckId, number> = new Map();      // buffer offset at play start
  private deckPlaybackRates: Map<DeckId, number> = new Map();

  // Master output chain
  private masterGain!: GainNode;
  private masterLimiter!: DynamicsCompressorNode;
  private masterAnalyserL!: AnalyserNode;
  private masterAnalyserR!: AnalyserNode;
  private masterSplitter!: ChannelSplitterNode;

  // Headphone cue bus
  private headphoneGain!: GainNode;
  private headphoneMerger!: ChannelMergerNode;
  private pfluMix!: GainNode;  // headphone blend: cue vs master
  private masterCueSend!: GainNode;

  // Crossfader state
  private crossfaderValue = 0; // -1 to +1
  private crossfaderCurve: CrossfaderCurve = 'constant_power';
  private crossfaderAssignA: Set<DeckId> = new Set(['A', 'C']);
  private crossfaderAssignB: Set<DeckId> = new Set(['B', 'D']);

  // Recording
  private recorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private recordingStream: MediaStreamAudioDestinationNode | null = null;

  // Effects
  private effectNodes: Map<string, EffectNode> = new Map();

  // Callbacks
  private onMeter: MeterCallback | null = null;
  private onMasterMeter: MasterMeterCallback | null = null;
  private onBeat: BeatCallback | null = null;
  private onPosition: PositionCallback | null = null;

  // Animation frame for metering
  private meterRafId: number | null = null;
  // Scratch / pitch modulation state per deck
  private scratchActive: Map<DeckId, boolean> = new Map();

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async initialize(options: AudioEngineOptions = {}): Promise<void> {
    if (this.ctx) return;

    this.ctx = new AudioContext({
      sampleRate: options.sampleRate ?? 44100,
      latencyHint: options.latencyHint ?? 'interactive',
    });

    // AudioContext starts suspended in browsers until a user gesture
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.buildMasterChain();

    for (const id of DECK_IDS) {
      this.buildDeckNodes(id);
    }

    this.startMeterLoop();
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') {
      await this.ctx.suspend();
    }
  }

  destroy(): void {
    this.stopMeterLoop();
    this.recorder?.stop();
    this.ctx?.close();
    this.ctx = null;
    this.decks.clear();
    this.deckBuffers.clear();
    this.effectNodes.clear();
  }

  get audioContext(): AudioContext {
    if (!this.ctx) throw new Error('AudioEngine not initialized');
    return this.ctx;
  }

  // ── Graph construction ───────────────────────────────────────────────────────

  private buildMasterChain(): void {
    const ctx = this.audioContext;

    this.masterGain = ctx.createGain();

    // Brickwall limiter at master output to prevent clipping
    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.1;

    // Split stereo for metering
    this.masterSplitter = ctx.createChannelSplitter(2);
    this.masterAnalyserL = ctx.createAnalyser();
    this.masterAnalyserR = ctx.createAnalyser();
    this.masterAnalyserL.fftSize = 2048;
    this.masterAnalyserR.fftSize = 2048;
    this.masterAnalyserL.smoothingTimeConstant = 0.8;
    this.masterAnalyserR.smoothingTimeConstant = 0.8;

    // Headphone output
    this.headphoneGain = ctx.createGain();
    this.headphoneGain.gain.value = 0.8;
    this.pfluMix = ctx.createGain();
    this.masterCueSend = ctx.createGain();
    this.masterCueSend.gain.value = 0.5;
    this.headphoneMerger = ctx.createChannelMerger(2);

    // Routing:
    // masterGain → masterLimiter → masterSplitter → analyserL/R → destination
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterAnalyserL, 0);
    this.masterSplitter.connect(this.masterAnalyserR, 1);
    this.masterLimiter.connect(ctx.destination);

    // Master send to headphones (for cue mix)
    this.masterGain.connect(this.masterCueSend);
    this.masterCueSend.connect(this.headphoneGain);
    this.headphoneGain.connect(ctx.destination);
  }

  private buildDeckNodes(deckId: DeckId): void {
    const ctx = this.audioContext;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    // 3-band EQ using standard shelving / peaking filters
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 100;
    eqLow.gain.value = 0;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.7;
    eqMid.gain.value = 0;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 10000;
    eqHigh.gain.value = 0;

    const channelFader = ctx.createGain();
    channelFader.gain.value = 1.0;

    const crossfaderGain = ctx.createGain();
    crossfaderGain.gain.value = 1.0;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;

    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 2048;
    meterAnalyser.smoothingTimeConstant = 0.85;

    const pfluGain = ctx.createGain();
    pfluGain.gain.value = 0; // off by default

    // Chain: gain → eqLow → eqMid → eqHigh → channelFader → crossfaderGain → analyser → master
    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(channelFader);
    channelFader.connect(crossfaderGain);
    crossfaderGain.connect(analyser);
    analyser.connect(meterAnalyser);
    meterAnalyser.connect(this.masterGain);

    // PFL send: post-trim, pre-fader
    eqHigh.connect(pfluGain);
    pfluGain.connect(this.headphoneGain);

    this.decks.set(deckId, {
      source: null,
      gainNode,
      eqLow,
      eqMid,
      eqHigh,
      channelFader,
      analyser,
      meterAnalyser,
      pfluGain,
      crossfaderGain,
    });

    this.deckPlaybackRates.set(deckId, 1.0);
    this.scratchActive.set(deckId, false);
  }

  // ── Deck control ─────────────────────────────────────────────────────────────

  async loadBuffer(deckId: DeckId, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.audioContext;
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.deckBuffers.set(deckId, audioBuffer);
    return audioBuffer;
  }

  play(deckId: DeckId, offsetSeconds = 0): void {
    const ctx = this.audioContext;
    const nodes = this.decks.get(deckId);
    const buffer = this.deckBuffers.get(deckId);
    if (!nodes || !buffer) return;

    this.stopSource(deckId);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.deckPlaybackRates.get(deckId) ?? 1.0;
    source.connect(nodes.gainNode);
    source.start(0, offsetSeconds);

    nodes.source = source;
    this.deckStartTimes.set(deckId, ctx.currentTime);
    this.deckOffsets.set(deckId, offsetSeconds);

    source.onended = () => {
      if (nodes.source === source) nodes.source = null;
    };
  }

  pause(deckId: DeckId): void {
    const offset = this.getCurrentPosition(deckId);
    this.stopSource(deckId);
    this.deckOffsets.set(deckId, offset);
  }

  stop(deckId: DeckId): void {
    this.stopSource(deckId);
    this.deckOffsets.set(deckId, 0);
    this.deckStartTimes.delete(deckId);
  }

  seek(deckId: DeckId, position: number): void {
    const nodes = this.decks.get(deckId);
    const wasPlaying = nodes?.source !== null;
    this.stopSource(deckId);
    this.deckOffsets.set(deckId, position);
    if (wasPlaying) {
      this.play(deckId, position);
    }
  }

  private stopSource(deckId: DeckId): void {
    const nodes = this.decks.get(deckId);
    if (nodes?.source) {
      try { nodes.source.stop(); } catch { /* already stopped */ }
      nodes.source.disconnect();
      nodes.source = null;
    }
  }

  getCurrentPosition(deckId: DeckId): number {
    const nodes = this.decks.get(deckId);
    if (!nodes?.source) {
      return this.deckOffsets.get(deckId) ?? 0;
    }
    const ctx = this.audioContext;
    const startTime = this.deckStartTimes.get(deckId) ?? ctx.currentTime;
    const offset = this.deckOffsets.get(deckId) ?? 0;
    const rate = this.deckPlaybackRates.get(deckId) ?? 1.0;
    return offset + (ctx.currentTime - startTime) * rate;
  }

  setPlaybackRate(deckId: DeckId, rate: number): void {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    this.deckPlaybackRates.set(deckId, clamped);

    const nodes = this.decks.get(deckId);
    if (nodes?.source) {
      nodes.source.playbackRate.setTargetAtTime(clamped, this.audioContext.currentTime, 0.01);
    }
  }

  // Vinyl-style scratch: instantaneous rate change with zero smoothing
  scratch(deckId: DeckId, rate: number): void {
    const nodes = this.decks.get(deckId);
    if (nodes?.source) {
      nodes.source.playbackRate.value = rate;
    }
  }

  endScratch(deckId: DeckId): void {
    const rate = this.deckPlaybackRates.get(deckId) ?? 1.0;
    const nodes = this.decks.get(deckId);
    if (nodes?.source) {
      // Smoothly return to normal rate to avoid click
      nodes.source.playbackRate.setTargetAtTime(rate, this.audioContext.currentTime, 0.05);
    }
  }

  // ── Gain & EQ ────────────────────────────────────────────────────────────────

  setDeckGain(deckId: DeckId, gain: NormalizedGain): void {
    const nodes = this.decks.get(deckId);
    if (nodes) {
      nodes.gainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
    }
  }

  setChannelFader(deckId: DeckId, level: NormalizedGain): void {
    const nodes = this.decks.get(deckId);
    if (nodes) {
      nodes.channelFader.gain.setTargetAtTime(level, this.audioContext.currentTime, 0.005);
    }
  }

  setEqHigh(deckId: DeckId, gainDb: Decibels): void {
    const nodes = this.decks.get(deckId);
    if (nodes) nodes.eqHigh.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.01);
  }

  setEqMid(deckId: DeckId, gainDb: Decibels): void {
    const nodes = this.decks.get(deckId);
    if (nodes) nodes.eqMid.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.01);
  }

  setEqLow(deckId: DeckId, gainDb: Decibels): void {
    const nodes = this.decks.get(deckId);
    if (nodes) nodes.eqLow.gain.setTargetAtTime(gainDb, this.audioContext.currentTime, 0.01);
  }

  // EQ kill: set gain to -Infinity by dropping to near-zero linear gain
  killEqBand(deckId: DeckId, band: 'high' | 'mid' | 'low'): void {
    const nodes = this.decks.get(deckId);
    if (!nodes) return;
    const target = band === 'high' ? nodes.eqHigh : band === 'mid' ? nodes.eqMid : nodes.eqLow;
    target.gain.setTargetAtTime(-40, this.audioContext.currentTime, 0.005);
  }

  // ── Crossfader ───────────────────────────────────────────────────────────────

  setCrossfader(value: number): void {
    this.crossfaderValue = Math.max(-1, Math.min(1, value));
    this.applyXfader();
  }

  setCrossfaderCurve(curve: CrossfaderCurve): void {
    this.crossfaderCurve = curve;
    this.applyXfader();
  }

  setCrossfaderAssign(side: 'A' | 'B', deckIds: DeckId[]): void {
    if (side === 'A') this.crossfaderAssignA = new Set(deckIds);
    else this.crossfaderAssignB = new Set(deckIds);
    this.applyXfader();
  }

  private applyXfader(): void {
    // Normalize position to 0..1 for calculations
    const pos = (this.crossfaderValue + 1) / 2; // 0 = full A, 1 = full B
    const ctx = this.audioContext;
    const ramp = 0.005;

    for (const [deckId, nodes] of this.decks) {
      const isA = this.crossfaderAssignA.has(deckId);
      const isB = this.crossfaderAssignB.has(deckId);
      if (!isA && !isB) {
        nodes.crossfaderGain.gain.setTargetAtTime(1.0, ctx.currentTime, ramp);
        continue;
      }

      let gainA: number;
      let gainB: number;

      switch (this.crossfaderCurve) {
        case 'constant_power': {
          // Equal-power: maintains constant loudness through the crossfade
          gainA = Math.cos((pos * Math.PI) / 2);
          gainB = Math.cos(((1 - pos) * Math.PI) / 2);
          break;
        }
        case 'fast': {
          // Cuts opposite side quickly after center
          gainA = pos < 0.5 ? 1.0 : Math.cos(((pos - 0.5) * Math.PI));
          gainB = pos > 0.5 ? 1.0 : Math.cos(((0.5 - pos) * Math.PI));
          break;
        }
        case 'scratch': {
          // Hard cut: either fully on or off, minimal overlap
          gainA = pos <= 0.52 ? 1.0 : 0.0;
          gainB = pos >= 0.48 ? 1.0 : 0.0;
          break;
        }
        case 'slow': {
          // Extended blend zone for smooth mixing
          gainA = Math.max(0, 1 - pos * 1.5);
          gainB = Math.max(0, (pos - 0.33) * 1.5);
          break;
        }
        default: {
          // Linear
          gainA = 1 - pos;
          gainB = pos;
        }
      }

      if (isA) nodes.crossfaderGain.gain.setTargetAtTime(gainA, ctx.currentTime, ramp);
      else if (isB) nodes.crossfaderGain.gain.setTargetAtTime(gainB, ctx.currentTime, ramp);
    }
  }

  // ── Master output ────────────────────────────────────────────────────────────

  setMasterVolume(gain: NormalizedGain): void {
    this.masterGain.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
  }

  setHeadphoneVolume(gain: NormalizedGain): void {
    this.headphoneGain.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
  }

  setHeadphoneCueMix(mix: number): void {
    // mix: 0 = cue only, 1 = master only
    this.pfluMix.gain.setTargetAtTime(1 - mix, this.audioContext.currentTime, 0.01);
    this.masterCueSend.gain.setTargetAtTime(mix, this.audioContext.currentTime, 0.01);
  }

  setPfluActive(deckId: DeckId, active: boolean): void {
    const nodes = this.decks.get(deckId);
    if (nodes) {
      nodes.pfluGain.gain.setTargetAtTime(active ? 1.0 : 0.0, this.audioContext.currentTime, 0.01);
    }
  }

  // ── Effects chain ────────────────────────────────────────────────────────────

  attachEffect(slot: 0 | 1 | 2, effectNode: EffectNode): void {
    const key = `slot_${slot}`;
    this.detachEffect(slot);
    this.effectNodes.set(key, effectNode);
    // Insert between master gain and master limiter
    this.masterGain.disconnect(this.masterLimiter);
    this.masterGain.connect(effectNode.input);
    effectNode.output.connect(this.masterLimiter);
  }

  detachEffect(slot: 0 | 1 | 2): void {
    const key = `slot_${slot}`;
    const node = this.effectNodes.get(key);
    if (node) {
      try {
        node.input.disconnect();
        node.output.disconnect();
      } catch { /* ignore if already disconnected */ }
      this.effectNodes.delete(key);
    }
    // Reconnect master chain directly if no more effects
    if (this.effectNodes.size === 0) {
      try { this.masterGain.disconnect(); } catch { /* ignore */ }
      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterSplitter);
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────────────

  scheduleLoop(deckId: DeckId, inPoint: number, outPoint: number): void {
    const nodes = this.decks.get(deckId);
    const buffer = this.deckBuffers.get(deckId);
    if (!nodes || !buffer) return;

    const ctx = this.audioContext;
    this.stopSource(deckId);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = inPoint;
    source.loopEnd = outPoint;
    source.playbackRate.value = this.deckPlaybackRates.get(deckId) ?? 1.0;
    source.connect(nodes.gainNode);
    source.start(0, inPoint);

    nodes.source = source;
    this.deckStartTimes.set(deckId, ctx.currentTime);
    this.deckOffsets.set(deckId, inPoint);
  }

  exitLoop(deckId: DeckId): void {
    const nodes = this.decks.get(deckId);
    if (nodes?.source) {
      nodes.source.loop = false;
    }
  }

  // ── Recording ────────────────────────────────────────────────────────────────

  startRecording(): void {
    const ctx = this.audioContext;
    this.recordingStream = ctx.createMediaStreamDestination();
    this.masterGain.connect(this.recordingStream);

    this.recordingChunks = [];
    this.recorder = new MediaRecorder(this.recordingStream.stream, {
      mimeType: 'audio/webm;codecs=pcm',
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordingChunks.push(e.data);
    };

    this.recorder.start(1000); // 1 s chunks
  }

  stopRecording(): Promise<Blob> {
    return new Promise(resolve => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        resolve(new Blob([]));
        return;
      }

      this.recorder.onstop = () => {
        const blob = new Blob(this.recordingChunks, { type: 'audio/webm' });
        this.recordingChunks = [];
        if (this.recordingStream) {
          try { this.masterGain.disconnect(this.recordingStream); } catch { /* ignore */ }
          this.recordingStream = null;
        }
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  // ── Metering ─────────────────────────────────────────────────────────────────

  onMeterUpdate(cb: MeterCallback): void { this.onMeter = cb; }
  onMasterMeterUpdate(cb: MasterMeterCallback): void { this.onMasterMeter = cb; }
  onBeatDetected(cb: BeatCallback): void { this.onBeat = cb; }
  onPositionUpdate(cb: PositionCallback): void { this.onPosition = cb; }

  private startMeterLoop(): void {
    const loop = () => {
      this.readMeters();
      this.meterRafId = requestAnimationFrame(loop);
    };
    this.meterRafId = requestAnimationFrame(loop);
  }

  private stopMeterLoop(): void {
    if (this.meterRafId !== null) {
      cancelAnimationFrame(this.meterRafId);
      this.meterRafId = null;
    }
  }

  private readMeters(): void {
    const dataArray = new Float32Array(2048);

    for (const [deckId, nodes] of this.decks) {
      nodes.meterAnalyser.getFloatTimeDomainData(dataArray);
      const peak = this.getPeakDb(dataArray);
      if (this.onMeter) this.onMeter(deckId, peak, peak);
      if (this.onPosition && nodes.source) {
        this.onPosition(deckId, this.getCurrentPosition(deckId));
      }
    }

    // Master meters
    const masterData = new Float32Array(2048);
    this.masterAnalyserL.getFloatTimeDomainData(masterData);
    const masterL = this.getPeakDb(masterData);
    this.masterAnalyserR.getFloatTimeDomainData(masterData);
    const masterR = this.getPeakDb(masterData);
    if (this.onMasterMeter) this.onMasterMeter(masterL, masterR);
  }

  private getPeakDb(data: Float32Array): Decibels {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > max) max = abs;
    }
    if (max <= 0) return SILENCE_DB;
    return 20 * Math.log10(max);
  }

  // ── Waveform visualizer data ──────────────────────────────────────────────────

  getWaveformData(deckId: DeckId): Float32Array {
    const nodes = this.decks.get(deckId);
    if (!nodes) return new Float32Array(0);
    const data = new Float32Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getFloatTimeDomainData(data);
    return data;
  }

  getFrequencyData(deckId: DeckId): Float32Array {
    const nodes = this.decks.get(deckId);
    if (!nodes) return new Float32Array(0);
    const data = new Float32Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getFloatFrequencyData(data);
    return data;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  getLatency(): number {
    if (!this.ctx) return 0;
    return this.ctx.baseLatency + this.ctx.outputLatency;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  isPlaying(deckId: DeckId): boolean {
    return this.decks.get(deckId)?.source !== null;
  }
}

// Singleton export — the app should use a single shared engine instance
export const audioEngine = new AudioEngine();
