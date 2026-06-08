// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Core Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// ── Primitives ────────────────────────────────────────────────────────────────

export type DeckId = 'A' | 'B' | 'C' | 'D';
export type ChannelId = 1 | 2 | 3 | 4;
export type BeatPosition = number; // beats from track start (float)
export type SampleTime = number;   // seconds from track start (float)
export type Semitones = number;    // pitch offset in semitones
export type Decibels = number;     // amplitude in dB
export type NormalizedGain = number; // 0.0 – 1.0 (or 0.0 – 2.0 for boost)
export type BPM = number;          // beats per minute
export type Milliseconds = number;
export type Hz = number;

// ── Musical key ───────────────────────────────────────────────────────────────

export type MusicalNote = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export type ScaleType = 'major' | 'minor';

export interface MusicalKey {
  note: MusicalNote;
  scale: ScaleType;
  /** Camelot notation e.g. "8A", "11B" */
  camelot: string;
  /** OpenKey notation e.g. "1m", "6d" */
  openKey: string;
}

// ── Waveform data ────────────────────────────────────────────────────────────

export interface WaveformData {
  /** Peak amplitude per pixel column, range -1..1 */
  peaks: Float32Array;
  /** RMS amplitude per pixel column */
  rms: Float32Array;
  /** Number of audio samples represented by each data point */
  samplesPerPixel: number;
  sampleRate: number;
  duration: SampleTime;
}

// ── Beat grid ─────────────────────────────────────────────────────────────────

export interface BeatMarker {
  position: SampleTime;
  beatNumber: number;
  /** True if this is a downbeat (beat 1 of a bar) */
  isDownbeat: boolean;
  confidence: number; // 0..1
}

export interface BeatGrid {
  trackId: string;
  bpm: BPM;
  /** Offset of beat 1 in seconds */
  offset: SampleTime;
  /** If BPM varies, individual beat markers; otherwise derived from bpm+offset */
  markers: BeatMarker[];
  /** Beat-detection algorithm that produced this grid */
  algorithm: 'autocorrelation' | 'onset' | 'manual' | 'imported';
  confidence: number; // 0..1
  isManuallyEdited: boolean;
  lastAnalyzed: number; // unix ms
}

// ── Cue points ────────────────────────────────────────────────────────────────

export type CueType = 'hot_cue' | 'loop_in' | 'loop_out' | 'fade_in' | 'fade_out' | 'load' | 'grid';

export interface CuePoint {
  id: string;
  trackId: string;
  /** Hot cue slot index (0-7) or null for non-hot cues */
  slot: number | null;
  type: CueType;
  position: SampleTime;
  label: string;
  color: string; // CSS hex
  createdAt: number;
}

// ── Loop ─────────────────────────────────────────────────────────────────────

export interface Loop {
  id: string;
  trackId: string;
  inPoint: SampleTime;
  outPoint: SampleTime;
  /** Size as fraction of a bar (e.g. 0.125 = 1/8, 0.5 = 1/2, 1 = 1 bar) */
  barSize: number;
  label: string;
  isActive: boolean;
}

// ── Track ─────────────────────────────────────────────────────────────────────

export type TrackAnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'failed';

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  comment: string;
  composer: string;
  label: string;
  /** ISRC code for rights management */
  isrc: string;
  artworkDataUrl: string | null;
}

export interface Track {
  id: string;
  filePath: string;
  fileSize: number;
  /** SHA-256 of first 4 KB — fast identity check without full hash */
  fileHash: string;
  duration: SampleTime;
  sampleRate: Hz;
  bitrate: number; // kbps
  channels: number;
  codec: string; // e.g. "mp3", "flac", "aac"
  metadata: TrackMetadata;
  bpm: BPM | null;
  key: MusicalKey | null;
  energy: number | null; // 0..1
  loudness: Decibels | null; // integrated LUFS
  waveformData: WaveformData | null;
  beatGrid: BeatGrid | null;
  cuePoints: CuePoint[];
  savedLoops: Loop[];
  tags: string[];
  playCount: number;
  lastPlayedAt: number | null; // unix ms
  dateAdded: number; // unix ms
  analysisStatus: TrackAnalysisStatus;
  analysisError: string | null;
  color: string | null; // user-assigned track color
  rating: 0 | 1 | 2 | 3 | 4 | 5;
}

// ── Stems ─────────────────────────────────────────────────────────────────────

export type StemType = 'vocals' | 'drums' | 'bass' | 'other' | 'melody';

export interface Stem {
  type: StemType;
  /** Path to separated stem audio file or null if not yet generated */
  filePath: string | null;
  audioBuffer: AudioBuffer | null;
  volume: NormalizedGain;
  isMuted: boolean;
}

export interface TrackStems {
  trackId: string;
  stems: Record<StemType, Stem>;
  modelVersion: string;
  separatedAt: number; // unix ms
}

// ── Deck ─────────────────────────────────────────────────────────────────────

export type DeckPlayState = 'stopped' | 'playing' | 'paused' | 'cuing' | 'seeking';
export type SyncMode = 'none' | 'tempo' | 'beat' | 'bar';
export type LoopSize = 0.0625 | 0.125 | 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface HotCueSlot {
  slot: number; // 0-7
  cue: CuePoint | null;
}

export interface DeckState {
  id: DeckId;
  track: Track | null;
  playState: DeckPlayState;
  /** Current playback position in seconds */
  position: SampleTime;
  /** Playback rate multiplier (1.0 = normal, 2.0 = double speed) */
  playbackRate: number;
  pitch: Semitones;
  /** Whether pitch and tempo are locked together */
  keyLock: boolean;
  /** Master volume for this deck */
  volume: NormalizedGain;
  /** Pre-fader trim/gain */
  trim: NormalizedGain;
  syncMode: SyncMode;
  isSyncMaster: boolean;
  hotCues: HotCueSlot[];
  activeLoop: Loop | null;
  isLoopActive: boolean;
  loopSize: LoopSize;
  /** Slip mode: when active, playback "slips" under a loop or scratch */
  slipMode: boolean;
  slipPosition: SampleTime | null;
  stems: TrackStems | null;
  /** Vinyl-simulation mode (jog wheel acts as vinyl platter) */
  vinylMode: boolean;
  nudgeFactor: number; // transient speed adjustment from jog
  /** Quantise cue/loop operations to the nearest beat */
  quantise: boolean;
  waveformZoom: number; // 1 = full track, higher = more zoomed
  needleSearchPosition: number | null; // 0..1 during needle-search drag
}

// ── EQ ────────────────────────────────────────────────────────────────────────

export interface EQBand {
  /** Center/cutoff frequency in Hz */
  frequency: Hz;
  gain: Decibels; // -inf (kill) to +6 dB
  /** Q / resonance of the filter */
  q: number;
}

export interface ThreeBandEQ {
  high: EQBand;
  mid: EQBand;
  low: EQBand;
}

// ── Effects ───────────────────────────────────────────────────────────────────

export type EffectType =
  | 'reverb'
  | 'delay'
  | 'filter'
  | 'flanger'
  | 'phaser'
  | 'chorus'
  | 'compressor'
  | 'distortion'
  | 'bitcrusher'
  | 'beat_repeat'
  | 'stutter'
  | 'granular'
  | 'vinyl_brake'
  | 'echo_out';

export interface EffectParameter {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** If true, value snaps to beat divisions when sync is on */
  beatSync: boolean;
}

export interface Effect {
  id: string;
  type: EffectType;
  label: string;
  isEnabled: boolean;
  /** 0..1 wet/dry ratio */
  wetDry: NormalizedGain;
  parameters: Record<string, EffectParameter>;
  /** Which deck(s) this effect is applied to; empty = all */
  assignedDecks: DeckId[];
  /** Effects chain slot (0-2) */
  slot: 0 | 1 | 2;
}

export interface EffectsUnit {
  slots: [Effect | null, Effect | null, Effect | null];
  isEnabled: boolean;
}

// ── Mixer ─────────────────────────────────────────────────────────────────────

export type CrossfaderCurve = 'linear' | 'fast' | 'slow' | 'scratch' | 'constant_power';

export interface MixerChannel {
  deckId: DeckId;
  channelId: ChannelId;
  faderLevel: NormalizedGain; // channel fader 0..1
  trim: NormalizedGain;
  eq: ThreeBandEQ;
  /** Pre-fader listen (headphone cue) */
  pfluActive: boolean;
  pfluGain: NormalizedGain;
  /** Post-fader metering, peaks in dBFS */
  meterLeft: Decibels;
  meterRight: Decibels;
  isEnabled: boolean;
}

export interface MixerState {
  channels: Record<DeckId, MixerChannel>;
  crossfader: number; // -1 (full A) to +1 (full B)
  crossfaderCurve: CrossfaderCurve;
  /** A-side decks for crossfader routing */
  crossfaderAssignA: DeckId[];
  /** B-side decks for crossfader routing */
  crossfaderAssignB: DeckId[];
  masterVolume: NormalizedGain;
  masterLimiterEnabled: boolean;
  /** Master output metering */
  masterMeterLeft: Decibels;
  masterMeterRight: Decibels;
  boothVolume: NormalizedGain;
  headphoneVolume: NormalizedGain;
  /** Split cue: one ear headphone, one ear master */
  splitCue: boolean;
  headphoneCueMix: number; // 0 = cue only, 1 = master only
  effectsUnit: EffectsUnit;
  /** BPM of the "master" clock source */
  masterBpm: BPM | null;
  masterBeat: number; // current beat number in the bar (1-4)
  masterPhase: number; // 0..1 within the current beat
}

// ── Sampler ───────────────────────────────────────────────────────────────────

export type SamplerPlayMode = 'oneshot' | 'loop' | 'hold' | 'stutter';

export interface SamplerPad {
  slot: number; // 0-15
  track: Track | null;
  volume: NormalizedGain;
  pitch: Semitones;
  playMode: SamplerPlayMode;
  isPlaying: boolean;
  color: string;
  label: string;
}

export interface SamplerState {
  pads: SamplerPad[];
  masterVolume: NormalizedGain;
  syncToMaster: boolean;
  quantise: boolean;
}

// ── Library ───────────────────────────────────────────────────────────────────

export type LibrarySortField =
  | 'title'
  | 'artist'
  | 'album'
  | 'bpm'
  | 'key'
  | 'duration'
  | 'dateAdded'
  | 'lastPlayed'
  | 'playCount'
  | 'energy'
  | 'rating';

export type SortDirection = 'asc' | 'desc';

export interface LibrarySort {
  field: LibrarySortField;
  direction: SortDirection;
}

export type LibraryFilter = {
  query: string;
  genre: string | null;
  key: string | null;
  bpmMin: number | null;
  bpmMax: number | null;
  energyMin: number | null;
  energyMax: number | null;
  rating: number | null;
  tags: string[];
  dateAddedAfter: number | null;
};

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  isSmartPlaylist: boolean;
  smartFilters: LibraryFilter | null;
  createdAt: number;
  updatedAt: number;
  color: string | null;
  icon: string | null;
  /** Nested playlist support */
  parentId: string | null;
}

export interface Crate {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryState {
  tracks: Record<string, Track>;
  playlists: Record<string, Playlist>;
  crates: Record<string, Crate>;
  selectedPlaylistId: string | null;
  selectedCrateId: string | null;
  selectedTrackIds: string[];
  sort: LibrarySort;
  filter: LibraryFilter;
  isScanning: boolean;
  scanProgress: number; // 0..1
  watchedFolders: string[];
}

// ── MIDI ──────────────────────────────────────────────────────────────────────

export type MidiMessageType = 'note_on' | 'note_off' | 'control_change' | 'pitch_bend' | 'program_change';

export interface MidiMessage {
  type: MidiMessageType;
  channel: number; // 0-15
  note?: number;   // 0-127
  velocity?: number; // 0-127
  controller?: number; // 0-127
  value?: number; // 0-127 or 0-16383 for pitch bend
}

export type MidiMappingAction =
  | { type: 'deck_play'; deckId: DeckId }
  | { type: 'deck_cue'; deckId: DeckId }
  | { type: 'deck_sync'; deckId: DeckId }
  | { type: 'deck_volume'; deckId: DeckId }
  | { type: 'deck_pitch'; deckId: DeckId }
  | { type: 'deck_hot_cue'; deckId: DeckId; slot: number }
  | { type: 'deck_loop_size'; deckId: DeckId }
  | { type: 'deck_loop_toggle'; deckId: DeckId }
  | { type: 'crossfader' }
  | { type: 'channel_fader'; deckId: DeckId }
  | { type: 'eq_high'; deckId: DeckId }
  | { type: 'eq_mid'; deckId: DeckId }
  | { type: 'eq_low'; deckId: DeckId }
  | { type: 'effect_toggle'; effectSlot: 0 | 1 | 2 }
  | { type: 'effect_param'; effectSlot: 0 | 1 | 2; paramId: string }
  | { type: 'sampler_pad'; padSlot: number }
  | { type: 'jog_wheel'; deckId: DeckId; mode: 'scratch' | 'nudge' }
  | { type: 'custom_script'; scriptId: string };

export interface MidiMapping {
  id: string;
  label: string;
  message: MidiMessage;
  action: MidiMappingAction;
  /** Scaling function: maps raw MIDI value to action value */
  scaleMin: number;
  scaleMax: number;
  isEnabled: boolean;
  deviceName: string;
  deviceId: string;
}

export interface MidiDevice {
  id: string;
  name: string;
  isConnected: boolean;
  isInput: boolean;
  isOutput: boolean;
  manufacturer: string;
}

// ── Recording ─────────────────────────────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'paused' | 'finishing';
export type RecordingFormat = 'wav' | 'mp3' | 'flac' | 'aac';

export interface Recording {
  id: string;
  filePath: string;
  format: RecordingFormat;
  sampleRate: Hz;
  bitDepth: number;
  startedAt: number; // unix ms
  duration: Milliseconds;
  fileSize: number;
  /** Tracklist built from what was played during the recording */
  tracklist: Array<{ trackId: string; startTime: Milliseconds }>;
}

// ── History ───────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  trackId: string;
  deckId: DeckId;
  playedAt: number; // unix ms
  duration: Milliseconds; // how long it was actually played
  setId: string | null;
}

export interface SetHistory {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  entries: HistoryEntry[];
  recording: Recording | null;
}

// ── Plugin system ─────────────────────────────────────────────────────────────

export type PluginType = 'effect' | 'visualizer' | 'analyzer' | 'source';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  type: PluginType;
  entryPoint: string;
  minAppVersion: string;
  permissions: Array<'audio' | 'midi' | 'filesystem' | 'network'>;
}

export interface Plugin {
  manifest: PluginManifest;
  isEnabled: boolean;
  isLoaded: boolean;
  settings: Record<string, unknown>;
  error: string | null;
}

// ── Global settings ───────────────────────────────────────────────────────────

export interface AudioSettings {
  outputDevice: string;
  inputDevice: string | null;
  sampleRate: Hz;
  bufferSize: number; // samples (64, 128, 256, 512, 1024, 2048)
  bitDepth: 16 | 24 | 32;
  masterLatencyMs: Milliseconds;
}

export interface AppSettings {
  audio: AudioSettings;
  theme: 'dark' | 'light' | 'system';
  language: string;
  /** Quantize beat-sync operations to nearest beat */
  quantiseDefault: boolean;
  /** Auto-analyse new tracks on import */
  autoAnalyse: boolean;
  /** Number of decks to show (2 or 4) */
  deckCount: 2 | 4;
  /** Show sampler panel */
  samplerVisible: boolean;
  /** Show effects panel */
  effectsVisible: boolean;
  /** Waveform display style */
  waveformStyle: 'filled' | 'mirrored' | '3d';
  /** Beats per bar for the master clock */
  beatsPerBar: 2 | 3 | 4;
  recordingFormat: RecordingFormat;
  recordingPath: string;
  /** Path to ONNX stem separation model */
  stemModelPath: string | null;
  shortcuts: Record<string, string>;
}

// ── Root application state ────────────────────────────────────────────────────

export interface AppState {
  decks: Record<DeckId, DeckState>;
  mixer: MixerState;
  sampler: SamplerState;
  library: LibraryState;
  midiMappings: MidiMapping[];
  midiDevices: MidiDevice[];
  history: HistoryEntry[];
  currentSet: SetHistory | null;
  activeRecording: Recording | null;
  plugins: Plugin[];
  settings: AppSettings;
  isInitialized: boolean;
  initError: string | null;
}
