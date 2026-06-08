// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Recording Engine
// ─────────────────────────────────────────────────────────────────────────────

import { useDJStore } from '../store';
import type { RecordingFormat, DeckId } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecordingSegment {
  trackId: string | null;
  deckId: DeckId | null;
  startTime: number; // ms from recording start
  label: string;
}

export interface RecordingSession {
  id: string;
  format: RecordingFormat;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  fileSizeBytes: number;
  segments: RecordingSegment[];
  blob: Blob | null;
  waveformPeaks: Float32Array | null;
  metadata: RecordingMetadata;
}

export interface RecordingMetadata {
  title: string;
  artist: string;
  album: string;
  year: number;
  comment: string;
  genre: string;
}

export type RecordingTarget = 'master' | DeckId | 'microphone';

// ── WAV encoding helpers ──────────────────────────────────────────────────────

function encodeWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitDepth: number): ArrayBuffer {
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  return buffer;
}

// Simple ID3v2.3 tag builder
function buildId3Tags(metadata: RecordingMetadata): ArrayBuffer {
  const frames: Uint8Array[] = [];

  function makeFrame(id: string, text: string): Uint8Array {
    if (!text) return new Uint8Array(0);
    const encoded = new TextEncoder().encode(text);
    const frameSize = encoded.length + 1; // +1 for encoding byte
    const frame = new Uint8Array(10 + frameSize);
    const dv = new DataView(frame.buffer);
    for (let i = 0; i < 4; i++) dv.setUint8(i, id.charCodeAt(i));
    dv.setUint32(4, frameSize, false);
    dv.setUint16(8, 0); // flags
    dv.setUint8(10, 3); // UTF-8 encoding
    frame.set(encoded, 11);
    return frame;
  }

  if (metadata.title) frames.push(makeFrame('TIT2', metadata.title));
  if (metadata.artist) frames.push(makeFrame('TPE1', metadata.artist));
  if (metadata.album) frames.push(makeFrame('TALB', metadata.album));
  if (metadata.year) frames.push(makeFrame('TDRC', String(metadata.year)));
  if (metadata.comment) frames.push(makeFrame('COMM', metadata.comment));
  if (metadata.genre) frames.push(makeFrame('TCON', metadata.genre));

  const totalFrameSize = frames.reduce((a, f) => a + f.length, 0);
  const header = new Uint8Array(10);
  const hdv = new DataView(header.buffer);
  hdv.setUint8(0, 0x49); // I
  hdv.setUint8(1, 0x44); // D
  hdv.setUint8(2, 0x33); // 3
  hdv.setUint8(3, 0x03); // version 2.3
  hdv.setUint8(4, 0x00); // revision
  hdv.setUint8(5, 0x00); // flags

  // Synchsafe integer for size
  const size = totalFrameSize;
  hdv.setUint8(6, (size >> 21) & 0x7f);
  hdv.setUint8(7, (size >> 14) & 0x7f);
  hdv.setUint8(8, (size >> 7) & 0x7f);
  hdv.setUint8(9, size & 0x7f);

  const all = new Uint8Array(10 + totalFrameSize);
  all.set(header, 0);
  let offset = 10;
  frames.forEach(f => { all.set(f, offset); offset += f.length; });
  return all.buffer;
}

// ── Waveform builder ──────────────────────────────────────────────────────────

function buildWaveformPeaks(audioBuffer: AudioBuffer, targetPoints = 800): Float32Array {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPoint = Math.floor(channelData.length / targetPoints);
  const peaks = new Float32Array(targetPoints);

  for (let i = 0; i < targetPoints; i++) {
    let max = 0;
    const start = i * samplesPerPoint;
    for (let j = 0; j < samplesPerPoint; j++) {
      const abs = Math.abs(channelData[start + j] ?? 0);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }
  return peaks;
}

// ── Recording Engine ──────────────────────────────────────────────────────────

export class RecordingEngine {
  private sessions: Map<string, RecordingSession> = new Map();
  private activeRecorders: Map<string, MediaRecorder> = new Map();
  private chunks: Map<string, Blob[]> = new Map();
  private durationIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private sessionListeners: Set<(sessions: RecordingSession[]) => void> = new Set();
  private autoSplitEnabled = false;

  // ── Session management ──────────────────────────────────────────────────────

  async startMasterRecording(
    sourceNode: AudioNode,
    format: RecordingFormat = 'wav',
    metadata: Partial<RecordingMetadata> = {}
  ): Promise<string> {
    return this.startRecording('master', sourceNode, format, metadata);
  }

  async startDeckRecording(
    deckId: DeckId,
    sourceNode: AudioNode,
    format: RecordingFormat = 'wav'
  ): Promise<string> {
    return this.startRecording(deckId, sourceNode, format, {});
  }

  async startMicrophoneRecording(format: RecordingFormat = 'wav'): Promise<string> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      return this.startRecording('microphone', source, format, { title: 'Microphone Recording' });
    } catch (err) {
      console.error('[RecordingEngine] Microphone access denied:', err);
      throw err;
    }
  }

  private async startRecording(
    target: RecordingTarget,
    sourceNode: AudioNode,
    format: RecordingFormat,
    metadata: Partial<RecordingMetadata>
  ): Promise<string> {
    const sessionId = `rec-${Date.now()}-${target}`;

    const audioCtx = sourceNode.context as AudioContext;
    const destination = audioCtx.createMediaStreamDestination();
    sourceNode.connect(destination);

    const mimeType = this.getMimeType(format);
    const actualMime = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm;codecs=opus';

    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: actualMime,
      audioBitsPerSecond: 320000,
    });

    const chunkList: Blob[] = [];
    this.chunks.set(sessionId, chunkList);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunkList.push(e.data);
        const totalSize = chunkList.reduce((a, b) => a + b.size, 0);
        const session = this.sessions.get(sessionId);
        if (session) {
          session.fileSizeBytes = totalSize;
          this.notifyListeners();
        }
      }
    };

    mediaRecorder.start(500); // 500ms slices
    this.activeRecorders.set(sessionId, mediaRecorder);

    const now = Date.now();
    const session: RecordingSession = {
      id: sessionId,
      format,
      startedAt: now,
      endedAt: null,
      durationMs: 0,
      fileSizeBytes: 0,
      segments: [],
      blob: null,
      waveformPeaks: null,
      metadata: {
        title: metadata.title ?? `Mix ${new Date(now).toLocaleString()}`,
        artist: metadata.artist ?? 'DJ Nexus Pro',
        album: metadata.album ?? 'Live Set',
        year: metadata.year ?? new Date().getFullYear(),
        comment: metadata.comment ?? `Recorded with DJ Nexus Pro — ${target}`,
        genre: metadata.genre ?? 'Electronic',
      },
    };
    this.sessions.set(sessionId, session);

    // Duration tick
    const interval = setInterval(() => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.durationMs = Date.now() - s.startedAt;
        // Update store
        useDJStore.getState().updateRecordingDuration(s.durationMs);
        this.notifyListeners();
      }
    }, 1000);
    this.durationIntervals.set(sessionId, interval);

    // Update store
    useDJStore.getState().startRecording(format, `recording-${sessionId}.${this.formatExtension(format)}`);

    this.notifyListeners();
    console.log(`[RecordingEngine] Started recording session: ${sessionId} (${format})`);
    return sessionId;
  }

  async stopRecording(sessionId: string): Promise<RecordingSession> {
    const recorder = this.activeRecorders.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!recorder || !session) throw new Error(`Session ${sessionId} not found.`);

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        const interval = this.durationIntervals.get(sessionId);
        if (interval) { clearInterval(interval); this.durationIntervals.delete(sessionId); }

        const chunks = this.chunks.get(sessionId) ?? [];
        const rawBlob = new Blob(chunks, { type: recorder.mimeType });

        session.endedAt = Date.now();
        session.durationMs = session.endedAt - session.startedAt;
        session.blob = rawBlob;

        // For WAV format, build proper WAV with header
        if (session.format === 'wav') {
          try {
            session.blob = await this.encodeWav(rawBlob);
          } catch (e) {
            console.warn('[RecordingEngine] WAV encoding fallback to raw blob:', e);
          }
        }

        // Build waveform peaks
        try {
          session.waveformPeaks = await this.buildWaveform(session.blob);
        } catch (e) {
          console.warn('[RecordingEngine] Waveform analysis failed:', e);
        }

        this.activeRecorders.delete(sessionId);
        this.chunks.delete(sessionId);

        useDJStore.getState().stopRecording();
        this.notifyListeners();
        resolve(session);
      };

      recorder.stop();
    });
  }

  pauseRecording(sessionId: string): void {
    const recorder = this.activeRecorders.get(sessionId);
    if (recorder?.state === 'recording') recorder.pause();
  }

  resumeRecording(sessionId: string): void {
    const recorder = this.activeRecorders.get(sessionId);
    if (recorder?.state === 'paused') recorder.resume();
  }

  /** Mark the current track change as a segment boundary */
  addSegment(sessionId: string, trackId: string | null, deckId: DeckId | null, label: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.segments.push({
      trackId,
      deckId,
      startTime: Date.now() - session.startedAt,
      label,
    });
    this.notifyListeners();
  }

  setAutoSplit(enabled: boolean): void {
    this.autoSplitEnabled = enabled;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  async exportRecording(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.blob) throw new Error('No recording data available.');

    let blob = session.blob;

    // Prepend ID3 tags for MP3
    if (session.format === 'mp3') {
      const tags = buildId3Tags(session.metadata);
      blob = new Blob([tags, await blob.arrayBuffer()], { type: 'audio/mpeg' });
    }

    const ext = this.formatExtension(session.format);
    const filename = `${session.metadata.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getSession(sessionId: string): RecordingSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): RecordingSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  getActiveSessions(): RecordingSession[] {
    return this.getAllSessions().filter(s => s.endedAt === null);
  }

  onSessionsChange(listener: (sessions: RecordingSession[]) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async encodeWav(rawBlob: Blob): Promise<Blob> {
    const arrayBuffer = await rawBlob.arrayBuffer();
    const audioCtx = new OfflineAudioContext(2, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    const numChannels = decoded.numberOfChannels;
    const sampleRate = decoded.sampleRate;
    const length = decoded.length;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const dataLength = length * numChannels * bytesPerSample;

    const header = encodeWavHeader(dataLength, sampleRate, numChannels, bitDepth);
    const pcmBuffer = new ArrayBuffer(dataLength);
    const pcmView = new DataView(pcmBuffer);

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = decoded.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const offset = (i * numChannels + ch) * bytesPerSample;
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcmView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
    }

    return new Blob([header, pcmBuffer], { type: 'audio/wav' });
  }

  private async buildWaveform(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return buildWaveformPeaks(decoded);
  }

  private getMimeType(format: RecordingFormat): string {
    switch (format) {
      case 'wav': return 'audio/wav';
      case 'mp3': return 'audio/mpeg';
      case 'flac': return 'audio/flac';
      case 'aac': return 'audio/aac';
      default: return 'audio/webm';
    }
  }

  private formatExtension(format: RecordingFormat): string {
    switch (format) {
      case 'wav': return 'wav';
      case 'mp3': return 'mp3';
      case 'flac': return 'flac';
      case 'aac': return 'aac';
      default: return 'webm';
    }
  }

  private notifyListeners(): void {
    const all = this.getAllSessions();
    this.sessionListeners.forEach(l => l(all));
  }

  dispose(): void {
    this.activeRecorders.forEach((_, id) => this.stopRecording(id).catch(() => {}));
    this.durationIntervals.forEach(i => clearInterval(i));
    this.sessions.clear();
    this.activeRecorders.clear();
    this.chunks.clear();
    this.durationIntervals.clear();
  }
}

// Singleton
export const recordingEngine = new RecordingEngine();
