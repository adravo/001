// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — WebGL Waveform Display
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useDJStore, selectDeck } from '../../store';
import type { DeckId, WaveformData, BeatGrid, CuePoint, Loop } from '../../types';

// ── WebGL shader sources ───────────────────────────────────────────────────────

const VERT_SRC = `
  attribute vec2 a_position;
  attribute vec3 a_color;
  uniform vec2 u_resolution;
  varying vec3 v_color;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0, 1);
    v_color = a_color;
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying vec3 v_color;
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile error');
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? 'program link error');
  }
  return prog;
}

// ── Waveform renderer class ────────────────────────────────────────────────────

class WaveformRenderer {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  posLoc: number;
  colorLoc: number;
  resolutionLoc: WebGLUniformLocation;
  posBuf: WebGLBuffer;
  colBuf: WebGLBuffer;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this.program = createProgram(gl);
    this.posLoc = gl.getAttribLocation(this.program, 'a_position');
    this.colorLoc = gl.getAttribLocation(this.program, 'a_color');
    this.resolutionLoc = gl.getUniformLocation(this.program, 'u_resolution')!;
    this.posBuf = gl.createBuffer()!;
    this.colBuf = gl.createBuffer()!;
    gl.useProgram(this.program);
    gl.clearColor(0.05, 0.07, 0.1, 1.0);
  }

  drawLines(positions: Float32Array, colors: Float32Array) {
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.colorLoc);
    gl.vertexAttribPointer(this.colorLoc, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, positions.length / 2);
  }

  resize(w: number, h: number) {
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.resolutionLoc, w, h);
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
  }

  clear() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}

// ── Helper: build waveform vertex data ────────────────────────────────────────

function buildWaveformBuffers(
  waveform: WaveformData,
  startSample: number,
  endSample: number,
  width: number,
  height: number,
  spectral: boolean,
): { positions: Float32Array; colors: Float32Array } {
  const totalSamples = waveform.peaks.length;
  const sampleRange = endSample - startSample;
  const samplesPerPx = sampleRange / width;
  const mid = height / 2;

  const positions: number[] = [];
  const colors: number[] = [];

  for (let px = 0; px < width; px++) {
    const sampleIdx = Math.floor(startSample + px * samplesPerPx);
    if (sampleIdx < 0 || sampleIdx >= totalSamples) continue;

    const peak = Math.abs(waveform.peaks[sampleIdx] ?? 0);
    const rms = waveform.rms[sampleIdx] ?? 0;
    const amp = peak * mid * 0.9;

    // RGB color based on frequency (simulated from amplitude for demo)
    let r, g, b;
    if (spectral) {
      // Map amplitude to spectrum: low=blue, mid=green, high=red
      r = Math.min(1, peak * 2);
      g = Math.min(1, rms * 3);
      b = Math.max(0, 1 - peak * 2);
    } else {
      const hue = peak; // 0=blue, 1=red
      r = hue;
      g = 0.3 + rms * 0.4;
      b = 1 - hue;
    }

    // Top line
    positions.push(px, mid - amp, px, mid + amp);
    colors.push(r, g, b, r * 0.7, g * 0.7, b * 0.7);
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

// ── Canvas 2D overlay (beat grid, cue points, etc.) ──────────────────────────

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  position: number,
  duration: number,
  zoom: number,
  beatGrid: BeatGrid | null,
  cuePoints: CuePoint[],
  activeLoop: Loop | null,
  isLoopActive: boolean,
) {
  ctx.clearRect(0, 0, width, height);

  const viewDuration = duration / zoom;
  const viewStart = Math.max(0, position - viewDuration / 2);
  const viewEnd = viewStart + viewDuration;

  function timeToX(t: number): number {
    return ((t - viewStart) / viewDuration) * width;
  }

  // Loop region
  if (activeLoop && isLoopActive) {
    const lx1 = timeToX(activeLoop.inPoint);
    const lx2 = timeToX(activeLoop.outPoint);
    ctx.fillStyle = 'rgba(34,197,94,0.15)';
    ctx.fillRect(lx1, 0, lx2 - lx1, height);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx1, 0);
    ctx.lineTo(lx1, height);
    ctx.moveTo(lx2, 0);
    ctx.lineTo(lx2, height);
    ctx.stroke();
  }

  // Beat grid
  if (beatGrid) {
    const bps = beatGrid.bpm / 60;
    const beatInterval = 1 / bps;
    const barInterval = beatInterval * 4;
    const startBeat = Math.floor(viewStart / beatInterval);
    const endBeat = Math.ceil(viewEnd / beatInterval);

    for (let b = startBeat; b <= endBeat; b++) {
      const t = beatGrid.offset + b * beatInterval;
      if (t < viewStart || t > viewEnd) continue;
      const x = timeToX(t);
      const isBar = b % 4 === 0;
      const isBeat = b % 1 === 0;

      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.5)' : isBeat ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = isBar ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(x, isBar ? 0 : height * 0.25);
      ctx.lineTo(x, isBar ? height : height * 0.75);
      ctx.stroke();

      // Sub-beats
      for (let sub = 1; sub < 4; sub++) {
        const st = t + (sub / 4) * beatInterval;
        if (st < viewStart || st > viewEnd) continue;
        const sx = timeToX(st);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, height * 0.4);
        ctx.lineTo(sx, height * 0.6);
        ctx.stroke();
      }
    }
  }

  // Cue points
  cuePoints.forEach(cue => {
    const x = timeToX(cue.position);
    if (x < -10 || x > width + 10) return;
    const col = cue.color || '#ef4444';
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    // Triangle marker
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 8, 10);
    ctx.lineTo(x - 8, 10);
    ctx.closePath();
    ctx.fill();
    // Vertical line
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Label
    if (cue.slot !== null) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(String(cue.slot + 1), x - 3, 9);
    }
  });

  // Playhead
  const px = timeToX(position);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, height);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Overview strip (Canvas 2D) ────────────────────────────────────────────────

function OverviewStrip({
  waveform,
  position,
  duration,
  zoom,
  onSeek,
}: {
  waveform: WaveformData | null;
  position: number;
  duration: number;
  zoom: number;
  onSeek: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const HEIGHT = 32;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    ctx.clearRect(0, 0, W, HEIGHT);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, HEIGHT);

    if (waveform) {
      const mid = HEIGHT / 2;
      for (let px = 0; px < W; px++) {
        const idx = Math.floor((px / W) * waveform.peaks.length);
        const amp = Math.abs(waveform.peaks[idx] ?? 0) * mid * 0.9;
        const rms = (waveform.rms[idx] ?? 0) * mid * 0.6;
        // Peak
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(px, mid - amp, 1, amp * 2);
        // RMS
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(px, mid - rms, 1, rms * 2);
      }
    }

    // View window
    if (duration > 0) {
      const viewDuration = duration / zoom;
      const viewStart = Math.max(0, position - viewDuration / 2);
      const x1 = (viewStart / duration) * W;
      const w = (viewDuration / duration) * W;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0, w, HEIGHT);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x1, 0, w, HEIGHT);

      // Playhead
      const px = (position / duration) * W;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, HEIGHT);
      ctx.stroke();
    }
  }, [waveform, position, duration, zoom]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(frac * duration);
  }, [duration, onSeek]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={HEIGHT}
      onClick={handleClick}
      className="w-full cursor-pointer rounded"
      style={{ height: HEIGHT }}
    />
  );
}

// ── Phase meter ────────────────────────────────────────────────────────────────

function PhaseMeter({ phase, masterPhase }: { phase: number; masterPhase: number }) {
  const SIZE = 48;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 4;

  const deckAngle = phase * 2 * Math.PI - Math.PI / 2;
  const masterAngle = masterPhase * 2 * Math.PI - Math.PI / 2;

  const dx = cx + r * Math.cos(deckAngle);
  const dy = cy + r * Math.sin(deckAngle);
  const mx = cx + r * Math.cos(masterAngle);
  const my = cy + r * Math.sin(masterAngle);

  const phaseDiff = Math.abs(phase - masterPhase);
  const aligned = phaseDiff < 0.05 || phaseDiff > 0.95;

  return (
    <div className="flex flex-col items-center">
      <svg width={SIZE} height={SIZE}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="1" />
        <line x1={cx} y1={cy} x2={mx} y2={my} stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={dx} y2={dy} stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2} fill={aligned ? '#22c55e' : '#ef4444'} />
      </svg>
      <span className="text-[8px] text-gray-500 mt-0.5">PHASE</span>
    </div>
  );
}

// ── Main WaveformDisplay component ────────────────────────────────────────────

interface WaveformDisplayProps {
  deckId: DeckId;
}

export function WaveformDisplay({ deckId }: WaveformDisplayProps) {
  const deck = useDJStore(selectDeck(deckId));
  const masterPhase = useDJStore(s => s.mixer.masterPhase);
  const seek = useDJStore(s => s.seek);
  const setWaveformZoom = useDJStore(s => s.setWaveformZoom);

  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WaveformRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  const [spectralMode, setSpectralMode] = useState(false);
  const [zoom, setZoomLocal] = useState(deck.waveformZoom);

  const track = deck.track;
  const waveform = track?.waveformData ?? null;
  const beatGrid = track?.beatGrid ?? null;
  const cuePoints = track?.cuePoints ?? [];
  const duration = track?.duration ?? 0;
  const position = deck.position;

  const HEIGHT = 96;

  // Sync zoom to store
  useEffect(() => {
    setWaveformZoom(deckId, zoom);
  }, [zoom, deckId, setWaveformZoom]);

  // Init WebGL
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new WaveformRenderer(canvas);
    } catch (e) {
      console.warn('WebGL init failed, falling back:', e);
    }
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // Render loop
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!glCanvas || !overlayCanvas) return;

    const renderer = rendererRef.current;
    const W = glCanvas.clientWidth || 600;

    const render = () => {
      // Resize
      if (glCanvas.width !== W || glCanvas.height !== HEIGHT) {
        renderer?.resize(W, HEIGHT);
        overlayCanvas.width = W;
        overlayCanvas.height = HEIGHT;
      }

      renderer?.clear();

      if (waveform && duration > 0) {
        const viewDuration = duration / zoom;
        const viewStart = Math.max(0, position - viewDuration / 2);
        const startSample = Math.floor((viewStart / duration) * waveform.peaks.length);
        const endSample = Math.ceil(((viewStart + viewDuration) / duration) * waveform.peaks.length);

        const { positions, colors } = buildWaveformBuffers(
          waveform, startSample, endSample, W, HEIGHT, spectralMode
        );
        renderer?.drawLines(positions, colors);
      }

      // Overlay
      const ctx = overlayCanvas.getContext('2d');
      if (ctx) {
        drawOverlay(ctx, W, HEIGHT, position, duration, zoom, beatGrid, cuePoints, deck.activeLoop, deck.isLoopActive);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [waveform, duration, position, zoom, spectralMode, beatGrid, cuePoints, deck.activeLoop, deck.isLoopActive]);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const viewDuration = duration / zoom;
    const viewStart = Math.max(0, position - viewDuration / 2);
    const t = viewStart + frac * viewDuration;
    seek(deckId, Math.max(0, Math.min(duration, t)));
  }, [deckId, duration, position, zoom, seek]);

  const ZOOM_LEVELS = [1, 2, 4, 8];

  return (
    <div className="flex flex-col gap-1 bg-gray-900 rounded-lg overflow-hidden border border-gray-700/50">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-800">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">Zoom</span>
          {ZOOM_LEVELS.map(z => (
            <button
              key={z}
              onClick={() => setZoomLocal(z)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                zoom === z ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              x{z}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSpectralMode(s => !s)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              spectralMode ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            SPEC
          </button>
          {masterPhase !== undefined && (
            <PhaseMeter phase={duration > 0 ? (position / (60 / (track?.bpm ?? 120))) % 1 : 0} masterPhase={masterPhase} />
          )}
        </div>
      </div>

      {/* Waveform canvas */}
      <div
        className="relative cursor-crosshair"
        style={{ height: HEIGHT }}
        onClick={handleWaveformClick}
      >
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 w-full"
          style={{ height: HEIGHT, display: 'block' }}
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full pointer-events-none"
          style={{ height: HEIGHT, display: 'block' }}
        />
        {!waveform && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-600 text-sm">
              {track ? 'Analyzing waveform...' : 'No track loaded'}
            </span>
          </div>
        )}
      </div>

      {/* Overview strip */}
      <div className="px-1 pb-1">
        <OverviewStrip
          waveform={waveform}
          position={position}
          duration={duration}
          zoom={zoom}
          onSeek={t => seek(deckId, t)}
        />
      </div>
    </div>
  );
}

export default WaveformDisplay;
