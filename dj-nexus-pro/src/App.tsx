// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Root React Application Component
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type DragEvent,
} from 'react';
import { useStore } from './store';
import type { DeckId, Track } from './types';

// ── Lazy-loaded panels ────────────────────────────────────────────────────────

const Deck            = React.lazy(() => import('./components/Deck'));
const Mixer           = React.lazy(() => import('./components/Mixer'));
const LibraryBrowser  = React.lazy(() => import('./components/Library'));
const EffectsRack     = React.lazy(() => import('./components/Effects'));
const Sampler         = React.lazy(() => import('./components/Sampler'));
const HarmonicMixer   = React.lazy(() => import('./components/HarmonicMixer'));
const Header          = React.lazy(() => import('./components/Header'));
const Settings        = React.lazy(() => import('./components/Settings/Settings').then(m => ({ default: m.Settings })));

// ── Drag & Drop context ───────────────────────────────────────────────────────

interface DragDropCtx {
  draggedTrack: Track | null;
  setDraggedTrack: (t: Track | null) => void;
}

const DragDropContext = createContext<DragDropCtx>({
  draggedTrack: null,
  setDraggedTrack: () => {},
});

export function useDragDrop(): DragDropCtx {
  return useContext(DragDropContext);
}

function DragDropProvider({ children }: { children: React.ReactNode }) {
  const [draggedTrack, setDraggedTrack] = useState<Track | null>(null);
  return (
    <DragDropContext.Provider value={{ draggedTrack, setDraggedTrack }}>
      {children}
    </DragDropContext.Provider>
  );
}

// ── Deck mode ─────────────────────────────────────────────────────────────────

type DeckMode = 2 | 4 | 6;

const DECK_IDS_BY_MODE: Record<DeckMode, DeckId[]> = {
  2: ['A', 'B'],
  4: ['A', 'B', 'C', 'D'],
  6: ['A', 'B', 'C', 'D', 'E', 'F'],
};

// ── Resizable panels ──────────────────────────────────────────────────────────
// Simple drag-resize implementation (avoids adding react-resizable-panels dep
// while keeping the codebase self-contained).

interface PanelResizerProps {
  orientation: 'horizontal' | 'vertical';
  onDelta: (delta: number) => void;
}

const PanelResizer: React.FC<PanelResizerProps> = ({ orientation, onDelta }) => {
  const isDragging = useRef(false);
  const lastPos = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = orientation === 'horizontal' ? e.clientX : e.clientY;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDragging.current) return;
      const pos = orientation === 'horizontal' ? me.clientX : me.clientY;
      onDelta(pos - lastPos.current);
      lastPos.current = pos;
    };

    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }, [orientation, onDelta]);

  return (
    <div
      className={`panel-resizer panel-resizer--${orientation}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation={orientation}
    />
  );
};

// ── Right panel tab ───────────────────────────────────────────────────────────

type RightTab = 'playlist' | 'harmonic';

// ── Global keyboard shortcuts ─────────────────────────────────────────────────

function useGlobalShortcuts(deckMode: DeckMode) {
  const playDeck       = useStore(s => s.playDeck);
  const pauseDeck      = useStore(s => s.pauseDeck);
  const cueDeck        = useStore(s => s.cueDeck);
  const activeDeck     = useStore(s => s.activeDeck ?? 'A');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when focused on an input / select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      const deck = activeDeck as DeckId;

      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          const state = useStore.getState();
          const deckState = state.decks[deck];
          if (deckState?.playState === 'playing') {
            pauseDeck?.(deck);
          } else {
            playDeck?.(deck);
          }
          break;
        }
        case 'Enter':
          e.preventDefault();
          cueDeck?.(deck);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeDeck, playDeck, pauseDeck, cueDeck]);
}

// ── Suspense fallback ─────────────────────────────────────────────────────────

const PanelSkeleton: React.FC<{ height?: string }> = ({ height = '100%' }) => (
  <div className="panel-skeleton" style={{ height }} />
);

// ── App component ─────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  const [deckMode,         setDeckMode]         = useState<DeckMode>(2);
  const [showSettings,     setShowSettings]     = useState(false);
  const [rightTab,         setRightTab]         = useState<RightTab>('playlist');

  // Panel widths in pixels
  const [leftWidth,        setLeftWidth]        = useState(260);
  const [rightWidth,       setRightWidth]       = useState(260);
  const [centerTopHeight,  setCenterTopHeight]  = useState(400); // deck area

  const deckIds = DECK_IDS_BY_MODE[deckMode];

  useGlobalShortcuts(deckMode);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleAppDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleAppDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      console.log('[App] Dropped files:', files.map(f => f.path ?? f.name));
      // dispatch to library import
    }
  }, []);

  // ── Panel resize deltas ────────────────────────────────────────────────────

  const onLeftResize  = useCallback((d: number) => setLeftWidth(w  => Math.max(160, Math.min(600, w + d))), []);
  const onRightResize = useCallback((d: number) => setRightWidth(w => Math.max(160, Math.min(600, w - d))), []);
  const onTopResize   = useCallback((d: number) => setCenterTopHeight(h => Math.max(200, Math.min(700, h + d))), []);

  return (
    <DragDropProvider>
      <div
        className="app-root"
        data-deck-mode={deckMode}
        onDragOver={handleAppDragOver}
        onDrop={handleAppDrop}
      >
        {/* ── Top header bar ── */}
        <React.Suspense fallback={<div className="header-skeleton" />}>
          <Header
            deckMode={deckMode}
            onDeckModeChange={setDeckMode}
            onOpenSettings={() => setShowSettings(true)}
          />
        </React.Suspense>

        {/* ── Main three-column layout ── */}
        <div className="app-main">
          {/* Left: Library */}
          <div className="panel panel--left" style={{ width: leftWidth, minWidth: leftWidth }}>
            <React.Suspense fallback={<PanelSkeleton />}>
              <LibraryBrowser />
            </React.Suspense>
          </div>

          <PanelResizer orientation="horizontal" onDelta={onLeftResize} />

          {/* Center: Decks + Mixer + Effects + Sampler */}
          <div className="panel panel--center">
            {/* Top: Decks */}
            <div className="center-top" style={{ height: centerTopHeight }}>
              <div className="decks-row">
                {deckIds.slice(0, Math.ceil(deckIds.length / 2)).map(id => (
                  <React.Suspense key={id} fallback={<PanelSkeleton height="100%" />}>
                    <Deck deckId={id} />
                  </React.Suspense>
                ))}
              </div>

              {/* Mixer (centre strip) */}
              <React.Suspense fallback={<PanelSkeleton />}>
                <Mixer />
              </React.Suspense>

              <div className="decks-row">
                {deckIds.slice(Math.ceil(deckIds.length / 2)).map(id => (
                  <React.Suspense key={id} fallback={<PanelSkeleton height="100%" />}>
                    <Deck deckId={id} />
                  </React.Suspense>
                ))}
              </div>
            </div>

            <PanelResizer orientation="vertical" onDelta={onTopResize} />

            {/* Bottom: Effects rack + Sampler */}
            <div className="center-bottom">
              <React.Suspense fallback={<PanelSkeleton />}>
                <EffectsRack />
              </React.Suspense>
              <React.Suspense fallback={<PanelSkeleton />}>
                <Sampler />
              </React.Suspense>
            </div>
          </div>

          <PanelResizer orientation="horizontal" onDelta={onRightResize} />

          {/* Right: Playlist / Harmonic mixer */}
          <div className="panel panel--right" style={{ width: rightWidth, minWidth: rightWidth }}>
            <div className="right-panel-tabs">
              <button
                className={`right-tab-btn ${rightTab === 'playlist' ? 'right-tab-btn--active' : ''}`}
                onClick={() => setRightTab('playlist')}
              >
                Playlist
              </button>
              <button
                className={`right-tab-btn ${rightTab === 'harmonic' ? 'right-tab-btn--active' : ''}`}
                onClick={() => setRightTab('harmonic')}
              >
                Key Mix
              </button>
            </div>
            <div className="right-panel-body">
              {rightTab === 'harmonic' && (
                <React.Suspense fallback={<PanelSkeleton />}>
                  <HarmonicMixer />
                </React.Suspense>
              )}
              {rightTab === 'playlist' && (
                <div className="playlist-panel">
                  {/* Playlist panel — inline until a dedicated component is created */}
                  <PlaylistPanel />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Settings modal */}
        {showSettings && (
          <React.Suspense fallback={null}>
            <Settings onClose={() => setShowSettings(false)} />
          </React.Suspense>
        )}
      </div>

      <AppStyles />
    </DragDropProvider>
  );
};

// ── Inline playlist panel ─────────────────────────────────────────────────────

const PlaylistPanel: React.FC = () => {
  const history = useStore(s => s.setHistory);

  return (
    <div className="playlist-inner">
      <h4 className="playlist-title">Set History</h4>
      {(!history || history.entries.length === 0) && (
        <p className="playlist-empty">No tracks played yet.</p>
      )}
      {history?.entries.map((entry, i) => (
        <div key={entry.trackId + i} className="history-row">
          <span className="history-index">{i + 1}</span>
          <div className="history-meta">
            <span className="history-title">{entry.title ?? 'Unknown'}</span>
            <span className="history-artist">{entry.artist ?? ''}</span>
          </div>
          <span className="history-time">
            {new Date(entry.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const AppStyles: React.FC = () => (
  <style>{`
    /* ── CSS custom properties (dark theme) ── */
    :root {
      --bg-1: #0d0d1a;
      --bg-2: #13132b;
      --bg-3: #0a0a1f;
      --bg-4: #07071a;
      --border: #1e1e3a;
      --accent: #00d1ff;
      --accent-dim: rgba(0, 209, 255, 0.15);
      --text-primary: #e8e8f0;
      --text-secondary: #8888aa;
      --text-muted: #44445a;
      --danger: #cc2244;
      --success: #00cc66;
      --font-size-base: 13px;
      --panel-gap: 2px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-1);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: var(--font-size-base);
      overflow: hidden;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    /* ── App shell ── */
    .app-root {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: var(--bg-1);
    }

    .header-skeleton {
      height: 48px;
      background: var(--bg-3);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    /* ── Main layout ── */
    .app-main {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: 0;
    }

    .panel {
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--bg-2);
    }
    .panel--center {
      flex: 1;
      min-width: 0;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }
    .panel--left, .panel--right {
      flex-shrink: 0;
      border: none;
    }

    /* ── Resizer ── */
    .panel-resizer {
      flex-shrink: 0;
      background: var(--border);
      transition: background 0.15s;
      z-index: 10;
    }
    .panel-resizer:hover { background: var(--accent); }
    .panel-resizer--horizontal { width: 3px; cursor: col-resize; }
    .panel-resizer--vertical { height: 3px; cursor: row-resize; }

    /* ── Center columns ── */
    .center-top {
      display: flex;
      flex-direction: row;
      overflow: hidden;
      flex-shrink: 0;
    }
    .center-bottom {
      flex: 1;
      display: flex;
      overflow: hidden;
      border-top: 1px solid var(--border);
    }
    .decks-row {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ── Panel skeleton ── */
    .panel-skeleton {
      background: var(--bg-3);
      animation: skeleton-pulse 1.4s ease-in-out infinite;
    }
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.5; }
    }

    /* ── Right panel ── */
    .right-panel-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--bg-3);
      flex-shrink: 0;
    }
    .right-tab-btn {
      flex: 1;
      padding: 8px 4px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .right-tab-btn:hover { color: var(--text-primary); }
    .right-tab-btn--active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .right-panel-body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ── Playlist / Set history ── */
    .playlist-panel { flex: 1; overflow-y: auto; }
    .playlist-inner { padding: 8px; }
    .playlist-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 8px; }
    .playlist-empty { font-size: 12px; color: var(--text-muted); font-style: italic; padding: 8px 0; }
    .history-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 4px;
      border-radius: 4px;
      transition: background 0.1s;
    }
    .history-row:hover { background: rgba(255,255,255,0.04); }
    .history-index { font-size: 11px; color: var(--text-muted); width: 18px; text-align: right; flex-shrink: 0; }
    .history-meta { flex: 1; min-width: 0; }
    .history-title { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-artist { display: block; font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

    /* ── Scrollbars ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-4); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* ── Focus rings ── */
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  `}</style>
);
