// Re-export the types needed by db.ts from the shared types module.
// This file exists so the Node/Electron process can import types without
// pulling in DOM-dependent modules from src/types/index.ts.

export type {
  Track,
  TrackMetadata,
  BeatGrid,
  BeatMarker,
  CuePoint,
  CueType,
  Loop,
  WaveformData,
  Playlist,
  LibraryFilter,
  Crate,
  HistoryEntry,
  SetHistory,
  Recording,
  RecordingFormat,
  MidiMapping,
  MidiMessage,
  MidiMappingAction,
  DeckId,
  MusicalNote,
  ScaleType,
  MusicalKey,
} from '../src/types/index';
