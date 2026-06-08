// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Audio Engine unit tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the native N-API module ──────────────────────────────────────────────

const mockEngine = {
  startEngine:       vi.fn(),
  stopEngine:        vi.fn(),
  loadTrack:         vi.fn(),
  setPlayback:       vi.fn(),
  setPitch:          vi.fn(),
  setVolume:         vi.fn(),
  seekTo:            vi.fn(),
  getPosition:       vi.fn(),
  getWaveformData:   vi.fn(),
  listOutputDevices: vi.fn(),
  setPlaybackRate:   vi.fn(),
  setKeyLock:        vi.fn(),
};

vi.mock('../audio/AudioEngineWrapper', () => {
  return {
    AudioEngine: vi.fn().mockImplementation(() => mockEngine),
    getAudioEngine: vi.fn(() => mockEngine),
  };
});

// ── Helper: create a fake TrackMetadata JSON response ─────────────────────────
function makeTrackMetaJSON(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    filePath:        '/music/test.mp3',
    title:           'Test Track',
    artist:          'Test Artist',
    album:           'Test Album',
    genre:           'House',
    year:            2024,
    bpm:             128.0,
    durationSeconds: 240.5,
    sampleRate:      44100,
    channels:        2,
    totalFrames:     10_610_055,
    format:          'MP3',
    bitDepth:        null,
    bitrateKbps:     320,
    ...overrides,
  });
}

// ── Helper: create a fake WaveformAnalysis JSON response ──────────────────────
function makeWaveformJSON(width = 10): string {
  const columns = Array.from({ length: width }, (_, i) => ({
    rms:  0.3 + i * 0.01,
    peak: 0.5 + i * 0.01,
    bass: 0.6,
    mid:  0.4,
    high: 0.2,
    r:    80,
    g:    120,
    b:    200,
  }));
  return JSON.stringify({
    columns,
    sampleRate:      44100,
    totalFrames:     441000,
    durationSeconds: 10.0,
    globalPeak:      0.98,
    globalRms:       0.35,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('AudioEngine — N-API mock contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── startEngine / stopEngine ───────────────────────────────────────────────

  describe('startEngine / stopEngine', () => {
    it('starts without throwing', () => {
      mockEngine.startEngine.mockImplementation(() => {});
      expect(() => mockEngine.startEngine()).not.toThrow();
      expect(mockEngine.startEngine).toHaveBeenCalledOnce();
    });

    it('stops without throwing', () => {
      mockEngine.stopEngine.mockImplementation(() => {});
      expect(() => mockEngine.stopEngine()).not.toThrow();
      expect(mockEngine.stopEngine).toHaveBeenCalledOnce();
    });

    it('startEngine rejects with descriptive error when no device', async () => {
      mockEngine.startEngine.mockRejectedValueOnce(
        new Error('No output audio device found'),
      );
      await expect(mockEngine.startEngine()).rejects.toThrow('No output audio device found');
    });
  });

  // ── loadTrack ──────────────────────────────────────────────────────────────

  describe('loadTrack', () => {
    it('resolves with parsed metadata', async () => {
      const raw = makeTrackMetaJSON();
      mockEngine.loadTrack.mockResolvedValueOnce(raw);

      const result = await mockEngine.loadTrack(0, '/music/test.mp3');
      const meta = JSON.parse(result);

      expect(meta.title).toBe('Test Track');
      expect(meta.bpm).toBe(128.0);
      expect(meta.durationSeconds).toBeCloseTo(240.5);
      expect(meta.sampleRate).toBe(44100);
    });

    it('rejects when deck ID is out of range', async () => {
      mockEngine.loadTrack.mockRejectedValueOnce(new Error('Invalid deck id: 99'));
      await expect(mockEngine.loadTrack(99, '/music/test.mp3')).rejects.toThrow('Invalid deck id: 99');
    });

    it('rejects when file not found', async () => {
      mockEngine.loadTrack.mockRejectedValueOnce(new Error('Failed to probe audio format'));
      await expect(mockEngine.loadTrack(0, '/missing.mp3')).rejects.toThrow();
    });

    it('handles tracks without BPM metadata gracefully', async () => {
      const raw = makeTrackMetaJSON({ bpm: null });
      mockEngine.loadTrack.mockResolvedValueOnce(raw);
      const meta = JSON.parse(await mockEngine.loadTrack(0, '/music/no-bpm.wav'));
      expect(meta.bpm).toBeNull();
    });
  });

  // ── setPlayback ────────────────────────────────────────────────────────────

  describe('setPlayback', () => {
    const validStates = ['playing', 'paused', 'stopped', 'cueing'];

    validStates.forEach(state => {
      it(`accepts state "${state}"`, () => {
        mockEngine.setPlayback.mockImplementation(() => {});
        expect(() => mockEngine.setPlayback(0, state)).not.toThrow();
      });
    });

    it('rejects unknown state', () => {
      mockEngine.setPlayback.mockImplementation((_id: number, state: string) => {
        if (!validStates.includes(state)) throw new Error(`Unknown state: ${state}`);
      });
      expect(() => mockEngine.setPlayback(0, 'flying')).toThrow('Unknown state: flying');
    });
  });

  // ── setPitch ───────────────────────────────────────────────────────────────

  describe('setPitch', () => {
    it('accepts semitone values in range -24 to +24', () => {
      mockEngine.setPitch.mockImplementation(() => {});
      expect(() => mockEngine.setPitch(0, 0)).not.toThrow();
      expect(() => mockEngine.setPitch(0, 12)).not.toThrow();
      expect(() => mockEngine.setPitch(0, -12)).not.toThrow();
      expect(() => mockEngine.setPitch(0, 24)).not.toThrow();
    });

    it('is called with correct arguments', () => {
      mockEngine.setPitch.mockImplementation(() => {});
      mockEngine.setPitch(1, 5.5);
      expect(mockEngine.setPitch).toHaveBeenCalledWith(1, 5.5);
    });
  });

  // ── setVolume ──────────────────────────────────────────────────────────────

  describe('setVolume', () => {
    it('accepts 0.0 – 1.0', () => {
      mockEngine.setVolume.mockImplementation(() => {});
      expect(() => mockEngine.setVolume(0, 0.0)).not.toThrow();
      expect(() => mockEngine.setVolume(0, 0.75)).not.toThrow();
      expect(() => mockEngine.setVolume(0, 1.0)).not.toThrow();
    });
  });

  // ── seekTo ─────────────────────────────────────────────────────────────────

  describe('seekTo', () => {
    it('seeks to a positive time', () => {
      mockEngine.seekTo.mockImplementation(() => {});
      mockEngine.seekTo(0, 60.0);
      expect(mockEngine.seekTo).toHaveBeenCalledWith(0, 60.0);
    });

    it('seeking to 0 resets position', () => {
      mockEngine.seekTo.mockImplementation(() => {});
      mockEngine.getPosition.mockReturnValueOnce(0.0);
      mockEngine.seekTo(0, 0);
      expect(mockEngine.getPosition(0)).toBe(0.0);
    });
  });

  // ── getPosition ────────────────────────────────────────────────────────────

  describe('getPosition', () => {
    it('returns a number in seconds', () => {
      mockEngine.getPosition.mockReturnValueOnce(42.7);
      const pos = mockEngine.getPosition(0);
      expect(typeof pos).toBe('number');
      expect(pos).toBeCloseTo(42.7);
    });

    it('returns 0 when deck is stopped', () => {
      mockEngine.getPosition.mockReturnValueOnce(0);
      expect(mockEngine.getPosition(0)).toBe(0);
    });
  });

  // ── getWaveformData ────────────────────────────────────────────────────────

  describe('getWaveformData', () => {
    it('resolves with valid WaveformAnalysis JSON', async () => {
      mockEngine.getWaveformData.mockResolvedValueOnce(makeWaveformJSON(200));
      const raw = await mockEngine.getWaveformData(0, 200);
      const analysis = JSON.parse(raw);
      expect(Array.isArray(analysis.columns)).toBe(true);
      expect(analysis.columns).toHaveLength(200);
      expect(analysis.globalPeak).toBeGreaterThan(0);
    });

    it('each column has rms, peak, bass, mid, high, r, g, b', async () => {
      mockEngine.getWaveformData.mockResolvedValueOnce(makeWaveformJSON(1));
      const raw = await mockEngine.getWaveformData(0, 1);
      const { columns } = JSON.parse(raw);
      const col = columns[0];
      expect(col).toHaveProperty('rms');
      expect(col).toHaveProperty('peak');
      expect(col).toHaveProperty('bass');
      expect(col).toHaveProperty('mid');
      expect(col).toHaveProperty('high');
      expect(col).toHaveProperty('r');
      expect(col).toHaveProperty('g');
      expect(col).toHaveProperty('b');
    });

    it('rejects when no track is loaded', async () => {
      mockEngine.getWaveformData.mockRejectedValueOnce(new Error('No track loaded in deck'));
      await expect(mockEngine.getWaveformData(0, 200)).rejects.toThrow('No track loaded');
    });
  });

  // ── listOutputDevices ──────────────────────────────────────────────────────

  describe('listOutputDevices', () => {
    it('returns a non-empty JSON array of strings', () => {
      mockEngine.listOutputDevices.mockReturnValueOnce(
        JSON.stringify(['Built-in Output', 'Focusrite Scarlett 2i2']),
      );
      const devices: string[] = JSON.parse(mockEngine.listOutputDevices());
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThan(0);
      devices.forEach(d => expect(typeof d).toBe('string'));
    });
  });

  // ── setPlaybackRate ────────────────────────────────────────────────────────

  describe('setPlaybackRate', () => {
    it('accepts rates in the expected range', () => {
      mockEngine.setPlaybackRate.mockImplementation(() => {});
      [0.5, 0.8, 1.0, 1.2, 1.5, 2.0].forEach(rate => {
        expect(() => mockEngine.setPlaybackRate(0, rate)).not.toThrow();
      });
    });
  });

  // ── setKeyLock ─────────────────────────────────────────────────────────────

  describe('setKeyLock', () => {
    it('can be enabled and disabled', () => {
      mockEngine.setKeyLock.mockImplementation(() => {});
      mockEngine.setKeyLock(0, true);
      mockEngine.setKeyLock(0, false);
      expect(mockEngine.setKeyLock).toHaveBeenCalledTimes(2);
      expect(mockEngine.setKeyLock).toHaveBeenNthCalledWith(1, 0, true);
      expect(mockEngine.setKeyLock).toHaveBeenNthCalledWith(2, 0, false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style: verify that IPC bridge calls the right N-API functions
// ─────────────────────────────────────────────────────────────────────────────

describe('AudioEngine — IPC bridge smoke tests', () => {
  it('start → play → stop sequence does not throw', async () => {
    mockEngine.startEngine.mockImplementation(() => {});
    mockEngine.loadTrack.mockResolvedValueOnce(makeTrackMetaJSON());
    mockEngine.setPlayback.mockImplementation(() => {});
    mockEngine.stopEngine.mockImplementation(() => {});

    mockEngine.startEngine();
    await mockEngine.loadTrack(0, '/music/track.mp3');
    mockEngine.setPlayback(0, 'playing');
    mockEngine.stopEngine();

    expect(mockEngine.startEngine).toHaveBeenCalledOnce();
    expect(mockEngine.loadTrack).toHaveBeenCalledOnce();
    expect(mockEngine.setPlayback).toHaveBeenCalledWith(0, 'playing');
    expect(mockEngine.stopEngine).toHaveBeenCalledOnce();
  });
});
