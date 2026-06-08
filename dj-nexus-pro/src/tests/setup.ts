// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Vitest global test setup
// ─────────────────────────────────────────────────────────────────────────────

import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom'; // extend expect() matchers (optional dep)

// ── Mock Electron IPC ─────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
}));

// ── Mock native audio engine ──────────────────────────────────────────────────
vi.mock('../native/dj-nexus-audio-engine', () => ({
  startEngine:      vi.fn(),
  stopEngine:       vi.fn(),
  loadTrack:        vi.fn().mockResolvedValue(JSON.stringify({ duration: 180, bpm: 128 })),
  setPlayback:      vi.fn(),
  setPitch:         vi.fn(),
  setVolume:        vi.fn(),
  seekTo:           vi.fn(),
  getPosition:      vi.fn().mockReturnValue(0),
  getWaveformData:  vi.fn().mockResolvedValue(JSON.stringify({ columns: [], globalPeak: 0 })),
  listOutputDevices:vi.fn().mockReturnValue(JSON.stringify(['Default'])),
  setPlaybackRate:  vi.fn(),
  setKeyLock:       vi.fn(),
}), { virtual: true });

// ── Silence console.warn in tests (set to debug if debugging failures) ────────
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
