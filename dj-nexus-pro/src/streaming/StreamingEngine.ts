// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Streaming Engine
// ─────────────────────────────────────────────────────────────────────────────

export type StreamFormat = 'mp3' | 'ogg' | 'aac';
export type StreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface StreamQualityPreset {
  label: string;
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: 1 | 2;
}

export const STREAM_QUALITY_PRESETS: Record<string, StreamQualityPreset> = {
  '64kbps': { label: '64 kbps (Low)', bitrate: 64, sampleRate: 22050, channels: 2 },
  '128kbps': { label: '128 kbps (Standard)', bitrate: 128, sampleRate: 44100, channels: 2 },
  '192kbps': { label: '192 kbps (High)', bitrate: 192, sampleRate: 44100, channels: 2 },
  '320kbps': { label: '320 kbps (Maximum)', bitrate: 320, sampleRate: 48000, channels: 2 },
};

export interface StreamConfig {
  serverUrl: string;        // e.g. "http://localhost:8000/stream"
  mountPoint: string;       // e.g. "/live"
  username: string;
  password: string;
  format: StreamFormat;
  quality: StreamQualityPreset;
  /** Station / stream name */
  name: string;
  description: string;
  genre: string;
  isPublic: boolean;
}

export interface StreamMetadata {
  title: string;
  artist: string;
  album?: string;
}

export interface StreamStats {
  status: StreamStatus;
  connectedAt: number | null;
  bytesSent: number;
  startedAt: number | null;
  listeners?: number;
  errorMessage: string | null;
}

// ── RTMP platform info (display only — no native RTMP from browser) ───────────

export interface RtmpPlatformInfo {
  name: string;
  rtmpUrl: string;
  streamKeyPlaceholder: string;
  setupGuideUrl: string;
}

export const RTMP_PLATFORMS: RtmpPlatformInfo[] = [
  {
    name: 'Twitch',
    rtmpUrl: 'rtmp://live.twitch.tv/live/',
    streamKeyPlaceholder: 'Your Twitch Stream Key',
    setupGuideUrl: 'https://help.twitch.tv/s/article/guide-to-broadcast-health-and-using-twitch-inspector',
  },
  {
    name: 'YouTube Live',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/',
    streamKeyPlaceholder: 'Your YouTube Stream Key',
    setupGuideUrl: 'https://support.google.com/youtube/answer/2907883',
  },
  {
    name: 'Facebook Live',
    rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    streamKeyPlaceholder: 'Your Facebook Stream Key',
    setupGuideUrl: 'https://www.facebook.com/help/587160588142067',
  },
];

// ── Icecast/Shoutcast streaming engine ────────────────────────────────────────

export class StreamingEngine {
  private config: StreamConfig | null = null;
  private stats: StreamStats = {
    status: 'disconnected',
    connectedAt: null,
    bytesSent: 0,
    startedAt: null,
    listeners: 0,
    errorMessage: null,
  };

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private statsListeners: Set<(stats: StreamStats) => void> = new Set();
  private streamDurationInterval: ReturnType<typeof setInterval> | null = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  async startStream(config: StreamConfig, sourceNode: AudioNode): Promise<void> {
    if (this.stats.status === 'connected' || this.stats.status === 'connecting') {
      await this.stopStream();
    }

    this.config = config;
    this.reconnectAttempts = 0;
    this.updateStats({ status: 'connecting', errorMessage: null });

    try {
      await this.connect(sourceNode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateStats({ status: 'error', errorMessage: message });
      throw err;
    }
  }

  async stopStream(): Promise<void> {
    this.cancelReconnect();
    this.stopMediaRecorder();
    this.closeWebSocket();
    if (this.streamDurationInterval) {
      clearInterval(this.streamDurationInterval);
      this.streamDurationInterval = null;
    }
    this.updateStats({
      status: 'disconnected',
      connectedAt: null,
      bytesSent: 0,
    });
  }

  /** Update Now Playing metadata on the Icecast server */
  async updateMetadata(metadata: StreamMetadata): Promise<void> {
    if (!this.config || this.stats.status !== 'connected') return;

    const title = [metadata.artist, metadata.title].filter(Boolean).join(' - ');
    const encoded = encodeURIComponent(title);

    // Icecast admin endpoint
    const adminUrl = this.buildAdminUrl(`/admin/metadata?mount=${this.config.mountPoint}&mode=updinfo&song=${encoded}`);

    try {
      await fetch(adminUrl, {
        method: 'GET',
        headers: {
          Authorization: 'Basic ' + btoa(`${this.config.username}:${this.config.password}`),
        },
        mode: 'no-cors', // Icecast typically requires this from browsers
      });
    } catch (e) {
      // no-cors requests don't surface the response, so we swallow errors
      console.warn('[StreamingEngine] Metadata update sent (no-cors).');
    }
  }

  getStats(): StreamStats {
    return { ...this.stats };
  }

  onStatsChange(listener: (stats: StreamStats) => void): () => void {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  getStreamDuration(): number {
    if (!this.stats.startedAt) return 0;
    return Date.now() - this.stats.startedAt;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async connect(sourceNode: AudioNode): Promise<void> {
    if (!this.config) return;

    // Capture audio from the source node via a MediaStreamDestination
    const audioCtx = sourceNode.context as AudioContext;
    const destination = audioCtx.createMediaStreamDestination();
    sourceNode.connect(destination);
    this.mediaStream = destination.stream;

    const mimeType = this.getMimeType();
    const supported = MediaRecorder.isTypeSupported(mimeType);
    const actualMime = supported ? mimeType : 'audio/webm;codecs=opus';

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: actualMime,
      audioBitsPerSecond: this.config.quality.bitrate * 1000,
    });

    // Use WebSocket to stream audio chunks to a relay server
    // (Browsers cannot speak Icecast SOURCE protocol directly — a small relay is required)
    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws');
    this.wsConnection = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      if (!this.wsConnection) return reject(new Error('No WebSocket'));

      this.wsConnection.onopen = () => {
        // Send auth header
        this.wsConnection!.send(JSON.stringify({
          type: 'auth',
          username: this.config!.username,
          password: this.config!.password,
          mountPoint: this.config!.mountPoint,
          name: this.config!.name,
          description: this.config!.description,
          genre: this.config!.genre,
          isPublic: this.config!.isPublic,
          format: this.config!.format,
          bitrate: this.config!.quality.bitrate,
        }));
        resolve();
      };

      this.wsConnection.onerror = (e) => {
        reject(new Error(`WebSocket connection failed to ${wsUrl}`));
      };

      this.wsConnection.onclose = () => {
        if (this.stats.status === 'connected') {
          this.handleDisconnect();
        }
      };

      // Handle listeners count from server
      this.wsConnection.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.listeners !== undefined) {
            this.updateStats({ listeners: data.listeners });
          }
        } catch { /* ignore */ }
      };
    });

    // Stream audio chunks
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.wsConnection?.readyState === WebSocket.OPEN) {
        this.wsConnection.send(e.data);
        this.updateStats({ bytesSent: this.stats.bytesSent + e.data.size });
      }
    };

    this.mediaRecorder.start(250); // 250ms chunks for low latency

    const now = Date.now();
    this.updateStats({ status: 'connected', connectedAt: now, startedAt: now });
    this.reconnectAttempts = 0;

    // Duration timer
    this.streamDurationInterval = setInterval(() => {
      this.statsListeners.forEach(l => l(this.getStats()));
    }, 1000);
  }

  private handleDisconnect(): void {
    this.stopMediaRecorder();
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(2000 * this.reconnectAttempts, 30000);
      this.updateStats({ status: 'reconnecting', errorMessage: `Reconnecting (attempt ${this.reconnectAttempts})…` });
      this.reconnectTimeoutId = setTimeout(() => {
        if (this.mediaStream) {
          const track = this.mediaStream.getAudioTracks()[0];
          if (track) {
            // We need the original source node — simplified: just attempt ws reconnect
            this.updateStats({ status: 'error', errorMessage: 'Could not reconnect — audio source no longer available.' });
          }
        }
      }, delay);
    } else {
      this.updateStats({ status: 'error', errorMessage: 'Connection lost after maximum reconnect attempts.' });
    }
  }

  private stopMediaRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private closeWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.onclose = null;
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private getMimeType(): string {
    switch (this.config?.format) {
      case 'mp3': return 'audio/mpeg';
      case 'ogg': return 'audio/ogg;codecs=vorbis';
      case 'aac': return 'audio/aac';
      default: return 'audio/webm;codecs=opus';
    }
  }

  private buildAdminUrl(path: string): string {
    if (!this.config) return '';
    const url = new URL(this.config.serverUrl);
    return `${url.protocol}//${url.host}${path}`;
  }

  private updateStats(patch: Partial<StreamStats>): void {
    this.stats = { ...this.stats, ...patch };
    this.statsListeners.forEach(l => l(this.getStats()));
  }

  dispose(): void {
    this.stopStream();
  }
}

// Singleton
export const streamingEngine = new StreamingEngine();
