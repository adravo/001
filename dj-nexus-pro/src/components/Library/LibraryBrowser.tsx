// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Library Browser
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  MouseEvent,
} from 'react';
import { useDJStore } from '../../store';
import type {
  Track,
  DeckId,
  LibrarySortField,
  SortDirection,
  Playlist,
  Crate,
} from '../../types';

// ── Camelot colour map ────────────────────────────────────────────────────────

const CAMELOT_COLORS: Record<string, string> = {
  '1A': '#e74c3c', '1B': '#c0392b',
  '2A': '#e67e22', '2B': '#d35400',
  '3A': '#f1c40f', '3B': '#f39c12',
  '4A': '#2ecc71', '4B': '#27ae60',
  '5A': '#1abc9c', '5B': '#16a085',
  '6A': '#3498db', '6B': '#2980b9',
  '7A': '#9b59b6', '7B': '#8e44ad',
  '8A': '#e91e63', '8B': '#c2185b',
  '9A': '#ff5722', '9B': '#e64a19',
  '10A': '#ff9800', '10B': '#f57c00',
  '11A': '#8bc34a', '11B': '#689f38',
  '12A': '#00bcd4', '12B': '#0097a7',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isCamelotCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  const modeA = a.slice(-1);
  const modeB = b.slice(-1);
  if (a === b) return true;
  if (modeA === modeB && Math.abs(numA - numB) === 1) return true;
  if (modeA === modeB && Math.abs(numA - numB) === 11) return true; // wrap
  if (modeA !== modeB && numA === numB) return true; // relative major/minor
  return false;
}

// ── Star rating ───────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: 0 | 1 | 2 | 3 | 4 | 5;
  onChange?: (v: 0 | 1 | 2 | 3 | 4 | 5) => void;
  readonly?: boolean;
}

const StarRating: React.FC<StarRatingProps> = ({ value, onChange, readonly }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className={`text-xs cursor-pointer select-none transition-colors ${
            star <= (hover || value) ? 'text-yellow-400' : 'text-gray-600'
          } ${readonly ? 'cursor-default' : 'hover:text-yellow-300'}`}
          onMouseEnter={() => !readonly && setHover(star)}
          onClick={() => !readonly && onChange?.((star === value ? 0 : star) as 0 | 1 | 2 | 3 | 4 | 5)}
        >
          ★
        </span>
      ))}
    </div>
  );
};

// ── Key badge ─────────────────────────────────────────────────────────────────

const KeyBadge: React.FC<{ camelot: string }> = ({ camelot }) => {
  const color = CAMELOT_COLORS[camelot] ?? '#555';
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {camelot}
    </span>
  );
};

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  trackIds: string[];
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onLoadToDeck: (deckId: DeckId) => void;
  onAddToPlaylist: (playlistId: string) => void;
  onAnalyze: () => void;
  onEditTags: () => void;
  onRevealInFinder: () => void;
  onRemove: () => void;
  playlists: Playlist[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  state,
  onClose,
  onLoadToDeck,
  onAddToPlaylist,
  onAnalyze,
  onEditTags,
  onRevealInFinder,
  onRemove,
  playlists,
}) => {
  const [showPlaylistSub, setShowPlaylistSub] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const Item: React.FC<{ label: string; onClick?: () => void; children?: React.ReactNode }> = ({
    label,
    onClick,
    children,
  }) => (
    <div
      className="relative px-3 py-1.5 text-sm text-gray-200 hover:bg-blue-600 cursor-pointer flex items-center justify-between select-none"
      onClick={onClick}
    >
      {label}
      {children}
    </div>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-2xl min-w-[180px] py-1 text-sm"
      style={{ left: state.x, top: state.y }}
    >
      <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700 mb-1">
        Load to Deck
      </div>
      {(['A', 'B', 'C', 'D'] as DeckId[]).map(id => (
        <Item key={id} label={`Deck ${id}`} onClick={() => { onLoadToDeck(id); onClose(); }} />
      ))}
      <div className="border-t border-gray-700 my-1" />
      <div
        className="relative px-3 py-1.5 text-sm text-gray-200 hover:bg-blue-600 cursor-pointer flex items-center justify-between"
        onMouseEnter={() => setShowPlaylistSub(true)}
        onMouseLeave={() => setShowPlaylistSub(false)}
      >
        Add to Playlist
        <span className="text-gray-400">▶</span>
        {showPlaylistSub && (
          <div className="absolute left-full top-0 bg-gray-800 border border-gray-600 rounded shadow-2xl min-w-[160px] py-1">
            {playlists.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-gray-500">No playlists</div>
            )}
            {playlists.map(pl => (
              <div
                key={pl.id}
                className="px-3 py-1.5 text-sm text-gray-200 hover:bg-blue-600 cursor-pointer"
                onClick={() => { onAddToPlaylist(pl.id); onClose(); }}
              >
                {pl.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-gray-700 my-1" />
      <Item label="Analyze Track" onClick={() => { onAnalyze(); onClose(); }} />
      <Item label="Edit Tags" onClick={() => { onEditTags(); onClose(); }} />
      <Item label="Reveal in Finder" onClick={() => { onRevealInFinder(); onClose(); }} />
      <div className="border-t border-gray-700 my-1" />
      <Item label="Remove from Library" onClick={() => { onRemove(); onClose(); }} />
    </div>
  );
};

// ── Sidebar item ──────────────────────────────────────────────────────────────

interface SidebarItemProps {
  label: string;
  icon: string;
  isSelected: boolean;
  onClick: () => void;
  count?: number;
  color?: string | null;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  label,
  icon,
  isSelected,
  onClick,
  count,
  color,
}) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer select-none transition-colors text-sm ${
      isSelected ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
    }`}
    onClick={onClick}
  >
    <span className="text-base">{icon}</span>
    {color && (
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    )}
    <span className="flex-1 truncate">{label}</span>
    {count !== undefined && (
      <span className="text-xs text-gray-500 tabular-nums">{count}</span>
    )}
  </div>
);

// ── Column header ─────────────────────────────────────────────────────────────

interface ColHeaderProps {
  label: string;
  field: LibrarySortField;
  currentField: LibrarySortField;
  direction: SortDirection;
  onSort: (field: LibrarySortField) => void;
  width: string;
}

const ColHeader: React.FC<ColHeaderProps> = ({
  label,
  field,
  currentField,
  direction,
  onSort,
  width,
}) => (
  <th
    className={`px-2 py-1.5 text-left text-xs font-medium tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-700 transition-colors ${
      field === currentField ? 'text-blue-400' : 'text-gray-400'
    }`}
    style={{ width }}
    onClick={() => onSort(field)}
  >
    {label}
    {field === currentField && (
      <span className="ml-1">{direction === 'asc' ? '↑' : '↓'}</span>
    )}
  </th>
);

// ── BPM range slider ──────────────────────────────────────────────────────────

interface BpmRangeProps {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

const BpmRange: React.FC<BpmRangeProps> = ({ min, max, onChange }) => (
  <div className="flex items-center gap-2 text-xs text-gray-400">
    <span>BPM</span>
    <input
      type="number"
      placeholder="60"
      value={min ?? ''}
      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs"
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null, max)}
    />
    <span>–</span>
    <input
      type="number"
      placeholder="200"
      value={max ?? ''}
      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs"
      onChange={e => onChange(min, e.target.value ? Number(e.target.value) : null)}
    />
  </div>
);

// ── Tag editor modal (lightweight) ────────────────────────────────────────────

interface EditTagsModalProps {
  track: Track;
  onClose: () => void;
  onSave: (updates: Partial<Track['metadata']> & { rating: Track['rating'] }) => void;
}

const EditTagsModal: React.FC<EditTagsModalProps> = ({ track, onClose, onSave }) => {
  const [title, setTitle] = useState(track.metadata.title);
  const [artist, setArtist] = useState(track.metadata.artist);
  const [album, setAlbum] = useState(track.metadata.album);
  const [genre, setGenre] = useState(track.metadata.genre);
  const [comment, setComment] = useState(track.metadata.comment);
  const [rating, setRating] = useState<Track['rating']>(track.rating);
  const [year, setYear] = useState(track.metadata.year?.toString() ?? '');

  const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
    label,
    value,
    onChange,
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-5 w-[420px] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Edit Tags</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" value={title} onChange={setTitle} />
          <Field label="Artist" value={artist} onChange={setArtist} />
          <Field label="Album" value={album} onChange={setAlbum} />
          <Field label="Genre" value={genre} onChange={setGenre} />
          <Field label="Year" value={year} onChange={setYear} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Rating</label>
            <StarRating value={rating} onChange={setRating} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Comment</label>
          <textarea
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-500"
            onClick={() => {
              onSave({
                title,
                artist,
                album,
                genre,
                comment,
                year: year ? parseInt(year, 10) : null,
                rating,
              });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Track row ─────────────────────────────────────────────────────────────────

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  isCompatible: boolean | null; // null = no master track
  isDragging: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (e: MouseEvent, id: string) => void;
  onDragStart: (e: React.DragEvent, track: Track) => void;
  onRatingChange: (id: string, rating: Track['rating']) => void;
}

const TrackRow = React.memo<TrackRowProps>(({
  track,
  isSelected,
  isCompatible,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onRatingChange,
}) => {
  const meta = track.metadata;
  const rowBg = isSelected
    ? 'bg-blue-700/50'
    : isCompatible === true
    ? 'bg-green-900/20 hover:bg-green-900/30'
    : isCompatible === false
    ? 'opacity-50 hover:bg-gray-750'
    : 'hover:bg-gray-750';

  return (
    <tr
      draggable
      className={`border-b border-gray-800 cursor-pointer select-none transition-opacity ${rowBg}`}
      onClick={e => onSelect(track.id, e.ctrlKey || e.metaKey)}
      onDoubleClick={() => onDoubleClick(track)}
      onContextMenu={e => onContextMenu(e as unknown as MouseEvent, track.id)}
      onDragStart={e => onDragStart(e, track)}
    >
      <td className="px-2 py-1.5 text-sm text-gray-200 max-w-[200px]">
        <div className="truncate">{meta.title || '(untitled)'}</div>
      </td>
      <td className="px-2 py-1.5 text-sm text-gray-300 max-w-[140px]">
        <div className="truncate">{meta.artist}</div>
      </td>
      <td className="px-2 py-1.5 text-sm text-gray-400 max-w-[120px]">
        <div className="truncate">{meta.album}</div>
      </td>
      <td className="px-2 py-1.5 text-sm text-gray-300 tabular-nums text-right">
        {track.bpm ? track.bpm.toFixed(1) : '—'}
      </td>
      <td className="px-2 py-1.5">
        {track.key ? <KeyBadge camelot={track.key.camelot} /> : <span className="text-gray-600 text-xs">—</span>}
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-400 tabular-nums text-right">
        {formatDuration(track.duration)}
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-400 max-w-[90px]">
        <div className="truncate">{meta.genre}</div>
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-500 tabular-nums">
        {meta.year ?? ''}
      </td>
      <td className="px-2 py-1.5">
        <StarRating
          value={track.rating}
          onChange={v => onRatingChange(track.id, v)}
        />
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-500 max-w-[120px]">
        <div className="truncate">{meta.comment}</div>
      </td>
      {track.energy !== null && (
        <td className="px-2 py-1.5">
          <div className="w-12 h-1.5 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-orange-400 rounded"
              style={{ width: `${(track.energy ?? 0) * 100}%` }}
            />
          </div>
        </td>
      )}
    </tr>
  );
});
TrackRow.displayName = 'TrackRow';

// ── Smart crate editor ────────────────────────────────────────────────────────

interface SmartCrateEditorProps {
  playlist: Playlist;
  onClose: () => void;
  onSave: (filters: NonNullable<Playlist['smartFilters']>) => void;
}

const SmartCrateEditor: React.FC<SmartCrateEditorProps> = ({ playlist, onClose, onSave }) => {
  const initialFilters = playlist.smartFilters ?? {
    query: '',
    genre: null,
    key: null,
    bpmMin: null,
    bpmMax: null,
    energyMin: null,
    energyMax: null,
    rating: null,
    tags: [],
    dateAddedAfter: null,
  };
  const [filters, setFilters] = useState(initialFilters);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-5 w-[480px] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Smart Crate: {playlist.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-gray-400">Title / Artist contains</label>
            <input
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.query}
              onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Genre</label>
            <input
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.genre ?? ''}
              onChange={e => setFilters(f => ({ ...f, genre: e.target.value || null }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Min Rating</label>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
              value={filters.rating ?? ''}
              onChange={e => setFilters(f => ({ ...f, rating: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r}★+</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">BPM Min</label>
            <input
              type="number"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
              value={filters.bpmMin ?? ''}
              onChange={e => setFilters(f => ({ ...f, bpmMin: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">BPM Max</label>
            <input
              type="number"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
              value={filters.bpmMax ?? ''}
              onChange={e => setFilters(f => ({ ...f, bpmMax: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-500" onClick={() => { onSave(filters); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

export const LibraryBrowser: React.FC = () => {
  const {
    library,
    decks,
    selectPlaylist,
    selectCrate,
    setLibrarySort,
    setLibraryFilter,
    clearLibraryFilter,
    updateTrack,
    removeTrack,
    loadTrack: loadTrackToDeck,
    addTrackToPlaylist,
    createPlaylist,
    updatePlaylist,
    createCrate,
    selectTracks,
  } = useDJStore();

  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editTagsTrack, setEditTagsTrack] = useState<Track | null>(null);
  const [smartCratePlaylist, setSmartCratePlaylist] = useState<Playlist | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [creatingType, setCreatingType] = useState<'playlist' | 'crate' | null>(null);
  const [expandedSections, setExpandedSections] = useState({ playlists: true, crates: true });
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const resizingRef = useRef(false);

  // Determine master deck key for compatibility highlighting
  const masterDeck = useMemo(() => {
    const playing = Object.values(decks).find(d => d.playState === 'playing');
    return playing?.track ?? null;
  }, [decks]);

  // Build filtered + sorted track list
  const displayedTracks = useMemo(() => {
    const { filter, sort, selectedPlaylistId, selectedCrateId, tracks, playlists, crates } = library;
    let pool: Track[] = Object.values(tracks);

    // Source filter
    if (selectedPlaylistId) {
      const pl = playlists[selectedPlaylistId];
      if (pl) pool = pl.trackIds.map(id => tracks[id]).filter(Boolean) as Track[];
    } else if (selectedCrateId) {
      const cr = crates[selectedCrateId];
      if (cr) pool = cr.trackIds.map(id => tracks[id]).filter(Boolean) as Track[];
    }

    // Apply smart filters for smart playlists
    if (selectedPlaylistId) {
      const pl = playlists[selectedPlaylistId];
      if (pl?.isSmartPlaylist && pl.smartFilters) {
        const sf = pl.smartFilters;
        pool = Object.values(tracks).filter(t => {
          if (sf.query && !`${t.metadata.title} ${t.metadata.artist}`.toLowerCase().includes(sf.query.toLowerCase())) return false;
          if (sf.genre && t.metadata.genre !== sf.genre) return false;
          if (sf.bpmMin !== null && (t.bpm ?? 0) < sf.bpmMin) return false;
          if (sf.bpmMax !== null && (t.bpm ?? 999) > sf.bpmMax) return false;
          if (sf.rating !== null && t.rating < sf.rating) return false;
          return true;
        });
      }
    }

    // Text search
    const q = (searchQuery || filter.query).toLowerCase();
    if (q) {
      pool = pool.filter(t =>
        t.metadata.title.toLowerCase().includes(q) ||
        t.metadata.artist.toLowerCase().includes(q) ||
        t.metadata.album.toLowerCase().includes(q) ||
        t.metadata.genre.toLowerCase().includes(q)
      );
    }
    if (filter.genre) pool = pool.filter(t => t.metadata.genre === filter.genre);
    if (filter.bpmMin !== null) pool = pool.filter(t => (t.bpm ?? 0) >= (filter.bpmMin ?? 0));
    if (filter.bpmMax !== null) pool = pool.filter(t => (t.bpm ?? 999) <= (filter.bpmMax ?? 999));
    if (filter.rating !== null) pool = pool.filter(t => t.rating >= (filter.rating ?? 0));
    if (filter.key) pool = pool.filter(t => t.key?.camelot === filter.key);

    // Sort
    pool.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sort.field) {
        case 'title': aVal = a.metadata.title; bVal = b.metadata.title; break;
        case 'artist': aVal = a.metadata.artist; bVal = b.metadata.artist; break;
        case 'album': aVal = a.metadata.album; bVal = b.metadata.album; break;
        case 'bpm': aVal = a.bpm ?? 0; bVal = b.bpm ?? 0; break;
        case 'key': aVal = a.key?.camelot ?? ''; bVal = b.key?.camelot ?? ''; break;
        case 'duration': aVal = a.duration; bVal = b.duration; break;
        case 'energy': aVal = a.energy ?? 0; bVal = b.energy ?? 0; break;
        case 'rating': aVal = a.rating; bVal = b.rating; break;
        case 'dateAdded': aVal = a.dateAdded; bVal = b.dateAdded; break;
        case 'lastPlayed': aVal = a.lastPlayedAt ?? 0; bVal = b.lastPlayedAt ?? 0; break;
        case 'playCount': aVal = a.playCount; bVal = b.playCount; break;
      }
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sort.direction === 'asc' ? cmp : -cmp;
    });

    return pool;
  }, [library, searchQuery]);

  const handleSort = useCallback((field: LibrarySortField) => {
    setLibrarySort({
      field,
      direction:
        library.sort.field === field && library.sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [library.sort, setLibrarySort]);

  const handleContextMenu = useCallback((e: MouseEvent, trackId: string) => {
    e.preventDefault();
    const selected = library.selectedTrackIds.includes(trackId)
      ? library.selectedTrackIds
      : [trackId];
    setContextMenu({ x: e.clientX, y: e.clientY, trackIds: selected });
  }, [library.selectedTrackIds]);

  const handleLoadToDeck = useCallback((deckId: DeckId) => {
    if (!contextMenu) return;
    const track = library.tracks[contextMenu.trackIds[0]];
    if (track) loadTrackToDeck(deckId, track);
  }, [contextMenu, library.tracks, loadTrackToDeck]);

  const handleAddToPlaylist = useCallback((playlistId: string) => {
    if (!contextMenu) return;
    contextMenu.trackIds.forEach(id => addTrackToPlaylist(playlistId, id));
  }, [contextMenu, addTrackToPlaylist]);

  const handleDragStart = useCallback((e: React.DragEvent, track: Track) => {
    e.dataTransfer.setData('application/dj-nexus-track', JSON.stringify({ trackId: track.id }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleNewItem = useCallback(() => {
    if (!newItemName.trim() || !creatingType) return;
    if (creatingType === 'playlist') createPlaylist(newItemName.trim());
    else createCrate(newItemName.trim());
    setNewItemName('');
    setCreatingType(null);
  }, [newItemName, creatingType, createPlaylist, createCrate]);

  const toggleSection = (key: 'playlists' | 'crates') => {
    setExpandedSections(s => ({ ...s, [key]: !s[key] }));
  };

  const playlists = Object.values(library.playlists);
  const crates = Object.values(library.crates);
  const allGenres = useMemo(
    () => [...new Set(Object.values(library.tracks).map(t => t.metadata.genre).filter(Boolean))].sort(),
    [library.tracks]
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 select-none overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-850 border-b border-gray-700 flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-gray-800 border border-gray-600 rounded px-2 py-1">
          <span className="text-gray-500 text-sm">🔍</span>
          <input
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
            placeholder="Search tracks, artists, albums…"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setLibraryFilter({ query: e.target.value });
            }}
          />
          {searchQuery && (
            <button
              className="text-gray-500 hover:text-gray-300 text-xs"
              onClick={() => { setSearchQuery(''); clearLibraryFilter(); }}
            >
              ✕
            </button>
          )}
        </div>
        <button
          className={`px-2 py-1 rounded text-xs transition-colors ${showFilters ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          onClick={() => setShowFilters(v => !v)}
        >
          Filters
        </button>
        <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
          {displayedTracks.length} tracks
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-4 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 flex-wrap">
          <BpmRange
            min={library.filter.bpmMin}
            max={library.filter.bpmMax}
            onChange={(min, max) => setLibraryFilter({ bpmMin: min, bpmMax: max })}
          />
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Genre</span>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs"
              value={library.filter.genre ?? ''}
              onChange={e => setLibraryFilter({ genre: e.target.value || null })}
            >
              <option value="">Any</option>
              {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Rating</span>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs"
              value={library.filter.rating ?? ''}
              onChange={e => setLibraryFilter({ rating: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r}★+</option>)}
            </select>
          </div>
          <button
            className="text-xs text-gray-500 hover:text-gray-300"
            onClick={clearLibraryFilter}
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          className="flex flex-col border-r border-gray-700 bg-gray-850 overflow-y-auto flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          {/* All tracks */}
          <SidebarItem
            label="All Tracks"
            icon="🎵"
            isSelected={!library.selectedPlaylistId && !library.selectedCrateId}
            onClick={() => { selectPlaylist(null); selectCrate(null); }}
            count={Object.keys(library.tracks).length}
          />

          {/* Playlists section */}
          <div className="mt-2">
            <div
              className="flex items-center justify-between px-3 py-1 cursor-pointer"
              onClick={() => toggleSection('playlists')}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {expandedSections.playlists ? '▼' : '▶'} Playlists
              </span>
              <button
                className="text-gray-500 hover:text-gray-300 text-xs"
                onClick={e => { e.stopPropagation(); setCreatingType('playlist'); }}
              >
                +
              </button>
            </div>
            {expandedSections.playlists && playlists.map(pl => (
              <div key={pl.id} className="group relative">
                <SidebarItem
                  label={pl.name}
                  icon={pl.isSmartPlaylist ? '🧠' : '📋'}
                  isSelected={library.selectedPlaylistId === pl.id}
                  onClick={() => selectPlaylist(pl.id)}
                  count={pl.isSmartPlaylist ? undefined : pl.trackIds.length}
                  color={pl.color}
                />
                {pl.isSmartPlaylist && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-blue-400 opacity-0 group-hover:opacity-100"
                    onClick={() => setSmartCratePlaylist(pl)}
                  >
                    ⚙
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Crates section */}
          <div className="mt-2">
            <div
              className="flex items-center justify-between px-3 py-1 cursor-pointer"
              onClick={() => toggleSection('crates')}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {expandedSections.crates ? '▼' : '▶'} Crates
              </span>
              <button
                className="text-gray-500 hover:text-gray-300 text-xs"
                onClick={e => { e.stopPropagation(); setCreatingType('crate'); }}
              >
                +
              </button>
            </div>
            {expandedSections.crates && crates.map(cr => (
              <SidebarItem
                key={cr.id}
                label={cr.name}
                icon="📦"
                isSelected={library.selectedCrateId === cr.id}
                onClick={() => selectCrate(cr.id)}
                count={cr.trackIds.length}
                color={cr.color}
              />
            ))}
          </div>

          {/* New item input */}
          {creatingType && (
            <div className="px-2 py-1 flex gap-1">
              <input
                autoFocus
                className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none"
                placeholder={`New ${creatingType}…`}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleNewItem();
                  if (e.key === 'Escape') setCreatingType(null);
                }}
              />
              <button
                className="text-xs text-blue-400 hover:text-blue-300"
                onClick={handleNewItem}
              >
                OK
              </button>
            </div>
          )}
        </div>

        {/* Track table */}
        <div className="flex-1 overflow-auto min-w-0">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-800 z-10">
              <tr>
                <ColHeader label="Title" field="title" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="200px" />
                <ColHeader label="Artist" field="artist" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="140px" />
                <ColHeader label="Album" field="album" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="120px" />
                <ColHeader label="BPM" field="bpm" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="60px" />
                <ColHeader label="Key" field="key" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="60px" />
                <ColHeader label="Time" field="duration" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="55px" />
                <ColHeader label="Genre" field="energy" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="90px" />
                <ColHeader label="Year" field="dateAdded" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="50px" />
                <ColHeader label="Rating" field="rating" currentField={library.sort.field} direction={library.sort.direction} onSort={handleSort} width="80px" />
                <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-400 tracking-wide" style={{ width: '120px' }}>Comment</th>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-400 tracking-wide" style={{ width: '70px' }}>Energy</th>
              </tr>
            </thead>
            <tbody>
              {displayedTracks.map(track => (
                <TrackRow
                  key={track.id}
                  track={track}
                  isSelected={library.selectedTrackIds.includes(track.id)}
                  isCompatible={
                    masterDeck?.key && track.key
                      ? isCamelotCompatible(masterDeck.key.camelot, track.key.camelot)
                      : null
                  }
                  isDragging={false}
                  onSelect={(id, multi) => {
                    if (multi) {
                      selectTracks(
                        library.selectedTrackIds.includes(id)
                          ? library.selectedTrackIds.filter(i => i !== id)
                          : [...library.selectedTrackIds, id]
                      );
                    } else {
                      selectTracks([id]);
                      setPreviewTrack(track);
                    }
                  }}
                  onDoubleClick={t => loadTrackToDeck('A', t)}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onRatingChange={(id, rating) => updateTrack(id, { rating })}
                />
              ))}
              {displayedTracks.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No tracks found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Track preview panel */}
        {previewTrack && (
          <div className="w-52 flex-shrink-0 border-l border-gray-700 bg-gray-850 flex flex-col p-3 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preview</span>
              <button className="text-gray-500 hover:text-gray-300 text-sm" onClick={() => setPreviewTrack(null)}>✕</button>
            </div>
            {previewTrack.metadata.artworkDataUrl ? (
              <img
                src={previewTrack.metadata.artworkDataUrl}
                className="w-full aspect-square rounded object-cover"
                alt="artwork"
              />
            ) : (
              <div className="w-full aspect-square rounded bg-gray-700 flex items-center justify-center text-4xl">
                🎵
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-white truncate">{previewTrack.metadata.title}</div>
              <div className="text-xs text-gray-400 truncate">{previewTrack.metadata.artist}</div>
              <div className="text-xs text-gray-500 truncate">{previewTrack.metadata.album}</div>
            </div>
            <div className="flex gap-2 text-xs text-gray-400">
              {previewTrack.bpm && <span>{previewTrack.bpm.toFixed(1)} BPM</span>}
              {previewTrack.key && <KeyBadge camelot={previewTrack.key.camelot} />}
            </div>
            <StarRating value={previewTrack.rating} readonly />
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
              <span>Duration</span><span className="text-right">{formatDuration(previewTrack.duration)}</span>
              <span>Plays</span><span className="text-right">{previewTrack.playCount}</span>
              {previewTrack.energy !== null && (
                <>
                  <span>Energy</span>
                  <span className="text-right">{((previewTrack.energy ?? 0) * 100).toFixed(0)}%</span>
                </>
              )}
            </div>
            <div className="flex gap-1 mt-auto">
              {(['A', 'B'] as DeckId[]).map(id => (
                <button
                  key={id}
                  className="flex-1 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs"
                  onClick={() => loadTrackToDeck(id, previewTrack)}
                >
                  Deck {id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onLoadToDeck={handleLoadToDeck}
          onAddToPlaylist={handleAddToPlaylist}
          onAnalyze={() => {
            contextMenu.trackIds.forEach(id => updateTrack(id, { analysisStatus: 'pending' }));
          }}
          onEditTags={() => {
            const track = library.tracks[contextMenu.trackIds[0]];
            if (track) setEditTagsTrack(track);
          }}
          onRevealInFinder={() => {
            const track = library.tracks[contextMenu.trackIds[0]];
            if (track && window.electronAPI) {
              (window as unknown as { electronAPI: { revealFile: (p: string) => void } }).electronAPI.revealFile(track.filePath);
            }
          }}
          onRemove={() => contextMenu.trackIds.forEach(removeTrack)}
          playlists={playlists}
        />
      )}

      {/* Edit tags modal */}
      {editTagsTrack && (
        <EditTagsModal
          track={editTagsTrack}
          onClose={() => setEditTagsTrack(null)}
          onSave={updates => {
            const { rating, ...metaUpdates } = updates;
            updateTrack(editTagsTrack.id, {
              rating,
              metadata: { ...editTagsTrack.metadata, ...metaUpdates },
            });
          }}
        />
      )}

      {/* Smart crate editor modal */}
      {smartCratePlaylist && (
        <SmartCrateEditor
          playlist={smartCratePlaylist}
          onClose={() => setSmartCratePlaylist(null)}
          onSave={filters => updatePlaylist(smartCratePlaylist.id, { smartFilters: filters })}
        />
      )}
    </div>
  );
};

export default LibraryBrowser;
