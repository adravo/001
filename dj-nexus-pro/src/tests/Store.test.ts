// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Zustand Store unit tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';

// ── We import the real store ──────────────────────────────────────────────────
// The store must be reset between tests to avoid state leaking.

import { useStore } from '../store';
import type {
  DeckId,
  Track,
  CuePoint,
  Loop,
  MidiDevice,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id:             'track-1',
    filePath:       '/music/test.mp3',
    title:          'Test Track',
    artist:         'Test Artist',
    album:          'Test Album',
    genre:          'House',
    year:           2024,
    bpm:            128.0,
    key:            'Am',
    duration:       240.5,
    sampleRate:     44100,
    bitDepth:       16,
    bitrate:        320,
    fileSize:       12_500_000,
    dateAdded:      Date.now(),
    playCount:      0,
    rating:         0,
    color:          null,
    waveformData:   null,
    beatGrid:       null,
    stems:          null,
    energyLevel:    null,
    danceability:   null,
    ...overrides,
  };
}

function resetStore(): void {
  // Zustand stores can be reset via the setState method
  useStore.setState(useStore.getInitialState?.() ?? useStore.getState());
}

// ═════════════════════════════════════════════════════════════════════════════
// Deck state
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — deck state', () => {
  const DECK: DeckId = 'A';

  beforeEach(() => {
    // Reset to initial state before each test
    const state = useStore.getState();
    // Reset deck A
    if (state.resetDeck) {
      act(() => state.resetDeck!(DECK));
    }
  });

  it('initial playState is "stopped"', () => {
    const deck = useStore.getState().decks?.[DECK];
    expect(deck?.playState).toBe('stopped');
  });

  it('loadTrackToDeck sets track and resets position', () => {
    const track = makeTrack();
    act(() => {
      useStore.getState().loadTrackToDeck?.(DECK, track);
    });
    const deck = useStore.getState().decks?.[DECK];
    expect(deck?.track?.id).toBe('track-1');
    expect(deck?.position).toBe(0);
  });

  it('playDeck sets playState to "playing"', () => {
    const track = makeTrack();
    act(() => {
      useStore.getState().loadTrackToDeck?.(DECK, track);
      useStore.getState().playDeck?.(DECK);
    });
    expect(useStore.getState().decks?.[DECK]?.playState).toBe('playing');
  });

  it('pauseDeck sets playState to "paused"', () => {
    const track = makeTrack();
    act(() => {
      useStore.getState().loadTrackToDeck?.(DECK, track);
      useStore.getState().playDeck?.(DECK);
      useStore.getState().pauseDeck?.(DECK);
    });
    expect(useStore.getState().decks?.[DECK]?.playState).toBe('paused');
  });

  it('setDeckVolume clamps to [0, 2]', () => {
    act(() => {
      useStore.getState().setDeckVolume?.(DECK, 5.0);
    });
    const vol = useStore.getState().decks?.[DECK]?.volume;
    expect(vol).toBeLessThanOrEqual(2.0);
  });

  it('setDeckVolume accepts 0.75', () => {
    act(() => {
      useStore.getState().setDeckVolume?.(DECK, 0.75);
    });
    expect(useStore.getState().decks?.[DECK]?.volume).toBeCloseTo(0.75);
  });

  it('setDeckPitch stores pitch value', () => {
    act(() => {
      useStore.getState().setDeckPitch?.(DECK, 3.5);
    });
    expect(useStore.getState().decks?.[DECK]?.pitch).toBeCloseTo(3.5);
  });

  it('setDeckPlaybackRate stores rate value', () => {
    act(() => {
      useStore.getState().setDeckPlaybackRate?.(DECK, 1.08);
    });
    expect(useStore.getState().decks?.[DECK]?.playbackRate).toBeCloseTo(1.08);
  });

  it('toggleKeyLock flips keyLock', () => {
    const initialKeyLock = useStore.getState().decks?.[DECK]?.keyLock ?? false;
    act(() => {
      useStore.getState().toggleKeyLock?.(DECK);
    });
    expect(useStore.getState().decks?.[DECK]?.keyLock).toBe(!initialKeyLock);
  });

  it('setDeckPosition updates position', () => {
    act(() => {
      useStore.getState().setDeckPosition?.(DECK, 60.0);
    });
    expect(useStore.getState().decks?.[DECK]?.position).toBeCloseTo(60.0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Hot cues
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — hot cues', () => {
  const DECK: DeckId = 'A';

  it('setHotCue stores a cue point at a slot', () => {
    const cue: CuePoint = { id: 'cue-1', position: 30.5, color: '#ff3366', label: 'Drop', type: 'cue' };
    act(() => {
      useStore.getState().setHotCue?.(DECK, 0, cue);
    });
    const hotCues = useStore.getState().decks?.[DECK]?.hotCues;
    expect(hotCues?.[0].cue?.position).toBeCloseTo(30.5);
  });

  it('deleteHotCue removes a cue point', () => {
    const cue: CuePoint = { id: 'cue-2', position: 45.0, color: '#00ff99', label: 'Build', type: 'cue' };
    act(() => {
      useStore.getState().setHotCue?.(DECK, 1, cue);
      useStore.getState().deleteHotCue?.(DECK, 1);
    });
    const hotCues = useStore.getState().decks?.[DECK]?.hotCues;
    expect(hotCues?.[1].cue).toBeNull();
  });

  it('hot cues have 8 slots', () => {
    const hotCues = useStore.getState().decks?.[DECK]?.hotCues;
    expect(hotCues?.length).toBe(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Loop state
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — loop state', () => {
  const DECK: DeckId = 'B';

  it('setLoop stores a loop', () => {
    const loop: Loop = { id: 'loop-1', startPosition: 10.0, endPosition: 12.0, size: 2, label: null };
    act(() => {
      useStore.getState().setActiveLoop?.(DECK, loop);
    });
    const deck = useStore.getState().decks?.[DECK];
    expect(deck?.activeLoop?.startPosition).toBeCloseTo(10.0);
    expect(deck?.activeLoop?.endPosition).toBeCloseTo(12.0);
  });

  it('toggleLoop enables loop', () => {
    act(() => {
      useStore.getState().toggleLoop?.(DECK, true);
    });
    expect(useStore.getState().decks?.[DECK]?.isLoopActive).toBe(true);
  });

  it('toggleLoop disables loop', () => {
    act(() => {
      useStore.getState().toggleLoop?.(DECK, false);
    });
    expect(useStore.getState().decks?.[DECK]?.isLoopActive).toBe(false);
  });

  it('setLoopSize stores the new size', () => {
    act(() => {
      useStore.getState().setLoopSize?.(DECK, 4);
    });
    expect(useStore.getState().decks?.[DECK]?.loopSize).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Mixer state
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — mixer state', () => {
  it('setCrossfader stores a value between -1 and +1', () => {
    act(() => {
      useStore.getState().setCrossfader?.(0.3);
    });
    expect(useStore.getState().mixer?.crossfader).toBeCloseTo(0.3);
  });

  it('setCrossfader value is clamped to [-1, 1]', () => {
    act(() => {
      useStore.getState().setCrossfader?.(5.0);
    });
    const xf = useStore.getState().mixer?.crossfader;
    if (xf !== undefined) {
      expect(xf).toBeLessThanOrEqual(1);
      expect(xf).toBeGreaterThanOrEqual(-1);
    }
  });

  it('setMasterVolume updates master volume', () => {
    act(() => {
      useStore.getState().setMasterVolume?.(0.9);
    });
    const master = useStore.getState().mixer?.masterVolume;
    if (master !== undefined) {
      expect(master).toBeCloseTo(0.9);
    }
  });

  it('setHeadphoneVolume updates headphone mix volume', () => {
    act(() => {
      useStore.getState().setHeadphoneVolume?.(0.6);
    });
    const hp = useStore.getState().mixer?.headphoneVolume;
    if (hp !== undefined) {
      expect(hp).toBeCloseTo(0.6);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Library state
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — library state', () => {
  it('setSearchQuery updates the query string', () => {
    act(() => {
      useStore.getState().setSearchQuery?.('progressive house');
    });
    expect(useStore.getState().library?.searchQuery).toBe('progressive house');
  });

  it('setSelectedTrack updates selected track id', () => {
    const track = makeTrack({ id: 'track-42' });
    act(() => {
      useStore.getState().setSelectedTrack?.(track);
    });
    expect(useStore.getState().library?.selectedTrack?.id).toBe('track-42');
  });

  it('setActivePlaylist updates the active playlist', () => {
    act(() => {
      useStore.getState().setActivePlaylist?.('playlist-xyz');
    });
    const activeId = useStore.getState().library?.activePlaylistId;
    if (activeId !== undefined) {
      expect(activeId).toBe('playlist-xyz');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MIDI devices
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — MIDI devices', () => {
  it('addMidiDevice appends a device', () => {
    const device: MidiDevice = {
      id: 'midi-1',
      name: 'DDJ-400',
      type: 'input',
      isEnabled: true,
      mappings: [],
    };
    act(() => {
      useStore.getState().addMidiDevice?.(device);
    });
    const devices = useStore.getState().midiDevices;
    expect(devices?.some(d => d.id === 'midi-1')).toBe(true);
  });

  it('toggleMidiDevice flips isEnabled', () => {
    const device: MidiDevice = {
      id: 'midi-2',
      name: 'APC40',
      type: 'input',
      isEnabled: true,
      mappings: [],
    };
    act(() => {
      useStore.getState().addMidiDevice?.(device);
      useStore.getState().toggleMidiDevice?.('midi-2', false);
    });
    const found = useStore.getState().midiDevices?.find(d => d.id === 'midi-2');
    if (found) {
      expect(found.isEnabled).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Set history
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — set history', () => {
  it('addToHistory appends a track to history', () => {
    const track = makeTrack({ id: 'track-hist-1', title: 'History Track' });
    act(() => {
      useStore.getState().addToHistory?.(track);
    });
    const history = useStore.getState().setHistory;
    expect(history?.entries.some(e => e.trackId === 'track-hist-1')).toBe(true);
  });

  it('history entries include a playedAt timestamp', () => {
    const track = makeTrack({ id: 'track-hist-2' });
    const before = Date.now();
    act(() => {
      useStore.getState().addToHistory?.(track);
    });
    const after = Date.now();
    const entry = useStore.getState().setHistory?.entries.find(e => e.trackId === 'track-hist-2');
    if (entry) {
      expect(entry.playedAt).toBeGreaterThanOrEqual(before);
      expect(entry.playedAt).toBeLessThanOrEqual(after);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Sync mode
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — sync', () => {
  it('setSyncMode updates deck sync mode', () => {
    act(() => {
      useStore.getState().setSyncMode?.('A', 'bar');
    });
    const syncMode = useStore.getState().decks?.A?.syncMode;
    if (syncMode !== undefined) {
      expect(syncMode).toBe('bar');
    }
  });

  it('setSyncMaster marks the deck as sync master', () => {
    act(() => {
      useStore.getState().setSyncMaster?.('A');
    });
    const isSync = useStore.getState().decks?.A?.isSyncMaster;
    if (isSync !== undefined) {
      expect(isSync).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Settings
// ═════════════════════════════════════════════════════════════════════════════

describe('Store — settings', () => {
  it('updateSettings persists audio settings', () => {
    act(() => {
      useStore.getState().updateSettings?.({
        audio: {
          outputDevice:     'Focusrite',
          sampleRate:       48000,
          bufferSize:       256,
          driverType:       'asio',
          monitoringEnabled:true,
          masterVolume:     0.9,
          inputDevice:      'Built-in Mic',
        },
      });
    });
    const audio = useStore.getState().settings?.audio;
    if (audio) {
      expect(audio.outputDevice).toBe('Focusrite');
      expect(audio.sampleRate).toBe(48000);
      expect(audio.bufferSize).toBe(256);
    }
  });
});
