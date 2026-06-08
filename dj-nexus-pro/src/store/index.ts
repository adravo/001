// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Zustand Store
// All DJ application state lives here. Slices are co-located but the store is
// a single flat atom so cross-slice reads remain zero-cost (no context overhead).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  AppState,
  AppSettings,
  AudioSettings,
  DeckId,
  DeckState,
  Track,
  CuePoint,
  Loop,
  LoopSize,
  SyncMode,
  MixerState,
  MixerChannel,
  SamplerState,
  SamplerPad,
  SamplerPlayMode,
  LibraryState,
  LibrarySort,
  LibraryFilter,
  Playlist,
  Crate,
  Effect,
  EffectType,
  MidiMapping,
  MidiDevice,
  HistoryEntry,
  SetHistory,
  Recording,
  RecordingFormat,
  Plugin,
  BeatGrid,
  WaveformData,
  TrackStems,
  CrossfaderCurve,
  NormalizedGain,
  Decibels,
  BPM,
} from '../types';

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULT_EQ = {
  high: { frequency: 10000, gain: 0, q: 0.7 },
  mid: { frequency: 1000, gain: 0, q: 0.7 },
  low: { frequency: 100, gain: 0, q: 0.7 },
};

function makeDeck(id: DeckId): DeckState {
  return {
    id,
    track: null,
    playState: 'stopped',
    position: 0,
    playbackRate: 1.0,
    pitch: 0,
    keyLock: false,
    volume: 1.0,
    trim: 1.0,
    syncMode: 'none',
    isSyncMaster: false,
    hotCues: Array.from({ length: 8 }, (_, i) => ({ slot: i, cue: null })),
    activeLoop: null,
    isLoopActive: false,
    loopSize: 2,
    slipMode: false,
    slipPosition: null,
    stems: null,
    vinylMode: true,
    nudgeFactor: 0,
    quantise: true,
    waveformZoom: 1,
    needleSearchPosition: null,
  };
}

function makeMixerChannel(deckId: DeckId, channelId: MixerChannel['channelId']): MixerChannel {
  return {
    deckId,
    channelId,
    faderLevel: 1.0,
    trim: 1.0,
    eq: { ...DEFAULT_EQ },
    pfluActive: false,
    pfluGain: 1.0,
    meterLeft: -60,
    meterRight: -60,
    isEnabled: true,
  };
}

const DEFAULT_LIBRARY_FILTER: LibraryFilter = {
  query: '',
  genre: null,
  key: null,
  bpmMin: null,
  bpmMax: null,
  energyMin: null,
  energyMax: null,
  rating: null,
  tags: [],
  dateAddedAfter: null,
};

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  outputDevice: 'default',
  inputDevice: null,
  sampleRate: 44100,
  bufferSize: 512,
  bitDepth: 24,
  masterLatencyMs: 0,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  audio: DEFAULT_AUDIO_SETTINGS,
  theme: 'dark',
  language: 'en',
  quantiseDefault: true,
  autoAnalyse: true,
  deckCount: 2,
  samplerVisible: false,
  effectsVisible: true,
  waveformStyle: 'mirrored',
  beatsPerBar: 4,
  recordingFormat: 'wav',
  recordingPath: '',
  stemModelPath: null,
  shortcuts: {},
};

// ── Initial state ─────────────────────────────────────────────────────────────

function buildInitialState(): AppState {
  const decks: Record<DeckId, DeckState> = {
    A: makeDeck('A'),
    B: makeDeck('B'),
    C: makeDeck('C'),
    D: makeDeck('D'),
  };

  const mixer: MixerState = {
    channels: {
      A: makeMixerChannel('A', 1),
      B: makeMixerChannel('B', 2),
      C: makeMixerChannel('C', 3),
      D: makeMixerChannel('D', 4),
    },
    crossfader: 0,
    crossfaderCurve: 'constant_power',
    crossfaderAssignA: ['A', 'C'],
    crossfaderAssignB: ['B', 'D'],
    masterVolume: 1.0,
    masterLimiterEnabled: true,
    masterMeterLeft: -60,
    masterMeterRight: -60,
    boothVolume: 1.0,
    headphoneVolume: 0.8,
    splitCue: false,
    headphoneCueMix: 0.5,
    effectsUnit: { slots: [null, null, null], isEnabled: true },
    masterBpm: null,
    masterBeat: 1,
    masterPhase: 0,
  };

  const sampler: SamplerState = {
    pads: Array.from({ length: 16 }, (_, i): SamplerPad => ({
      slot: i,
      track: null,
      volume: 1.0,
      pitch: 0,
      playMode: 'oneshot',
      isPlaying: false,
      color: '#444466',
      label: `Pad ${i + 1}`,
    })),
    masterVolume: 1.0,
    syncToMaster: true,
    quantise: true,
  };

  const library: LibraryState = {
    tracks: {},
    playlists: {},
    crates: {},
    selectedPlaylistId: null,
    selectedCrateId: null,
    selectedTrackIds: [],
    sort: { field: 'title', direction: 'asc' },
    filter: { ...DEFAULT_LIBRARY_FILTER },
    isScanning: false,
    scanProgress: 0,
    watchedFolders: [],
  };

  return {
    decks,
    mixer,
    sampler,
    library,
    midiMappings: [],
    midiDevices: [],
    history: [],
    currentSet: null,
    activeRecording: null,
    plugins: [],
    settings: { ...DEFAULT_APP_SETTINGS },
    isInitialized: false,
    initError: null,
  };
}

// ── Store actions interface ────────────────────────────────────────────────────

export interface DJStoreActions {
  // Init
  initialize: () => void;
  setInitError: (error: string) => void;

  // Deck actions
  loadTrack: (deckId: DeckId, track: Track) => void;
  unloadTrack: (deckId: DeckId) => void;
  play: (deckId: DeckId) => void;
  pause: (deckId: DeckId) => void;
  stop: (deckId: DeckId) => void;
  seek: (deckId: DeckId, position: number) => void;
  setPlaybackRate: (deckId: DeckId, rate: number) => void;
  setPitch: (deckId: DeckId, semitones: number) => void;
  setKeyLock: (deckId: DeckId, enabled: boolean) => void;
  setDeckVolume: (deckId: DeckId, volume: NormalizedGain) => void;
  setTrim: (deckId: DeckId, trim: NormalizedGain) => void;
  setSyncMode: (deckId: DeckId, mode: SyncMode) => void;
  setSyncMaster: (deckId: DeckId) => void;
  setHotCue: (deckId: DeckId, slot: number, cue: CuePoint | null) => void;
  jumpToHotCue: (deckId: DeckId, slot: number) => void;
  setActiveLoop: (deckId: DeckId, loop: Loop | null) => void;
  setLoopActive: (deckId: DeckId, active: boolean) => void;
  setLoopSize: (deckId: DeckId, size: LoopSize) => void;
  toggleSlipMode: (deckId: DeckId) => void;
  setVinylMode: (deckId: DeckId, enabled: boolean) => void;
  setNudge: (deckId: DeckId, factor: number) => void;
  setQuantise: (deckId: DeckId, enabled: boolean) => void;
  setWaveformZoom: (deckId: DeckId, zoom: number) => void;
  setPosition: (deckId: DeckId, position: number) => void; // called by audio engine on tick
  setStems: (deckId: DeckId, stems: TrackStems | null) => void;

  // Mixer actions
  setCrossfader: (value: number) => void;
  setCrossfaderCurve: (curve: CrossfaderCurve) => void;
  setChannelFader: (deckId: DeckId, level: NormalizedGain) => void;
  setChannelTrim: (deckId: DeckId, trim: NormalizedGain) => void;
  setEqHigh: (deckId: DeckId, gain: Decibels) => void;
  setEqMid: (deckId: DeckId, gain: Decibels) => void;
  setEqLow: (deckId: DeckId, gain: Decibels) => void;
  setPflu: (deckId: DeckId, active: boolean) => void;
  setMasterVolume: (volume: NormalizedGain) => void;
  setBoothVolume: (volume: NormalizedGain) => void;
  setHeadphoneVolume: (volume: NormalizedGain) => void;
  setSplitCue: (enabled: boolean) => void;
  setHeadphoneCueMix: (mix: number) => void;
  updateMeters: (deckId: DeckId, left: Decibels, right: Decibels) => void;
  updateMasterMeters: (left: Decibels, right: Decibels) => void;
  setMasterBpm: (bpm: BPM | null) => void;
  setMasterBeat: (beat: number, phase: number) => void;

  // Effects
  addEffect: (slot: 0 | 1 | 2, type: EffectType) => void;
  removeEffect: (slot: 0 | 1 | 2) => void;
  toggleEffect: (slot: 0 | 1 | 2) => void;
  setEffectWetDry: (slot: 0 | 1 | 2, wetDry: NormalizedGain) => void;
  setEffectParam: (slot: 0 | 1 | 2, paramId: string, value: number) => void;
  toggleEffectsUnit: () => void;

  // Sampler
  loadSamplerPad: (padSlot: number, track: Track) => void;
  unloadSamplerPad: (padSlot: number) => void;
  triggerPad: (padSlot: number) => void;
  releasePad: (padSlot: number) => void;
  setPadVolume: (padSlot: number, volume: NormalizedGain) => void;
  setPadPitch: (padSlot: number, pitch: number) => void;
  setPadPlayMode: (padSlot: number, mode: SamplerPlayMode) => void;
  setSamplerMasterVolume: (volume: NormalizedGain) => void;

  // Library
  addTracks: (tracks: Track[]) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  removeTrack: (trackId: string) => void;
  setTrackBeatGrid: (trackId: string, beatGrid: BeatGrid) => void;
  setTrackWaveform: (trackId: string, waveform: WaveformData) => void;
  createPlaylist: (name: string, description?: string) => string;
  updatePlaylist: (playlistId: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  createCrate: (name: string) => string;
  updateCrate: (crateId: string, updates: Partial<Crate>) => void;
  deleteCrate: (crateId: string) => void;
  addTrackToCrate: (crateId: string, trackId: string) => void;
  removeTrackFromCrate: (crateId: string, trackId: string) => void;
  selectPlaylist: (playlistId: string | null) => void;
  selectCrate: (crateId: string | null) => void;
  selectTracks: (trackIds: string[]) => void;
  setLibrarySort: (sort: LibrarySort) => void;
  setLibraryFilter: (filter: Partial<LibraryFilter>) => void;
  clearLibraryFilter: () => void;
  setScanProgress: (progress: number, isScanning: boolean) => void;
  addWatchedFolder: (folderPath: string) => void;
  removeWatchedFolder: (folderPath: string) => void;

  // MIDI
  addMidiMapping: (mapping: Omit<MidiMapping, 'id'>) => string;
  updateMidiMapping: (mappingId: string, updates: Partial<MidiMapping>) => void;
  removeMidiMapping: (mappingId: string) => void;
  setMidiDevices: (devices: MidiDevice[]) => void;

  // History & sets
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id'>) => void;
  startSet: (name?: string) => void;
  endSet: () => void;

  // Recording
  startRecording: (format: RecordingFormat, filePath: string) => void;
  stopRecording: () => void;
  updateRecordingDuration: (duration: number) => void;

  // Plugins
  registerPlugin: (plugin: Plugin) => void;
  togglePlugin: (pluginId: string) => void;
  setPluginSettings: (pluginId: string, settings: Record<string, unknown>) => void;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateAudioSettings: (updates: Partial<AudioSettings>) => void;
  resetSettings: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export type DJStore = AppState & DJStoreActions;

export const useDJStore = create<DJStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...buildInitialState(),

      // ── Init ──────────────────────────────────────────────────────────────

      initialize: () =>
        set(state => {
          state.isInitialized = true;
          state.initError = null;
        }),

      setInitError: (error: string) =>
        set(state => {
          state.initError = error;
          state.isInitialized = false;
        }),

      // ── Deck ─────────────────────────────────────────────────────────────

      loadTrack: (deckId, track) =>
        set(state => {
          const deck = state.decks[deckId];
          deck.track = track;
          deck.position = 0;
          deck.playState = 'stopped';
          deck.activeLoop = null;
          deck.isLoopActive = false;
          // Reset hot cues to stored ones from the track
          deck.hotCues = Array.from({ length: 8 }, (_, i) => ({
            slot: i,
            cue: track.cuePoints.find(c => c.type === 'hot_cue' && c.slot === i) ?? null,
          }));
          // Add to history when loaded
          if (get().currentSet) {
            state.history.push({
              id: uuidv4(),
              trackId: track.id,
              deckId,
              playedAt: Date.now(),
              duration: 0,
              setId: get().currentSet?.id ?? null,
            });
          }
        }),

      unloadTrack: (deckId) =>
        set(state => {
          const deck = state.decks[deckId];
          deck.track = null;
          deck.playState = 'stopped';
          deck.position = 0;
          deck.activeLoop = null;
          deck.isLoopActive = false;
          deck.stems = null;
          deck.slipMode = false;
          deck.slipPosition = null;
        }),

      play: (deckId) =>
        set(state => {
          if (state.decks[deckId].track) {
            state.decks[deckId].playState = 'playing';
          }
        }),

      pause: (deckId) =>
        set(state => {
          state.decks[deckId].playState = 'paused';
        }),

      stop: (deckId) =>
        set(state => {
          state.decks[deckId].playState = 'stopped';
          state.decks[deckId].position = 0;
        }),

      seek: (deckId, position) =>
        set(state => {
          const deck = state.decks[deckId];
          const duration = deck.track?.duration ?? 0;
          deck.position = Math.max(0, Math.min(position, duration));
          // In slip mode, the "surface" position advances separately
          if (!deck.slipMode) {
            deck.slipPosition = null;
          }
        }),

      setPlaybackRate: (deckId, rate) =>
        set(state => {
          // Clamp rate to ±50% to avoid dangerous extremes
          state.decks[deckId].playbackRate = Math.max(0.5, Math.min(2.0, rate));
        }),

      setPitch: (deckId, semitones) =>
        set(state => {
          state.decks[deckId].pitch = Math.max(-12, Math.min(12, semitones));
        }),

      setKeyLock: (deckId, enabled) =>
        set(state => {
          state.decks[deckId].keyLock = enabled;
        }),

      setDeckVolume: (deckId, volume) =>
        set(state => {
          state.decks[deckId].volume = Math.max(0, Math.min(1, volume));
        }),

      setTrim: (deckId, trim) =>
        set(state => {
          state.decks[deckId].trim = Math.max(0, Math.min(2, trim));
        }),

      setSyncMode: (deckId, mode) =>
        set(state => {
          state.decks[deckId].syncMode = mode;
        }),

      setSyncMaster: (deckId) =>
        set(state => {
          // Clear master flag from all other decks first
          (Object.keys(state.decks) as DeckId[]).forEach(id => {
            state.decks[id].isSyncMaster = id === deckId;
          });
          // Propagate master BPM from this deck
          const masterBpm = state.decks[deckId].track?.bpm ?? null;
          state.mixer.masterBpm = masterBpm;
        }),

      setHotCue: (deckId, slot, cue) =>
        set(state => {
          const hotCue = state.decks[deckId].hotCues.find(h => h.slot === slot);
          if (hotCue) hotCue.cue = cue;
        }),

      jumpToHotCue: (deckId, slot) =>
        set(state => {
          const hotCue = state.decks[deckId].hotCues.find(h => h.slot === slot);
          if (hotCue?.cue) {
            state.decks[deckId].position = hotCue.cue.position;
          }
        }),

      setActiveLoop: (deckId, loop) =>
        set(state => {
          state.decks[deckId].activeLoop = loop;
        }),

      setLoopActive: (deckId, active) =>
        set(state => {
          state.decks[deckId].isLoopActive = active;
        }),

      setLoopSize: (deckId, size) =>
        set(state => {
          state.decks[deckId].loopSize = size;
        }),

      toggleSlipMode: (deckId) =>
        set(state => {
          const deck = state.decks[deckId];
          deck.slipMode = !deck.slipMode;
          if (!deck.slipMode) {
            deck.slipPosition = null;
          } else {
            deck.slipPosition = deck.position;
          }
        }),

      setVinylMode: (deckId, enabled) =>
        set(state => {
          state.decks[deckId].vinylMode = enabled;
        }),

      setNudge: (deckId, factor) =>
        set(state => {
          state.decks[deckId].nudgeFactor = factor;
        }),

      setQuantise: (deckId, enabled) =>
        set(state => {
          state.decks[deckId].quantise = enabled;
        }),

      setWaveformZoom: (deckId, zoom) =>
        set(state => {
          state.decks[deckId].waveformZoom = Math.max(1, Math.min(32, zoom));
        }),

      setPosition: (deckId, position) =>
        set(state => {
          state.decks[deckId].position = position;
        }),

      setStems: (deckId, stems) =>
        set(state => {
          state.decks[deckId].stems = stems;
        }),

      // ── Mixer ─────────────────────────────────────────────────────────────

      setCrossfader: (value) =>
        set(state => {
          state.mixer.crossfader = Math.max(-1, Math.min(1, value));
        }),

      setCrossfaderCurve: (curve) =>
        set(state => {
          state.mixer.crossfaderCurve = curve;
        }),

      setChannelFader: (deckId, level) =>
        set(state => {
          state.mixer.channels[deckId].faderLevel = Math.max(0, Math.min(1, level));
        }),

      setChannelTrim: (deckId, trim) =>
        set(state => {
          state.mixer.channels[deckId].trim = Math.max(0, Math.min(2, trim));
        }),

      setEqHigh: (deckId, gain) =>
        set(state => {
          state.mixer.channels[deckId].eq.high.gain = Math.max(-Infinity, Math.min(6, gain));
        }),

      setEqMid: (deckId, gain) =>
        set(state => {
          state.mixer.channels[deckId].eq.mid.gain = Math.max(-Infinity, Math.min(6, gain));
        }),

      setEqLow: (deckId, gain) =>
        set(state => {
          state.mixer.channels[deckId].eq.low.gain = Math.max(-Infinity, Math.min(6, gain));
        }),

      setPflu: (deckId, active) =>
        set(state => {
          state.mixer.channels[deckId].pfluActive = active;
        }),

      setMasterVolume: (volume) =>
        set(state => {
          state.mixer.masterVolume = Math.max(0, Math.min(1.5, volume));
        }),

      setBoothVolume: (volume) =>
        set(state => {
          state.mixer.boothVolume = Math.max(0, Math.min(1, volume));
        }),

      setHeadphoneVolume: (volume) =>
        set(state => {
          state.mixer.headphoneVolume = Math.max(0, Math.min(1, volume));
        }),

      setSplitCue: (enabled) =>
        set(state => {
          state.mixer.splitCue = enabled;
        }),

      setHeadphoneCueMix: (mix) =>
        set(state => {
          state.mixer.headphoneCueMix = Math.max(0, Math.min(1, mix));
        }),

      updateMeters: (deckId, left, right) =>
        set(state => {
          state.mixer.channels[deckId].meterLeft = left;
          state.mixer.channels[deckId].meterRight = right;
        }),

      updateMasterMeters: (left, right) =>
        set(state => {
          state.mixer.masterMeterLeft = left;
          state.mixer.masterMeterRight = right;
        }),

      setMasterBpm: (bpm) =>
        set(state => {
          state.mixer.masterBpm = bpm;
        }),

      setMasterBeat: (beat, phase) =>
        set(state => {
          state.mixer.masterBeat = beat;
          state.mixer.masterPhase = phase;
        }),

      // ── Effects ───────────────────────────────────────────────────────────

      addEffect: (slot, type) =>
        set(state => {
          const effect: Effect = {
            id: uuidv4(),
            type,
            label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            isEnabled: true,
            wetDry: 0.5,
            parameters: {},
            assignedDecks: [],
            slot,
          };
          state.mixer.effectsUnit.slots[slot] = effect;
        }),

      removeEffect: (slot) =>
        set(state => {
          state.mixer.effectsUnit.slots[slot] = null;
        }),

      toggleEffect: (slot) =>
        set(state => {
          const effect = state.mixer.effectsUnit.slots[slot];
          if (effect) effect.isEnabled = !effect.isEnabled;
        }),

      setEffectWetDry: (slot, wetDry) =>
        set(state => {
          const effect = state.mixer.effectsUnit.slots[slot];
          if (effect) effect.wetDry = Math.max(0, Math.min(1, wetDry));
        }),

      setEffectParam: (slot, paramId, value) =>
        set(state => {
          const effect = state.mixer.effectsUnit.slots[slot];
          if (effect?.parameters[paramId]) {
            const p = effect.parameters[paramId];
            effect.parameters[paramId].value = Math.max(p.min, Math.min(p.max, value));
          }
        }),

      toggleEffectsUnit: () =>
        set(state => {
          state.mixer.effectsUnit.isEnabled = !state.mixer.effectsUnit.isEnabled;
        }),

      // ── Sampler ───────────────────────────────────────────────────────────

      loadSamplerPad: (padSlot, track) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad) {
            pad.track = track;
            pad.label = track.metadata.title || `Pad ${padSlot + 1}`;
          }
        }),

      unloadSamplerPad: (padSlot) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad) {
            pad.track = null;
            pad.isPlaying = false;
          }
        }),

      triggerPad: (padSlot) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad?.track) pad.isPlaying = true;
        }),

      releasePad: (padSlot) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad && pad.playMode === 'hold') pad.isPlaying = false;
        }),

      setPadVolume: (padSlot, volume) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad) pad.volume = Math.max(0, Math.min(1, volume));
        }),

      setPadPitch: (padSlot, pitch) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad) pad.pitch = Math.max(-12, Math.min(12, pitch));
        }),

      setPadPlayMode: (padSlot, mode) =>
        set(state => {
          const pad = state.sampler.pads[padSlot];
          if (pad) pad.playMode = mode;
        }),

      setSamplerMasterVolume: (volume) =>
        set(state => {
          state.sampler.masterVolume = Math.max(0, Math.min(1, volume));
        }),

      // ── Library ───────────────────────────────────────────────────────────

      addTracks: (tracks) =>
        set(state => {
          tracks.forEach(track => {
            state.library.tracks[track.id] = track;
          });
        }),

      updateTrack: (trackId, updates) =>
        set(state => {
          const track = state.library.tracks[trackId];
          if (track) Object.assign(track, updates);
        }),

      removeTrack: (trackId) =>
        set(state => {
          delete state.library.tracks[trackId];
          // Clean up from playlists and crates
          Object.values(state.library.playlists).forEach(pl => {
            pl.trackIds = pl.trackIds.filter(id => id !== trackId);
          });
          Object.values(state.library.crates).forEach(cr => {
            cr.trackIds = cr.trackIds.filter(id => id !== trackId);
          });
        }),

      setTrackBeatGrid: (trackId, beatGrid) =>
        set(state => {
          const track = state.library.tracks[trackId];
          if (track) {
            track.beatGrid = beatGrid;
            track.bpm = beatGrid.bpm;
          }
        }),

      setTrackWaveform: (trackId, waveform) =>
        set(state => {
          const track = state.library.tracks[trackId];
          if (track) track.waveformData = waveform;
        }),

      createPlaylist: (name, description = '') => {
        const id = uuidv4();
        set(state => {
          state.library.playlists[id] = {
            id,
            name,
            description,
            trackIds: [],
            isSmartPlaylist: false,
            smartFilters: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            color: null,
            icon: null,
            parentId: null,
          };
        });
        return id;
      },

      updatePlaylist: (playlistId, updates) =>
        set(state => {
          const pl = state.library.playlists[playlistId];
          if (pl) {
            Object.assign(pl, updates);
            pl.updatedAt = Date.now();
          }
        }),

      deletePlaylist: (playlistId) =>
        set(state => {
          delete state.library.playlists[playlistId];
          if (state.library.selectedPlaylistId === playlistId) {
            state.library.selectedPlaylistId = null;
          }
        }),

      addTrackToPlaylist: (playlistId, trackId) =>
        set(state => {
          const pl = state.library.playlists[playlistId];
          if (pl && !pl.trackIds.includes(trackId)) {
            pl.trackIds.push(trackId);
            pl.updatedAt = Date.now();
          }
        }),

      removeTrackFromPlaylist: (playlistId, trackId) =>
        set(state => {
          const pl = state.library.playlists[playlistId];
          if (pl) {
            pl.trackIds = pl.trackIds.filter(id => id !== trackId);
            pl.updatedAt = Date.now();
          }
        }),

      reorderPlaylistTracks: (playlistId, fromIndex, toIndex) =>
        set(state => {
          const pl = state.library.playlists[playlistId];
          if (pl) {
            const [item] = pl.trackIds.splice(fromIndex, 1);
            pl.trackIds.splice(toIndex, 0, item);
            pl.updatedAt = Date.now();
          }
        }),

      createCrate: (name) => {
        const id = uuidv4();
        set(state => {
          state.library.crates[id] = {
            id,
            name,
            description: '',
            trackIds: [],
            color: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        });
        return id;
      },

      updateCrate: (crateId, updates) =>
        set(state => {
          const cr = state.library.crates[crateId];
          if (cr) {
            Object.assign(cr, updates);
            cr.updatedAt = Date.now();
          }
        }),

      deleteCrate: (crateId) =>
        set(state => {
          delete state.library.crates[crateId];
          if (state.library.selectedCrateId === crateId) {
            state.library.selectedCrateId = null;
          }
        }),

      addTrackToCrate: (crateId, trackId) =>
        set(state => {
          const cr = state.library.crates[crateId];
          if (cr && !cr.trackIds.includes(trackId)) {
            cr.trackIds.push(trackId);
            cr.updatedAt = Date.now();
          }
        }),

      removeTrackFromCrate: (crateId, trackId) =>
        set(state => {
          const cr = state.library.crates[crateId];
          if (cr) {
            cr.trackIds = cr.trackIds.filter(id => id !== trackId);
            cr.updatedAt = Date.now();
          }
        }),

      selectPlaylist: (playlistId) =>
        set(state => {
          state.library.selectedPlaylistId = playlistId;
          state.library.selectedCrateId = null;
        }),

      selectCrate: (crateId) =>
        set(state => {
          state.library.selectedCrateId = crateId;
          state.library.selectedPlaylistId = null;
        }),

      selectTracks: (trackIds) =>
        set(state => {
          state.library.selectedTrackIds = trackIds;
        }),

      setLibrarySort: (sort) =>
        set(state => {
          state.library.sort = sort;
        }),

      setLibraryFilter: (filter) =>
        set(state => {
          Object.assign(state.library.filter, filter);
        }),

      clearLibraryFilter: () =>
        set(state => {
          state.library.filter = { ...DEFAULT_LIBRARY_FILTER };
        }),

      setScanProgress: (progress, isScanning) =>
        set(state => {
          state.library.scanProgress = progress;
          state.library.isScanning = isScanning;
        }),

      addWatchedFolder: (folderPath) =>
        set(state => {
          if (!state.library.watchedFolders.includes(folderPath)) {
            state.library.watchedFolders.push(folderPath);
          }
        }),

      removeWatchedFolder: (folderPath) =>
        set(state => {
          state.library.watchedFolders = state.library.watchedFolders.filter(f => f !== folderPath);
        }),

      // ── MIDI ──────────────────────────────────────────────────────────────

      addMidiMapping: (mapping) => {
        const id = uuidv4();
        set(state => {
          state.midiMappings.push({ ...mapping, id });
        });
        return id;
      },

      updateMidiMapping: (mappingId, updates) =>
        set(state => {
          const m = state.midiMappings.find(m => m.id === mappingId);
          if (m) Object.assign(m, updates);
        }),

      removeMidiMapping: (mappingId) =>
        set(state => {
          state.midiMappings = state.midiMappings.filter(m => m.id !== mappingId);
        }),

      setMidiDevices: (devices) =>
        set(state => {
          state.midiDevices = devices;
        }),

      // ── History ───────────────────────────────────────────────────────────

      addHistoryEntry: (entry) =>
        set(state => {
          const full: HistoryEntry = { ...entry, id: uuidv4() };
          state.history.push(full);
          // Keep last 10000 entries in memory
          if (state.history.length > 10000) {
            state.history = state.history.slice(-10000);
          }
        }),

      startSet: (name) =>
        set(state => {
          state.currentSet = {
            id: uuidv4(),
            name: name ?? `Set ${new Date().toLocaleDateString()}`,
            startedAt: Date.now(),
            endedAt: null,
            entries: [],
            recording: null,
          };
        }),

      endSet: () =>
        set(state => {
          if (state.currentSet) {
            state.currentSet.endedAt = Date.now();
            state.currentSet = null;
          }
        }),

      // ── Recording ─────────────────────────────────────────────────────────

      startRecording: (format, filePath) =>
        set(state => {
          state.activeRecording = {
            id: uuidv4(),
            filePath,
            format,
            sampleRate: state.settings.audio.sampleRate,
            bitDepth: state.settings.audio.bitDepth,
            startedAt: Date.now(),
            duration: 0,
            fileSize: 0,
            tracklist: [],
          };
        }),

      stopRecording: () =>
        set(state => {
          state.activeRecording = null;
        }),

      updateRecordingDuration: (duration) =>
        set(state => {
          if (state.activeRecording) {
            state.activeRecording.duration = duration;
          }
        }),

      // ── Plugins ───────────────────────────────────────────────────────────

      registerPlugin: (plugin) =>
        set(state => {
          const existing = state.plugins.findIndex(p => p.manifest.id === plugin.manifest.id);
          if (existing >= 0) {
            state.plugins[existing] = plugin;
          } else {
            state.plugins.push(plugin);
          }
        }),

      togglePlugin: (pluginId) =>
        set(state => {
          const plugin = state.plugins.find(p => p.manifest.id === pluginId);
          if (plugin) plugin.isEnabled = !plugin.isEnabled;
        }),

      setPluginSettings: (pluginId, settings) =>
        set(state => {
          const plugin = state.plugins.find(p => p.manifest.id === pluginId);
          if (plugin) plugin.settings = settings;
        }),

      // ── Settings ──────────────────────────────────────────────────────────

      updateSettings: (updates) =>
        set(state => {
          Object.assign(state.settings, updates);
        }),

      updateAudioSettings: (updates) =>
        set(state => {
          Object.assign(state.settings.audio, updates);
        }),

      resetSettings: () =>
        set(state => {
          state.settings = { ...DEFAULT_APP_SETTINGS };
        }),
    }))
  )
);

// ── Convenience selectors ─────────────────────────────────────────────────────

export const selectDeck = (deckId: DeckId) => (state: DJStore) => state.decks[deckId];
export const selectMixerChannel = (deckId: DeckId) => (state: DJStore) => state.mixer.channels[deckId];
export const selectTrack = (trackId: string) => (state: DJStore) => state.library.tracks[trackId];
export const selectPlaylist = (playlistId: string) => (state: DJStore) => state.library.playlists[playlistId];
export const selectSamplerPad = (slot: number) => (state: DJStore) => state.sampler.pads[slot];
export const selectEffect = (slot: 0 | 1 | 2) => (state: DJStore) => state.mixer.effectsUnit.slots[slot];
export const selectIsPlaying = (deckId: DeckId) => (state: DJStore) => state.decks[deckId].playState === 'playing';
export const selectMasterBpm = (state: DJStore) => state.mixer.masterBpm;
export const selectAllTracks = (state: DJStore) => Object.values(state.library.tracks);
