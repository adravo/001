// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — DSP Effects Library
// Each effect is a self-contained class that builds a Web Audio subgraph.
// All effects expose a consistent { input, output } interface plus a parameters
// map so the UI can bind knobs without knowing implementation details.
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectNode {
  input: AudioNode;
  output: AudioNode;
  setWetDry(mix: number): void;
  setParameter(id: string, value: number): void;
  destroy(): void;
}

// ── Utility: dry/wet mixer ────────────────────────────────────────────────────

function buildWetDryMixer(ctx: AudioContext): {
  dryGain: GainNode;
  wetGain: GainNode;
  output: GainNode;
  setMix(mix: number): void;
} {
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const output = ctx.createGain();

  dryGain.gain.value = 1;
  wetGain.gain.value = 0;

  dryGain.connect(output);
  wetGain.connect(output);

  const setMix = (mix: number) => {
    const m = Math.max(0, Math.min(1, mix));
    dryGain.gain.setTargetAtTime(1 - m, ctx.currentTime, 0.01);
    wetGain.gain.setTargetAtTime(m, ctx.currentTime, 0.01);
  };

  return { dryGain, wetGain, output, setMix };
}

// ── Reverb ────────────────────────────────────────────────────────────────────

export class ReverbEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private convolver: ConvolverNode;
  private preDelay: DelayNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;
  private decayTime = 2.0;
  private roomSize = 0.7;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.preDelay = ctx.createDelay(0.1);
    this.preDelay.delayTime.value = 0.02;
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.preDelay);
    this.preDelay.connect(this.convolver);
    this.convolver.connect(this.mixer.wetGain);

    this.generateImpulse();
  }

  private generateImpulse(): void {
    const sr = this.ctx.sampleRate;
    const length = Math.floor(sr * this.decayTime);
    const buffer = this.ctx.createBuffer(2, length, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Exponential decay of white noise — simple but effective hall reverb
        const decay = Math.exp(-i / (sr * this.decayTime * this.roomSize));
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }

    this.convolver.buffer = buffer;
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'decay':
        this.decayTime = Math.max(0.1, Math.min(10, value));
        this.generateImpulse();
        break;
      case 'roomSize':
        this.roomSize = Math.max(0.1, Math.min(1.0, value));
        this.generateImpulse();
        break;
      case 'preDelay':
        this.preDelay.delayTime.setTargetAtTime(Math.max(0, Math.min(0.1, value)), this.ctx.currentTime, 0.01);
        break;
    }
  }

  destroy(): void {
    (this.input as AudioNode).disconnect();
    this.convolver.disconnect();
    this.preDelay.disconnect();
  }
}

// ── Delay (ping-pong) ─────────────────────────────────────────────────────────

export class DelayEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private delayL: DelayNode;
  private delayR: DelayNode;
  private feedbackL: GainNode;
  private feedbackR: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.delayL = ctx.createDelay(2.0);
    this.delayR = ctx.createDelay(2.0);
    this.feedbackL = ctx.createGain();
    this.feedbackR = ctx.createGain();
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    this.delayL.delayTime.value = 0.375; // 3/8 beat at 120 bpm
    this.delayR.delayTime.value = 0.25;  // 1/4 beat
    this.feedbackL.gain.value = 0.4;
    this.feedbackR.gain.value = 0.4;

    // Ping-pong routing: L delay feeds R delay and vice-versa
    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.splitter);
    this.splitter.connect(this.delayL, 0);
    this.splitter.connect(this.delayR, 1);
    this.delayL.connect(this.feedbackL);
    this.delayR.connect(this.feedbackR);
    this.feedbackL.connect(this.delayR); // cross-feed for ping-pong
    this.feedbackR.connect(this.delayL);
    this.delayL.connect(this.merger, 0, 0);
    this.delayR.connect(this.merger, 0, 1);
    this.merger.connect(this.mixer.wetGain);
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'delayTime':
        this.delayL.delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.02);
        this.delayR.delayTime.setTargetAtTime(value * 0.667, this.ctx.currentTime, 0.02);
        break;
      case 'feedback':
        this.feedbackL.gain.setTargetAtTime(Math.min(0.95, value), this.ctx.currentTime, 0.01);
        this.feedbackR.gain.setTargetAtTime(Math.min(0.95, value), this.ctx.currentTime, 0.01);
        break;
    }
  }

  syncToBpm(bpm: number, subdivision: number = 0.5): void {
    const beat = 60 / bpm;
    this.delayL.delayTime.setTargetAtTime(beat * subdivision, this.ctx.currentTime, 0.02);
    this.delayR.delayTime.setTargetAtTime(beat * subdivision * 0.667, this.ctx.currentTime, 0.02);
  }

  destroy(): void {
    (this.input as AudioNode).disconnect();
  }
}

// ── Filter ────────────────────────────────────────────────────────────────────

export class FilterEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private lpf: BiquadFilterNode;
  private hpf: BiquadFilterNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;
  private mode: 'lowpass' | 'highpass' | 'bandpass' = 'lowpass';

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 20000;
    this.lpf.Q.value = 1.0;

    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 20;
    this.hpf.Q.value = 1.0;

    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.lpf);
    this.lpf.connect(this.hpf);
    this.hpf.connect(this.mixer.wetGain);

    this.mixer.setMix(1.0); // filter is always 100% wet by default
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'frequency':
        this.lpf.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.005);
        this.hpf.frequency.setTargetAtTime(value * 0.1, this.ctx.currentTime, 0.005);
        break;
      case 'resonance':
        this.lpf.Q.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        this.hpf.Q.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
    }
  }

  destroy(): void { (this.input as AudioNode).disconnect(); }
}

// ── Flanger ───────────────────────────────────────────────────────────────────

export class FlangerEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private delay: DelayNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private feedback: GainNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.delay = ctx.createDelay(0.02);
    this.delay.delayTime.value = 0.003;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.002;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.7;
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.delay);
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.delay.connect(this.feedback);
    this.delay.connect(this.mixer.wetGain);
    this.feedback.connect(this.delay);
    this.lfo.start();
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'rate':   this.lfo.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05); break;
      case 'depth':  this.lfoGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'feedback': this.feedback.gain.setTargetAtTime(Math.min(0.95, value), this.ctx.currentTime, 0.01); break;
      case 'delay':  this.delay.delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
    }
  }

  destroy(): void {
    this.lfo.stop();
    (this.input as AudioNode).disconnect();
  }
}

// ── Phaser ────────────────────────────────────────────────────────────────────

export class PhaserEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private allpasses: BiquadFilterNode[];
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private feedback: GainNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    // 6-stage all-pass filter chain
    this.allpasses = Array.from({ length: 6 }, (_, i) => {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 350 * Math.pow(2, i * 0.5);
      ap.Q.value = 10;
      return ap;
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 400;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.5;

    (this.input as GainNode).connect(this.mixer.dryGain);
    let prev: AudioNode = this.input;
    for (const ap of this.allpasses) {
      prev.connect(ap);
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(ap.frequency);
      prev = ap;
    }
    prev.connect(this.feedback);
    (this.allpasses[this.allpasses.length - 1]).connect(this.mixer.wetGain);
    this.feedback.connect(this.allpasses[0]);
    this.lfo.start();
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'rate':  this.lfo.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05); break;
      case 'depth': this.lfoGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'feedback': this.feedback.gain.setTargetAtTime(Math.min(0.95, value), this.ctx.currentTime, 0.01); break;
    }
  }

  destroy(): void {
    this.lfo.stop();
    (this.input as AudioNode).disconnect();
  }
}

// ── Chorus ────────────────────────────────────────────────────────────────────

export class ChorusEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private voices: Array<{ delay: DelayNode; lfo: OscillatorNode; lfoGain: GainNode }>;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext, voices = 3) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    this.voices = Array.from({ length: voices }, (_, i) => {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.02 + i * 0.005;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      // Spread LFO frequencies slightly to avoid comb-like phasing
      lfo.frequency.value = 0.3 + i * 0.15;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.003;

      (this.input as GainNode).connect(delay);
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      delay.connect(this.mixer.wetGain);
      lfo.start(ctx.currentTime + i * 0.1);

      return { delay, lfo, lfoGain };
    });

    (this.input as GainNode).connect(this.mixer.dryGain);
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'rate':
        this.voices.forEach((v, i) => v.lfo.frequency.setTargetAtTime(value + i * 0.15, this.ctx.currentTime, 0.05));
        break;
      case 'depth':
        this.voices.forEach(v => v.lfoGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01));
        break;
    }
  }

  destroy(): void {
    this.voices.forEach(v => v.lfo.stop());
    (this.input as AudioNode).disconnect();
  }
}

// ── Compressor ────────────────────────────────────────────────────────────────

export class CompressorEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private comp: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.makeupGain = ctx.createGain();
    this.makeupGain.gain.value = 1.5;

    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.comp);
    this.comp.connect(this.makeupGain);
    this.makeupGain.connect(this.mixer.wetGain);
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'threshold': this.comp.threshold.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'ratio':     this.comp.ratio.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'attack':    this.comp.attack.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'release':   this.comp.release.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'makeup':    this.makeupGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'knee':      this.comp.knee.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
    }
  }

  get reduction(): number { return this.comp.reduction; }

  destroy(): void { (this.input as AudioNode).disconnect(); }
}

// ── Beat Repeat ───────────────────────────────────────────────────────────────
// Captures a buffer of audio and loops it in sync with the beat.

export class BeatRepeatEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private recorder: ScriptProcessorNode;
  private player: AudioBufferSourceNode | null = null;
  private captureBuffer: Float32Array;
  private capturePos = 0;
  private isCapturing = false;
  private isRepeating = false;
  private loopLength: number;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext, bpm = 120) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    const beatSeconds = 60 / bpm;
    this.loopLength = beatSeconds * 0.5; // 1/2 beat default
    const bufferSize = Math.ceil(ctx.sampleRate * this.loopLength);

    this.buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    this.captureBuffer = new Float32Array(bufferSize);

    // ScriptProcessor is deprecated but remains the only option for buffer capture
    // without AudioWorklet (which requires a separate module file)
    this.recorder = ctx.createScriptProcessor(512, 1, 1);
    this.recorder.onaudioprocess = (e) => this.processAudio(e);

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.recorder);
    this.recorder.connect(ctx.destination); // ScriptProcessor must be connected to destination to fire
  }

  private processAudio(e: AudioProcessingEvent): void {
    const input = e.inputBuffer.getChannelData(0);
    if (this.isCapturing) {
      for (let i = 0; i < input.length && this.capturePos < this.captureBuffer.length; i++) {
        this.captureBuffer[this.capturePos++] = input[i];
      }
      if (this.capturePos >= this.captureBuffer.length) {
        this.isCapturing = false;
        this.commitCapture();
      }
    }
  }

  private commitCapture(): void {
    const data = this.buffer.getChannelData(0);
    data.set(this.captureBuffer);
    if (this.isRepeating) this.startPlayback();
  }

  private startPlayback(): void {
    this.player?.stop();
    this.player = this.ctx.createBufferSource();
    this.player.buffer = this.buffer;
    this.player.loop = true;
    this.player.connect(this.mixer.wetGain);
    this.player.start();
  }

  trigger(): void {
    this.capturePos = 0;
    this.isCapturing = true;
    this.isRepeating = true;
  }

  release(): void {
    this.isRepeating = false;
    this.player?.stop();
    this.player = null;
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    if (id === 'loopLength') {
      this.loopLength = value;
    }
  }

  destroy(): void {
    this.recorder.disconnect();
    this.player?.stop();
    (this.input as AudioNode).disconnect();
  }
}

// ── Stutter ───────────────────────────────────────────────────────────────────

export class StutterEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private delay: DelayNode;
  private feedbackGain: GainNode;
  private gateGain: GainNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.125; // 1/8th beat at 120 bpm
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0.8;
    this.gateGain = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfo.frequency.value = 8; // stutter rate in Hz
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.5;
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.delay);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
    this.delay.connect(this.gateGain);
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.gateGain.gain);
    this.gateGain.connect(this.mixer.wetGain);
    this.lfo.start();
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'rate':      this.lfo.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'delay':     this.delay.delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.01); break;
      case 'feedback':  this.feedbackGain.gain.setTargetAtTime(Math.min(0.95, value), this.ctx.currentTime, 0.01); break;
    }
  }

  destroy(): void {
    this.lfo.stop();
    (this.input as AudioNode).disconnect();
  }
}

// ── Granular ──────────────────────────────────────────────────────────────────
// A simplified granular freezer: captures a grain and repeats it with pitch variation.

export class GranularEffect implements EffectNode {
  input: AudioNode;
  output: AudioNode;

  private ctx: AudioContext;
  private grainBuffer: AudioBuffer | null = null;
  private grainSources: AudioBufferSourceNode[] = [];
  private captureNode: ScriptProcessorNode;
  private captureData: Float32Array;
  private capturePos = 0;
  private isCapturing = false;
  private isFreezing = false;
  private grainSize = 0.1; // seconds
  private scatter = 0.2;
  private density = 10;    // grains per second
  private grainScheduler: ReturnType<typeof setInterval> | null = null;
  private mixer: ReturnType<typeof buildWetDryMixer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.mixer = buildWetDryMixer(ctx);
    this.output = this.mixer.output;

    const maxGrainSamples = Math.ceil(ctx.sampleRate * 2.0);
    this.captureData = new Float32Array(maxGrainSamples);

    this.captureNode = ctx.createScriptProcessor(512, 1, 1);
    this.captureNode.onaudioprocess = (e) => {
      if (this.isCapturing) {
        const data = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < data.length && this.capturePos < this.captureData.length; i++) {
          this.captureData[this.capturePos++] = data[i];
        }
        if (this.capturePos >= Math.ceil(this.grainSize * ctx.sampleRate)) {
          this.isCapturing = false;
          this.buildGrainBuffer();
        }
      }
    };

    (this.input as GainNode).connect(this.mixer.dryGain);
    (this.input as GainNode).connect(this.captureNode);
    this.captureNode.connect(ctx.destination);
  }

  private buildGrainBuffer(): void {
    const size = Math.ceil(this.grainSize * this.ctx.sampleRate);
    this.grainBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    this.grainBuffer.getChannelData(0).set(this.captureData.subarray(0, size));
    if (this.isFreezing) this.startGranularScheduler();
  }

  private startGranularScheduler(): void {
    if (this.grainScheduler) clearInterval(this.grainScheduler);
    const interval = 1000 / this.density;
    this.grainScheduler = setInterval(() => this.spawnGrain(), interval);
  }

  private spawnGrain(): void {
    if (!this.grainBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.grainBuffer;
    // Random pitch variation for scatter
    src.playbackRate.value = 1.0 + (Math.random() - 0.5) * this.scatter;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, this.ctx.currentTime);
    env.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + this.grainSize * 0.1);
    env.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + this.grainSize * 0.9);
    env.gain.linearRampToValueAtTime(0, this.ctx.currentTime + this.grainSize);

    src.connect(env);
    env.connect(this.mixer.wetGain);
    src.start();
    src.stop(this.ctx.currentTime + this.grainSize);
    src.onended = () => {
      src.disconnect();
      env.disconnect();
    };

    this.grainSources.push(src);
    this.grainSources = this.grainSources.filter(s => s.context.state !== 'closed');
  }

  freeze(): void {
    this.capturePos = 0;
    this.isCapturing = true;
    this.isFreezing = true;
  }

  unfreeze(): void {
    this.isFreezing = false;
    if (this.grainScheduler) {
      clearInterval(this.grainScheduler);
      this.grainScheduler = null;
    }
    this.grainSources.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
    this.grainSources = [];
  }

  setWetDry(mix: number): void { this.mixer.setMix(mix); }

  setParameter(id: string, value: number): void {
    switch (id) {
      case 'grainSize': this.grainSize = Math.max(0.02, Math.min(2.0, value)); break;
      case 'scatter':   this.scatter = Math.max(0, Math.min(2.0, value)); break;
      case 'density':
        this.density = Math.max(1, Math.min(50, value));
        if (this.isFreezing) this.startGranularScheduler();
        break;
    }
  }

  destroy(): void {
    this.unfreeze();
    this.captureNode.disconnect();
    (this.input as AudioNode).disconnect();
  }
}

// ── Effect factory ────────────────────────────────────────────────────────────

export type EffectTypeName =
  | 'reverb' | 'delay' | 'filter' | 'flanger' | 'phaser'
  | 'chorus' | 'compressor' | 'beat_repeat' | 'stutter' | 'granular';

export function createEffect(ctx: AudioContext, type: EffectTypeName): EffectNode {
  switch (type) {
    case 'reverb':      return new ReverbEffect(ctx);
    case 'delay':       return new DelayEffect(ctx);
    case 'filter':      return new FilterEffect(ctx);
    case 'flanger':     return new FlangerEffect(ctx);
    case 'phaser':      return new PhaserEffect(ctx);
    case 'chorus':      return new ChorusEffect(ctx);
    case 'compressor':  return new CompressorEffect(ctx);
    case 'beat_repeat': return new BeatRepeatEffect(ctx);
    case 'stutter':     return new StutterEffect(ctx);
    case 'granular':    return new GranularEffect(ctx);
    default:
      throw new Error(`Unknown effect type: ${type}`);
  }
}
