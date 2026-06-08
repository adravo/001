// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — MIDI Engine
// ─────────────────────────────────────────────────────────────────────────────

import { useDJStore } from '../store';
import type {
  MidiMapping,
  MidiDevice,
  MidiMessage,
  MidiMappingAction,
  DeckId,
} from '../types';

// ── Controller profiles ───────────────────────────────────────────────────────

export interface ControllerProfile {
  name: string;
  vendorId?: number;
  productId?: number;
  /** Pre-configured mappings that ship with this profile */
  defaultMappings: Omit<MidiMapping, 'id'>[];
}

// Pioneer DDJ-SX3
const DDJ_SX3_PROFILE: ControllerProfile = {
  name: 'Pioneer DDJ-SX3',
  defaultMappings: [
    // Deck A
    { label: 'Deck A Play/Pause', message: { type: 'note_on', channel: 0, note: 11 }, action: { type: 'deck_play', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Cue', message: { type: 'note_on', channel: 0, note: 12 }, action: { type: 'deck_cue', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Sync', message: { type: 'note_on', channel: 0, note: 88 }, action: { type: 'deck_sync', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Pitch', message: { type: 'control_change', channel: 0, controller: 0 }, action: { type: 'deck_pitch', deckId: 'A' }, scaleMin: -8, scaleMax: 8, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Jog (scratch)', message: { type: 'control_change', channel: 0, controller: 33 }, action: { type: 'jog_wheel', deckId: 'A', mode: 'scratch' }, scaleMin: -1, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Hot Cue 1', message: { type: 'note_on', channel: 0, note: 0 }, action: { type: 'deck_hot_cue', deckId: 'A', slot: 0 }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck A Loop Toggle', message: { type: 'note_on', channel: 0, note: 20 }, action: { type: 'deck_loop_toggle', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    // Deck B
    { label: 'Deck B Play/Pause', message: { type: 'note_on', channel: 1, note: 11 }, action: { type: 'deck_play', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck B Cue', message: { type: 'note_on', channel: 1, note: 12 }, action: { type: 'deck_cue', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck B Sync', message: { type: 'note_on', channel: 1, note: 88 }, action: { type: 'deck_sync', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Deck B Pitch', message: { type: 'control_change', channel: 1, controller: 0 }, action: { type: 'deck_pitch', deckId: 'B' }, scaleMin: -8, scaleMax: 8, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    // Mixer
    { label: 'Crossfader', message: { type: 'control_change', channel: 6, controller: 31 }, action: { type: 'crossfader' }, scaleMin: -1, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Channel A Fader', message: { type: 'control_change', channel: 0, controller: 32 }, action: { type: 'channel_fader', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'Channel B Fader', message: { type: 'control_change', channel: 1, controller: 32 }, action: { type: 'channel_fader', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'EQ High A', message: { type: 'control_change', channel: 0, controller: 7 }, action: { type: 'eq_high', deckId: 'A' }, scaleMin: -26, scaleMax: 6, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'EQ Mid A', message: { type: 'control_change', channel: 0, controller: 8 }, action: { type: 'eq_mid', deckId: 'A' }, scaleMin: -26, scaleMax: 6, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
    { label: 'EQ Low A', message: { type: 'control_change', channel: 0, controller: 9 }, action: { type: 'eq_low', deckId: 'A' }, scaleMin: -26, scaleMax: 6, isEnabled: true, deviceName: 'Pioneer DDJ-SX3', deviceId: '' },
  ],
};

// Pioneer DDJ-1000
const DDJ_1000_PROFILE: ControllerProfile = {
  name: 'Pioneer DDJ-1000',
  defaultMappings: [
    { label: 'Deck A Play/Pause', message: { type: 'note_on', channel: 0, note: 11 }, action: { type: 'deck_play', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-1000', deviceId: '' },
    { label: 'Deck B Play/Pause', message: { type: 'note_on', channel: 1, note: 11 }, action: { type: 'deck_play', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-1000', deviceId: '' },
    { label: 'Crossfader', message: { type: 'control_change', channel: 6, controller: 31 }, action: { type: 'crossfader' }, scaleMin: -1, scaleMax: 1, isEnabled: true, deviceName: 'Pioneer DDJ-1000', deviceId: '' },
  ],
};

// Denon SC6000
const SC6000_PROFILE: ControllerProfile = {
  name: 'Denon SC6000',
  defaultMappings: [
    { label: 'Deck A Play', message: { type: 'note_on', channel: 0, note: 10 }, action: { type: 'deck_play', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Denon SC6000', deviceId: '' },
    { label: 'Deck A Jog', message: { type: 'control_change', channel: 0, controller: 33 }, action: { type: 'jog_wheel', deckId: 'A', mode: 'scratch' }, scaleMin: -1, scaleMax: 1, isEnabled: true, deviceName: 'Denon SC6000', deviceId: '' },
    { label: 'Deck A Pitch', message: { type: 'control_change', channel: 0, controller: 1 }, action: { type: 'deck_pitch', deckId: 'A' }, scaleMin: -8, scaleMax: 8, isEnabled: true, deviceName: 'Denon SC6000', deviceId: '' },
  ],
};

// Numark NS7III
const NS7III_PROFILE: ControllerProfile = {
  name: 'Numark NS7III',
  defaultMappings: [
    { label: 'Deck A Play', message: { type: 'note_on', channel: 0, note: 11 }, action: { type: 'deck_play', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Numark NS7III', deviceId: '' },
    { label: 'Deck B Play', message: { type: 'note_on', channel: 1, note: 11 }, action: { type: 'deck_play', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Numark NS7III', deviceId: '' },
  ],
};

// Native Instruments Traktor S4
const S4_PROFILE: ControllerProfile = {
  name: 'Native Instruments S4',
  defaultMappings: [
    { label: 'Deck A Play', message: { type: 'note_on', channel: 0, note: 108 }, action: { type: 'deck_play', deckId: 'A' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Native Instruments S4', deviceId: '' },
    { label: 'Deck B Play', message: { type: 'note_on', channel: 1, note: 108 }, action: { type: 'deck_play', deckId: 'B' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Native Instruments S4', deviceId: '' },
    { label: 'Deck C Play', message: { type: 'note_on', channel: 2, note: 108 }, action: { type: 'deck_play', deckId: 'C' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Native Instruments S4', deviceId: '' },
    { label: 'Deck D Play', message: { type: 'note_on', channel: 3, note: 108 }, action: { type: 'deck_play', deckId: 'D' }, scaleMin: 0, scaleMax: 1, isEnabled: true, deviceName: 'Native Instruments S4', deviceId: '' },
  ],
};

export const CONTROLLER_PROFILES: Record<string, ControllerProfile> = {
  'ddj-sx3': DDJ_SX3_PROFILE,
  'ddj-1000': DDJ_1000_PROFILE,
  'sc6000': SC6000_PROFILE,
  'ns7iii': NS7III_PROFILE,
  's4': S4_PROFILE,
};

// ── Velocity sensitivity curves ───────────────────────────────────────────────

export type VelocityCurve = 'linear' | 'exponential' | 'logarithmic' | 'soft' | 'hard';

export function applyVelocityCurve(value: number, curve: VelocityCurve): number {
  const n = value / 127;
  switch (curve) {
    case 'linear': return n;
    case 'exponential': return n * n;
    case 'logarithmic': return Math.sqrt(n);
    case 'soft': return n < 0.5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
    case 'hard': return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
    default: return n;
  }
}

// ── Relative encoder decoding ─────────────────────────────────────────────────

export type RelativeMode = 'twos_complement' | 'bin_offset' | 'sign_magnitude';

export function decodeRelativeEncoder(value: number, mode: RelativeMode): number {
  switch (mode) {
    case 'twos_complement':
      return value > 63 ? value - 128 : value;
    case 'bin_offset':
      return value - 64; // 64-center: 63 = -1, 64 = 0, 65 = +1
    case 'sign_magnitude':
      return value >= 64 ? -(value & 0x3f) : value;
    default:
      return value - 64;
  }
}

// ── MIDI clock ────────────────────────────────────────────────────────────────

const MIDI_TIMING_CLOCK = 0xf8;
const MIDI_START = 0xfa;
const MIDI_STOP = 0xfc;
const PPQN = 24;

// ── MIDI Engine ───────────────────────────────────────────────────────────────

export class MidiEngine {
  private midiAccess: MIDIAccess | null = null;
  private inputs: Map<string, MIDIInput> = new Map();
  private outputs: Map<string, MIDIOutput> = new Map();
  private isLearnMode = false;
  private learnCallback: ((msg: MidiMessage, deviceId: string) => void) | null = null;

  // MIDI clock state
  private clockPulseCount = 0;
  private clockIntervals: number[] = [];
  private lastClockTime = 0;
  private isSendingClock = false;
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;

  // Velocity curve
  private velocityCurve: VelocityCurve = 'linear';

  // Relative encoder mode
  private relativeMode: RelativeMode = 'bin_offset';

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      console.warn('[MidiEngine] Web MIDI API not supported in this browser.');
      return;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.scanDevices();
      this.midiAccess.onstatechange = () => this.scanDevices();
      console.log('[MidiEngine] Initialized with', this.inputs.size, 'inputs,', this.outputs.size, 'outputs.');
    } catch (err) {
      console.error('[MidiEngine] Failed to acquire MIDI access:', err);
    }
  }

  // ── Device scanning ─────────────────────────────────────────────────────────

  private scanDevices(): void {
    if (!this.midiAccess) return;

    this.inputs.clear();
    this.outputs.clear();

    const devices: MidiDevice[] = [];

    this.midiAccess.inputs.forEach((input) => {
      this.inputs.set(input.id, input);
      input.onmidimessage = (evt) => this.handleMidiMessage(evt, input.id, input.name ?? '');
      devices.push({
        id: input.id,
        name: input.name ?? 'Unknown Input',
        isConnected: input.state === 'connected',
        isInput: true,
        isOutput: false,
        manufacturer: input.manufacturer ?? '',
      });
    });

    this.midiAccess.outputs.forEach((output) => {
      this.outputs.set(output.id, output);
      devices.push({
        id: output.id,
        name: output.name ?? 'Unknown Output',
        isConnected: output.state === 'connected',
        isInput: false,
        isOutput: true,
        manufacturer: output.manufacturer ?? '',
      });
    });

    useDJStore.getState().setMidiDevices(devices);

    // Auto-load profiles for known controllers
    devices.forEach(d => {
      for (const [key, profile] of Object.entries(CONTROLLER_PROFILES)) {
        if (d.name.toLowerCase().includes(key.replace('-', ' ').toLowerCase())) {
          this.loadProfile(profile, d.id);
        }
      }
    });
  }

  // ── Message parsing ─────────────────────────────────────────────────────────

  private handleMidiMessage(event: MIDIMessageEvent, deviceId: string, deviceName: string): void {
    const [status, data1, data2] = event.data as unknown as [number, number, number];
    const type = status & 0xf0;
    const channel = status & 0x0f;

    let msg: MidiMessage | null = null;

    if (status === MIDI_TIMING_CLOCK) {
      this.handleClockPulse();
      return;
    }
    if (status === MIDI_START) {
      console.log('[MidiEngine] Clock Start received');
      return;
    }
    if (status === MIDI_STOP) {
      console.log('[MidiEngine] Clock Stop received');
      return;
    }

    switch (type) {
      case 0x90: // Note On
        msg = data2 > 0
          ? { type: 'note_on', channel, note: data1, velocity: data2 }
          : { type: 'note_off', channel, note: data1, velocity: 0 };
        break;
      case 0x80: // Note Off
        msg = { type: 'note_off', channel, note: data1, velocity: data2 };
        break;
      case 0xb0: // Control Change
        msg = { type: 'control_change', channel, controller: data1, value: data2 };
        break;
      case 0xe0: // Pitch Bend
        msg = { type: 'pitch_bend', channel, value: (data2 << 7) | data1 };
        break;
      case 0xc0: // Program Change
        msg = { type: 'program_change', channel, note: data1 };
        break;
    }

    if (!msg) return;

    if (this.isLearnMode && this.learnCallback) {
      // Only capture note_on and control_change for learning
      if (msg.type === 'note_on' || msg.type === 'control_change') {
        this.learnCallback(msg, deviceId);
        return;
      }
    }

    this.routeMessage(msg, deviceId, deviceName);
  }

  // ── Message routing ─────────────────────────────────────────────────────────

  private routeMessage(msg: MidiMessage, deviceId: string, _deviceName: string): void {
    const { midiMappings } = useDJStore.getState();

    for (const mapping of midiMappings) {
      if (!mapping.isEnabled) continue;
      if (mapping.deviceId && mapping.deviceId !== deviceId) continue;
      if (!this.messageMatches(msg, mapping.message)) continue;

      const rawValue = this.extractRawValue(msg);
      const scaled = this.scaleValue(rawValue, mapping);
      this.dispatchAction(mapping.action, scaled, msg);
    }
  }

  private messageMatches(msg: MidiMessage, pattern: MidiMessage): boolean {
    if (msg.type !== pattern.type) return false;
    if (msg.channel !== pattern.channel) return false;
    if (pattern.type === 'note_on' || pattern.type === 'note_off') {
      return msg.note === pattern.note;
    }
    if (pattern.type === 'control_change') {
      return msg.controller === pattern.controller;
    }
    return true;
  }

  private extractRawValue(msg: MidiMessage): number {
    if (msg.type === 'control_change') return msg.value ?? 0;
    if (msg.type === 'note_on') return msg.velocity ?? 0;
    if (msg.type === 'pitch_bend') return msg.value ?? 8192;
    return 0;
  }

  private scaleValue(raw: number, mapping: MidiMapping): number {
    const { scaleMin, scaleMax } = mapping;
    return scaleMin + (raw / 127) * (scaleMax - scaleMin);
  }

  // ── Action dispatch ─────────────────────────────────────────────────────────

  private dispatchAction(action: MidiMappingAction, value: number, msg: MidiMessage): void {
    const store = useDJStore.getState();
    const isOn = (msg.velocity ?? msg.value ?? 0) > 0;

    switch (action.type) {
      case 'deck_play':
        if (isOn) {
          const deck = store.decks[action.deckId];
          deck.playState === 'playing' ? store.pause(action.deckId) : store.play(action.deckId);
        }
        break;
      case 'deck_cue':
        if (isOn) {
          const deck = store.decks[action.deckId];
          if (deck.playState !== 'playing') {
            // Find cue point or go to beginning
            const cue = deck.track?.cuePoints.find(c => c.type === 'load');
            store.seek(action.deckId, cue?.position ?? 0);
          }
        }
        break;
      case 'deck_sync':
        if (isOn) store.setSyncMaster(action.deckId);
        break;
      case 'deck_volume':
        store.setDeckVolume(action.deckId, Math.max(0, Math.min(1, value)));
        break;
      case 'deck_pitch':
        store.setPitch(action.deckId, value);
        break;
      case 'deck_hot_cue':
        if (isOn) store.jumpToHotCue(action.deckId, action.slot);
        break;
      case 'deck_loop_toggle':
        if (isOn) store.setLoopActive(action.deckId, !store.decks[action.deckId].isLoopActive);
        break;
      case 'deck_loop_size': {
        const sizes = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64] as const;
        const idx = Math.round(value * (sizes.length - 1));
        store.setLoopSize(action.deckId, sizes[Math.max(0, Math.min(sizes.length - 1, idx))]);
        break;
      }
      case 'crossfader':
        store.setCrossfader(value);
        break;
      case 'channel_fader':
        store.setChannelFader(action.deckId, Math.max(0, Math.min(1, value)));
        break;
      case 'eq_high':
        store.setEqHigh(action.deckId, value);
        break;
      case 'eq_mid':
        store.setEqMid(action.deckId, value);
        break;
      case 'eq_low':
        store.setEqLow(action.deckId, value);
        break;
      case 'effect_toggle':
        if (isOn) store.toggleEffect(action.effectSlot);
        break;
      case 'effect_param':
        store.setEffectParam(action.effectSlot, action.paramId, value);
        break;
      case 'sampler_pad':
        if (isOn) store.triggerPad(action.padSlot);
        else store.releasePad(action.padSlot);
        break;
      case 'jog_wheel': {
        const raw = msg.value ?? msg.velocity ?? 64;
        const delta = decodeRelativeEncoder(raw, this.relativeMode);
        if (action.mode === 'scratch') {
          store.setNudge(action.deckId as DeckId, delta * 0.01);
        } else {
          const pos = store.decks[action.deckId as DeckId].position + delta * 0.03;
          store.seek(action.deckId as DeckId, pos);
        }
        break;
      }
    }
  }

  // ── MIDI Learn ──────────────────────────────────────────────────────────────

  startLearn(callback: (msg: MidiMessage, deviceId: string) => void): void {
    this.isLearnMode = true;
    this.learnCallback = callback;
  }

  stopLearn(): void {
    this.isLearnMode = false;
    this.learnCallback = null;
  }

  get isLearning(): boolean {
    return this.isLearnMode;
  }

  // ── LED feedback ────────────────────────────────────────────────────────────

  sendNoteOn(deviceId: string, channel: number, note: number, velocity: number): void {
    const output = this.outputs.get(deviceId);
    if (!output) return;
    output.send([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]);
  }

  sendNoteOff(deviceId: string, channel: number, note: number): void {
    const output = this.outputs.get(deviceId);
    if (!output) return;
    output.send([0x80 | (channel & 0x0f), note & 0x7f, 0]);
  }

  sendCC(deviceId: string, channel: number, controller: number, value: number): void {
    const output = this.outputs.get(deviceId);
    if (!output) return;
    output.send([0xb0 | (channel & 0x0f), controller & 0x7f, value & 0x7f]);
  }

  /** Set a deck play button LED on/off */
  setPlayLed(deviceId: string, deckIndex: number, on: boolean): void {
    this.sendNoteOn(deviceId, deckIndex, 11, on ? 127 : 0);
  }

  // ── MIDI Clock ──────────────────────────────────────────────────────────────

  startClock(bpm: number): void {
    this.stopClock();
    this.isSendingClock = true;
    const intervalMs = (60000 / bpm) / PPQN;

    const sendPulse = () => {
      this.outputs.forEach(output => output.send([MIDI_TIMING_CLOCK]));
    };

    // Send START
    this.outputs.forEach(output => output.send([MIDI_START]));
    this.clockIntervalId = setInterval(sendPulse, intervalMs);
  }

  stopClock(): void {
    if (this.clockIntervalId !== null) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
    if (this.isSendingClock) {
      this.outputs.forEach(output => output.send([MIDI_STOP]));
      this.isSendingClock = false;
    }
  }

  updateClockBpm(bpm: number): void {
    if (this.isSendingClock) this.startClock(bpm);
  }

  private handleClockPulse(): void {
    const now = performance.now();
    if (this.lastClockTime > 0) {
      const interval = now - this.lastClockTime;
      this.clockIntervals.push(interval);
      if (this.clockIntervals.length > PPQN) this.clockIntervals.shift();

      // Estimate incoming BPM
      if (this.clockIntervals.length >= 4) {
        const avg = this.clockIntervals.reduce((a, b) => a + b) / this.clockIntervals.length;
        const bpm = 60000 / (avg * PPQN);
        useDJStore.getState().setMasterBpm(parseFloat(bpm.toFixed(1)));
      }
    }
    this.lastClockTime = now;
    this.clockPulseCount++;
  }

  // ── Profile loading ─────────────────────────────────────────────────────────

  loadProfile(profile: ControllerProfile, deviceId: string): void {
    const store = useDJStore.getState();
    // Remove existing mappings for this device
    store.midiMappings
      .filter(m => m.deviceId === deviceId)
      .forEach(m => store.removeMidiMapping(m.id));

    // Add new mappings
    profile.defaultMappings.forEach(m => {
      store.addMidiMapping({ ...m, deviceId });
    });
    console.log(`[MidiEngine] Loaded profile "${profile.name}" for device ${deviceId}`);
  }

  // ── Mapping CRUD ────────────────────────────────────────────────────────────

  exportMappings(): string {
    const { midiMappings, midiDevices } = useDJStore.getState();
    return JSON.stringify({ version: 1, mappings: midiMappings, devices: midiDevices }, null, 2);
  }

  importMappings(json: string): void {
    try {
      const data = JSON.parse(json);
      const mappings = data.mappings as MidiMapping[];
      const store = useDJStore.getState();
      // Clear and re-add
      [...store.midiMappings].forEach(m => store.removeMidiMapping(m.id));
      mappings.forEach(m => store.addMidiMapping(m));
      console.log(`[MidiEngine] Imported ${mappings.length} mappings.`);
    } catch (e) {
      console.error('[MidiEngine] Import failed:', e);
      throw e;
    }
  }

  setVelocityCurve(curve: VelocityCurve): void {
    this.velocityCurve = curve;
  }

  setRelativeMode(mode: RelativeMode): void {
    this.relativeMode = mode;
  }

  dispose(): void {
    this.stopClock();
    this.inputs.forEach(input => { input.onmidimessage = null; });
    this.inputs.clear();
    this.outputs.clear();
    this.midiAccess = null;
  }
}

// Singleton instance
export const midiEngine = new MidiEngine();
