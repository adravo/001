export type MutableLevel = { current: number };

/**
 * Drives avatar mouth-open amplitude from whatever audio is currently
 * speaking. Two paths:
 *  - Real audio (server TTS via ElevenLabs/Azure): analyses live frequency
 *    data from a Web Audio AnalyserNode for accurate lip-sync.
 *  - Browser SpeechSynthesis fallback: the synthesized voice audio isn't
 *    exposed to Web Audio, so mouth amplitude is approximated from
 *    word-boundary events, producing a plausible "talking" pulse.
 *
 * `level` is a plain mutable ref (not React state) because it's read once
 * per rendered frame inside an R3F useFrame loop — pushing it through
 * setState would re-render the whole tree at 60fps for no benefit.
 */
export class LipSyncEngine {
  readonly level: MutableLevel = { current: 0 };
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;
  private fallbackActive = false;

  get isSpeaking(): boolean {
    return this.rafId !== null || this.fallbackActive;
  }

  async speakWithAudio(blob: Blob): Promise<void> {
    this.stop();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.audioEl = audio;

    const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtxCtor();
    const source = this.audioCtx.createMediaElementSource(audio);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    return new Promise((resolve) => {
      const tick = () => {
        if (!this.analyser || !this.freqData) return;
        this.analyser.getByteFrequencyData(this.freqData);
        const avg = this.freqData.reduce((sum, v) => sum + v, 0) / this.freqData.length;
        this.level.current = Math.min(1, (avg / 255) * 2.2);
        this.rafId = requestAnimationFrame(tick);
      };

      audio.onended = () => {
        this.cleanupAudio();
        resolve();
      };
      audio.onerror = () => {
        this.cleanupAudio();
        resolve();
      };

      audio.play().catch(() => {
        this.cleanupAudio();
        resolve();
      });
      this.rafId = requestAnimationFrame(tick);
    });
  }

  /** Approximates mouth movement using SpeechSynthesis word-boundary events. */
  speakWithBrowserTts(text: string): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      this.fallbackActive = true;

      utterance.onboundary = () => {
        this.level.current = 0.55 + Math.random() * 0.35;
        setTimeout(() => {
          this.level.current = 0.1;
        }, 90);
      };
      utterance.onend = () => {
        this.fallbackActive = false;
        this.level.current = 0;
        resolve();
      };
      utterance.onerror = () => {
        this.fallbackActive = false;
        this.level.current = 0;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.fallbackActive) {
      window.speechSynthesis?.cancel();
      this.fallbackActive = false;
    }
    this.cleanupAudio();
    this.level.current = 0;
  }

  private cleanupAudio() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audioEl?.pause();
    this.audioEl = null;
    this.analyser = null;
    this.freqData = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.level.current = 0;
  }
}
