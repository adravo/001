// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Database Layer
// Wraps better-sqlite3 with typed CRUD helpers for every domain entity.
// All public methods are synchronous (SQLite is sync in better-sqlite3).
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
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
  MidiMapping,
  MidiMessage,
  MidiMappingAction,
  DeckId,
  MusicalNote,
  ScaleType,
} from './db-types'; // re-exported subset of src/types for use in Node process

// ── DB row shapes (what SQLite returns) ───────────────────────────────────────

interface TrackRow {
  id: string;
  file_path: string;
  file_size: number;
  file_hash: string;
  duration: number;
  sample_rate: number;
  bitrate: number;
  channels: number;
  codec: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre: string;
  year: number | null;
  track_number: number | null;
  disc_number: number | null;
  comment: string;
  composer: string;
  label: string;
  isrc: string;
  artwork_data_url: string | null;
  bpm: number | null;
  key_note: string | null;
  key_scale: string | null;
  key_camelot: string | null;
  key_open_key: string | null;
  energy: number | null;
  loudness: number | null;
  play_count: number;
  last_played_at: number | null;
  date_added: number;
  analysis_status: string;
  analysis_error: string | null;
  color: string | null;
  rating: number;
}

interface BeatGridRow {
  id: string;
  track_id: string;
  bpm: number;
  offset: number;
  algorithm: string;
  confidence: number;
  is_manually_edited: number;
  markers_json: string;
  last_analyzed: number;
}

interface CuePointRow {
  id: string;
  track_id: string;
  slot: number | null;
  type: string;
  position: number;
  label: string;
  color: string;
  created_at: number;
}

interface SavedLoopRow {
  id: string;
  track_id: string;
  in_point: number;
  out_point: number;
  bar_size: number;
  label: string;
  created_at: number;
}

interface PlaylistRow {
  id: string;
  name: string;
  description: string;
  is_smart: number;
  smart_filters: string | null;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
}

interface CrateRow {
  id: string;
  name: string;
  description: string;
  color: string | null;
  created_at: number;
  updated_at: number;
}

interface HistoryRow {
  id: string;
  track_id: string;
  deck_id: string;
  played_at: number;
  duration_ms: number;
  set_id: string | null;
}

interface MidiMappingRow {
  id: string;
  label: string;
  device_name: string;
  device_id: string;
  message_type: string;
  channel: number;
  note: number | null;
  controller: number | null;
  action_json: string;
  scale_min: number;
  scale_max: number;
  is_enabled: number;
}

// ── Row → Domain mappers ──────────────────────────────────────────────────────

function rowToTrack(row: TrackRow, cues: CuePoint[], loops: Loop[], tags: string[]): Track {
  return {
    id: row.id,
    filePath: row.file_path,
    fileSize: row.file_size,
    fileHash: row.file_hash,
    duration: row.duration,
    sampleRate: row.sample_rate,
    bitrate: row.bitrate,
    channels: row.channels,
    codec: row.codec,
    metadata: {
      title: row.title,
      artist: row.artist,
      album: row.album,
      albumArtist: row.album_artist,
      genre: row.genre,
      year: row.year,
      trackNumber: row.track_number,
      discNumber: row.disc_number,
      comment: row.comment,
      composer: row.composer,
      label: row.label,
      isrc: row.isrc,
      artworkDataUrl: row.artwork_data_url,
    },
    bpm: row.bpm,
    key: row.key_note
      ? {
          note: row.key_note as MusicalNote,
          scale: (row.key_scale ?? 'major') as ScaleType,
          camelot: row.key_camelot ?? '',
          openKey: row.key_open_key ?? '',
        }
      : null,
    energy: row.energy,
    loudness: row.loudness,
    waveformData: null, // loaded on-demand
    beatGrid: null,     // loaded on-demand
    cuePoints: cues,
    savedLoops: loops,
    tags,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    dateAdded: row.date_added,
    analysisStatus: row.analysis_status as Track['analysisStatus'],
    analysisError: row.analysis_error,
    color: row.color,
    rating: row.rating as Track['rating'],
  };
}

function rowToBeatGrid(row: BeatGridRow): BeatGrid {
  return {
    trackId: row.track_id,
    bpm: row.bpm,
    offset: row.offset,
    algorithm: row.algorithm as BeatGrid['algorithm'],
    confidence: row.confidence,
    markers: JSON.parse(row.markers_json) as BeatMarker[],
    isManuallyEdited: row.is_manually_edited === 1,
    lastAnalyzed: row.last_analyzed,
  };
}

function rowToCuePoint(row: CuePointRow): CuePoint {
  return {
    id: row.id,
    trackId: row.track_id,
    slot: row.slot,
    type: row.type as CueType,
    position: row.position,
    label: row.label,
    color: row.color,
    createdAt: row.created_at,
  };
}

function rowToLoop(row: SavedLoopRow): Loop {
  return {
    id: row.id,
    trackId: row.track_id,
    inPoint: row.in_point,
    outPoint: row.out_point,
    barSize: row.bar_size,
    label: row.label,
    isActive: false,
  };
}

function rowToPlaylist(row: PlaylistRow, trackIds: string[]): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trackIds,
    isSmartPlaylist: row.is_smart === 1,
    smartFilters: row.smart_filters ? JSON.parse(row.smart_filters) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
  };
}

function rowToCrate(row: CrateRow, trackIds: string[]): Crate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trackIds,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Database class ────────────────────────────────────────────────────────────

export class DJDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined });

    this.applyPragmas();
    this.applySchema();
    this.runMigrations();
  }

  private applyPragmas() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -32000');
    this.db.pragma('temp_store = MEMORY');
  }

  private applySchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      // Execute each statement individually (better-sqlite3 does not support multi-statement exec via .run)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      for (const stmt of statements) {
        try {
          this.db.exec(stmt);
        } catch {
          // Ignore "already exists" errors from IF NOT EXISTS — anything else bubbles up
        }
      }
    }
  }

  private runMigrations() {
    const applied = this.db
      .prepare('SELECT version FROM schema_migrations')
      .all() as Array<{ version: string }>;
    const appliedSet = new Set(applied.map(r => r.version));

    const migrations: Array<{ version: string; description: string; up: () => void }> = [
      // Future migrations registered here
    ];

    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)'
    );

    for (const migration of migrations) {
      if (!appliedSet.has(migration.version)) {
        const run = this.db.transaction(() => {
          migration.up();
          insert.run(migration.version, migration.description);
        });
        run();
      }
    }
  }

  // ── Track CRUD ──────────────────────────────────────────────────────────────

  upsertTrack(track: Omit<Track, 'waveformData' | 'beatGrid' | 'cuePoints' | 'savedLoops' | 'tags'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO tracks (
        id, file_path, file_size, file_hash, duration, sample_rate, bitrate, channels, codec,
        title, artist, album, album_artist, genre, year, track_number, disc_number,
        comment, composer, label, isrc, artwork_data_url,
        bpm, key_note, key_scale, key_camelot, key_open_key, energy, loudness,
        play_count, last_played_at, date_added, analysis_status, analysis_error, color, rating
      ) VALUES (
        @id, @file_path, @file_size, @file_hash, @duration, @sample_rate, @bitrate, @channels, @codec,
        @title, @artist, @album, @album_artist, @genre, @year, @track_number, @disc_number,
        @comment, @composer, @label, @isrc, @artwork_data_url,
        @bpm, @key_note, @key_scale, @key_camelot, @key_open_key, @energy, @loudness,
        @play_count, @last_played_at, @date_added, @analysis_status, @analysis_error, @color, @rating
      )
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        file_size = excluded.file_size,
        file_hash = excluded.file_hash,
        duration = excluded.duration,
        sample_rate = excluded.sample_rate,
        bitrate = excluded.bitrate,
        channels = excluded.channels,
        codec = excluded.codec,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        album_artist = excluded.album_artist,
        genre = excluded.genre,
        year = excluded.year,
        track_number = excluded.track_number,
        disc_number = excluded.disc_number,
        comment = excluded.comment,
        composer = excluded.composer,
        label = excluded.label,
        isrc = excluded.isrc,
        artwork_data_url = excluded.artwork_data_url,
        bpm = excluded.bpm,
        key_note = excluded.key_note,
        key_scale = excluded.key_scale,
        key_camelot = excluded.key_camelot,
        key_open_key = excluded.key_open_key,
        energy = excluded.energy,
        loudness = excluded.loudness,
        analysis_status = excluded.analysis_status,
        analysis_error = excluded.analysis_error,
        color = excluded.color,
        rating = excluded.rating
    `);

    stmt.run({
      id: track.id,
      file_path: track.filePath,
      file_size: track.fileSize,
      file_hash: track.fileHash,
      duration: track.duration,
      sample_rate: track.sampleRate,
      bitrate: track.bitrate,
      channels: track.channels,
      codec: track.codec,
      title: track.metadata.title,
      artist: track.metadata.artist,
      album: track.metadata.album,
      album_artist: track.metadata.albumArtist,
      genre: track.metadata.genre,
      year: track.metadata.year,
      track_number: track.metadata.trackNumber,
      disc_number: track.metadata.discNumber,
      comment: track.metadata.comment,
      composer: track.metadata.composer,
      label: track.metadata.label,
      isrc: track.metadata.isrc,
      artwork_data_url: track.metadata.artworkDataUrl,
      bpm: track.bpm,
      key_note: track.key?.note ?? null,
      key_scale: track.key?.scale ?? null,
      key_camelot: track.key?.camelot ?? null,
      key_open_key: track.key?.openKey ?? null,
      energy: track.energy,
      loudness: track.loudness,
      play_count: track.playCount,
      last_played_at: track.lastPlayedAt,
      date_added: track.dateAdded,
      analysis_status: track.analysisStatus,
      analysis_error: track.analysisError,
      color: track.color,
      rating: track.rating,
    });
  }

  getTrack(trackId: string): Track | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as TrackRow | undefined;
    if (!row) return null;
    return rowToTrack(row, this.getCuePoints(trackId), this.getSavedLoops(trackId), this.getTrackTags(trackId));
  }

  getTrackByPath(filePath: string): Track | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath) as TrackRow | undefined;
    if (!row) return null;
    return rowToTrack(row, this.getCuePoints(row.id), this.getSavedLoops(row.id), this.getTrackTags(row.id));
  }

  getAllTracks(): Track[] {
    const rows = this.db.prepare('SELECT * FROM tracks ORDER BY artist, title').all() as TrackRow[];
    return rows.map(row =>
      rowToTrack(row, this.getCuePoints(row.id), this.getSavedLoops(row.id), this.getTrackTags(row.id))
    );
  }

  searchTracks(query: string, filter?: Partial<LibraryFilter>): Track[] {
    if (query.trim()) {
      // FTS search
      const ftsRows = this.db
        .prepare(`
          SELECT t.* FROM tracks t
          INNER JOIN tracks_fts f ON t.id = f.id
          WHERE tracks_fts MATCH ?
          ORDER BY rank
          LIMIT 500
        `)
        .all(query) as TrackRow[];
      return ftsRows.map(row =>
        rowToTrack(row, this.getCuePoints(row.id), this.getSavedLoops(row.id), this.getTrackTags(row.id))
      );
    }

    // Filter-only query
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.genre) { conditions.push('genre = ?'); params.push(filter.genre); }
    if (filter?.bpmMin != null) { conditions.push('bpm >= ?'); params.push(filter.bpmMin); }
    if (filter?.bpmMax != null) { conditions.push('bpm <= ?'); params.push(filter.bpmMax); }
    if (filter?.rating != null) { conditions.push('rating >= ?'); params.push(filter.rating); }
    if (filter?.energyMin != null) { conditions.push('energy >= ?'); params.push(filter.energyMin); }
    if (filter?.energyMax != null) { conditions.push('energy <= ?'); params.push(filter.energyMax); }
    if (filter?.key) { conditions.push('key_camelot = ?'); params.push(filter.key); }
    if (filter?.dateAddedAfter != null) { conditions.push('date_added >= ?'); params.push(filter.dateAddedAfter); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM tracks ${where} ORDER BY artist, title LIMIT 2000`).all(...params) as TrackRow[];
    return rows.map(row =>
      rowToTrack(row, this.getCuePoints(row.id), this.getSavedLoops(row.id), this.getTrackTags(row.id))
    );
  }

  updateTrackAnalysis(
    trackId: string,
    data: {
      bpm?: number | null;
      keyNote?: string | null;
      keyScale?: string | null;
      keyCamelot?: string | null;
      keyOpenKey?: string | null;
      energy?: number | null;
      loudness?: number | null;
      analysisStatus?: string;
      analysisError?: string | null;
    }
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.bpm !== undefined)            { fields.push('bpm = ?');             values.push(data.bpm); }
    if (data.keyNote !== undefined)        { fields.push('key_note = ?');         values.push(data.keyNote); }
    if (data.keyScale !== undefined)       { fields.push('key_scale = ?');        values.push(data.keyScale); }
    if (data.keyCamelot !== undefined)     { fields.push('key_camelot = ?');      values.push(data.keyCamelot); }
    if (data.keyOpenKey !== undefined)     { fields.push('key_open_key = ?');     values.push(data.keyOpenKey); }
    if (data.energy !== undefined)         { fields.push('energy = ?');           values.push(data.energy); }
    if (data.loudness !== undefined)       { fields.push('loudness = ?');         values.push(data.loudness); }
    if (data.analysisStatus !== undefined) { fields.push('analysis_status = ?'); values.push(data.analysisStatus); }
    if (data.analysisError !== undefined)  { fields.push('analysis_error = ?');  values.push(data.analysisError); }

    if (fields.length === 0) return;
    values.push(trackId);
    this.db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  incrementPlayCount(trackId: string): void {
    this.db
      .prepare('UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?')
      .run(Date.now(), trackId);
  }

  updateTrackMetadata(trackId: string, meta: Partial<TrackMetadata>): void {
    const map: Record<keyof TrackMetadata, string> = {
      title: 'title', artist: 'artist', album: 'album', albumArtist: 'album_artist',
      genre: 'genre', year: 'year', trackNumber: 'track_number', discNumber: 'disc_number',
      comment: 'comment', composer: 'composer', label: 'label', isrc: 'isrc',
      artworkDataUrl: 'artwork_data_url',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(map)) {
      if (key in meta) {
        fields.push(`${col} = ?`);
        values.push((meta as Record<string, unknown>)[key]);
      }
    }
    if (fields.length === 0) return;
    values.push(trackId);
    this.db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  updateTrackUserData(trackId: string, data: { color?: string | null; rating?: number }): void {
    if (data.color !== undefined && data.rating !== undefined) {
      this.db.prepare('UPDATE tracks SET color = ?, rating = ? WHERE id = ?').run(data.color, data.rating, trackId);
    } else if (data.color !== undefined) {
      this.db.prepare('UPDATE tracks SET color = ? WHERE id = ?').run(data.color, trackId);
    } else if (data.rating !== undefined) {
      this.db.prepare('UPDATE tracks SET rating = ? WHERE id = ?').run(data.rating, trackId);
    }
  }

  deleteTrack(trackId: string): void {
    this.db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
  }

  // ── Beat grid ───────────────────────────────────────────────────────────────

  upsertBeatGrid(grid: BeatGrid): void {
    this.db.prepare(`
      INSERT INTO beat_grids (id, track_id, bpm, offset, algorithm, confidence, is_manually_edited, markers_json, last_analyzed)
      VALUES (@id, @track_id, @bpm, @offset, @algorithm, @confidence, @is_manually_edited, @markers_json, @last_analyzed)
      ON CONFLICT(track_id) DO UPDATE SET
        bpm = excluded.bpm,
        offset = excluded.offset,
        algorithm = excluded.algorithm,
        confidence = excluded.confidence,
        is_manually_edited = excluded.is_manually_edited,
        markers_json = excluded.markers_json,
        last_analyzed = excluded.last_analyzed
    `).run({
      id: uuidv4(),
      track_id: grid.trackId,
      bpm: grid.bpm,
      offset: grid.offset,
      algorithm: grid.algorithm,
      confidence: grid.confidence,
      is_manually_edited: grid.isManuallyEdited ? 1 : 0,
      markers_json: JSON.stringify(grid.markers),
      last_analyzed: grid.lastAnalyzed,
    });
  }

  getBeatGrid(trackId: string): BeatGrid | null {
    const row = this.db.prepare('SELECT * FROM beat_grids WHERE track_id = ?').get(trackId) as BeatGridRow | undefined;
    return row ? rowToBeatGrid(row) : null;
  }

  // ── Waveform ────────────────────────────────────────────────────────────────

  upsertWaveform(trackId: string, peaks: Float32Array, rms: Float32Array, samplesPerPixel: number, sampleRate: number, duration: number): void {
    this.db.prepare(`
      INSERT INTO waveforms (track_id, peaks_data, rms_data, samples_per_pixel, sample_rate, duration)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        peaks_data = excluded.peaks_data,
        rms_data = excluded.rms_data,
        samples_per_pixel = excluded.samples_per_pixel,
        sample_rate = excluded.sample_rate,
        duration = excluded.duration
    `).run(trackId, Buffer.from(peaks.buffer), Buffer.from(rms.buffer), samplesPerPixel, sampleRate, duration);
  }

  getWaveform(trackId: string): WaveformData | null {
    const row = this.db.prepare('SELECT * FROM waveforms WHERE track_id = ?').get(trackId) as {
      peaks_data: Buffer; rms_data: Buffer; samples_per_pixel: number; sample_rate: number; duration: number;
    } | undefined;
    if (!row) return null;
    return {
      peaks: new Float32Array(row.peaks_data.buffer),
      rms: new Float32Array(row.rms_data.buffer),
      samplesPerPixel: row.samples_per_pixel,
      sampleRate: row.sample_rate,
      duration: row.duration,
    };
  }

  // ── Cue points ──────────────────────────────────────────────────────────────

  getCuePoints(trackId: string): CuePoint[] {
    const rows = this.db.prepare('SELECT * FROM cue_points WHERE track_id = ? ORDER BY position').all(trackId) as CuePointRow[];
    return rows.map(rowToCuePoint);
  }

  upsertCuePoint(cue: CuePoint): void {
    this.db.prepare(`
      INSERT INTO cue_points (id, track_id, slot, type, position, label, color, created_at)
      VALUES (@id, @track_id, @slot, @type, @position, @label, @color, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        slot = excluded.slot,
        type = excluded.type,
        position = excluded.position,
        label = excluded.label,
        color = excluded.color
    `).run({
      id: cue.id,
      track_id: cue.trackId,
      slot: cue.slot,
      type: cue.type,
      position: cue.position,
      label: cue.label,
      color: cue.color,
      created_at: cue.createdAt,
    });
  }

  deleteCuePoint(cueId: string): void {
    this.db.prepare('DELETE FROM cue_points WHERE id = ?').run(cueId);
  }

  // ── Saved loops ─────────────────────────────────────────────────────────────

  getSavedLoops(trackId: string): Loop[] {
    const rows = this.db.prepare('SELECT * FROM saved_loops WHERE track_id = ? ORDER BY in_point').all(trackId) as SavedLoopRow[];
    return rows.map(rowToLoop);
  }

  upsertLoop(loop: Loop): void {
    this.db.prepare(`
      INSERT INTO saved_loops (id, track_id, in_point, out_point, bar_size, label)
      VALUES (@id, @track_id, @in_point, @out_point, @bar_size, @label)
      ON CONFLICT(id) DO UPDATE SET
        in_point = excluded.in_point,
        out_point = excluded.out_point,
        bar_size = excluded.bar_size,
        label = excluded.label
    `).run({
      id: loop.id,
      track_id: loop.trackId,
      in_point: loop.inPoint,
      out_point: loop.outPoint,
      bar_size: loop.barSize,
      label: loop.label,
    });
  }

  deleteLoop(loopId: string): void {
    this.db.prepare('DELETE FROM saved_loops WHERE id = ?').run(loopId);
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  getTrackTags(trackId: string): string[] {
    const rows = this.db.prepare(`
      SELECT t.name FROM tags t
      INNER JOIN track_tags tt ON t.id = tt.tag_id
      WHERE tt.track_id = ?
      ORDER BY t.name
    `).all(trackId) as Array<{ name: string }>;
    return rows.map(r => r.name);
  }

  addTagToTrack(trackId: string, tagName: string): void {
    const tagId = uuidv4();
    this.db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').run(tagId, tagName);
    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(tagName) as { id: string };
    this.db.prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)').run(trackId, tag.id);
  }

  removeTagFromTrack(trackId: string, tagName: string): void {
    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(tagName) as { id: string } | undefined;
    if (tag) {
      this.db.prepare('DELETE FROM track_tags WHERE track_id = ? AND tag_id = ?').run(trackId, tag.id);
    }
  }

  getAllTags(): Array<{ id: string; name: string; color: string }> {
    return this.db.prepare('SELECT id, name, color FROM tags ORDER BY name').all() as Array<{ id: string; name: string; color: string }>;
  }

  // ── Playlists ───────────────────────────────────────────────────────────────

  getAllPlaylists(): Playlist[] {
    const rows = this.db.prepare('SELECT * FROM playlists ORDER BY name').all() as PlaylistRow[];
    return rows.map(row => {
      const trackIds = (this.db.prepare(`
        SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position
      `).all(row.id) as Array<{ track_id: string }>).map(r => r.track_id);
      return rowToPlaylist(row, trackIds);
    });
  }

  createPlaylist(playlist: Playlist): void {
    this.db.prepare(`
      INSERT INTO playlists (id, name, description, is_smart, smart_filters, color, icon, parent_id, created_at, updated_at)
      VALUES (@id, @name, @description, @is_smart, @smart_filters, @color, @icon, @parent_id, @created_at, @updated_at)
    `).run({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      is_smart: playlist.isSmartPlaylist ? 1 : 0,
      smart_filters: playlist.smartFilters ? JSON.stringify(playlist.smartFilters) : null,
      color: playlist.color,
      icon: playlist.icon,
      parent_id: playlist.parentId,
      created_at: playlist.createdAt,
      updated_at: playlist.updatedAt,
    });
  }

  updatePlaylist(playlistId: string, updates: { name?: string; description?: string; color?: string | null; parentId?: string | null }): void {
    const now = Date.now();
    if (updates.name !== undefined) this.db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(updates.name, now, playlistId);
    if (updates.description !== undefined) this.db.prepare('UPDATE playlists SET description = ?, updated_at = ? WHERE id = ?').run(updates.description, now, playlistId);
    if (updates.color !== undefined) this.db.prepare('UPDATE playlists SET color = ?, updated_at = ? WHERE id = ?').run(updates.color, now, playlistId);
  }

  addTrackToPlaylist(playlistId: string, trackId: string): void {
    const maxPos = this.db.prepare('SELECT MAX(position) as pos FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as { pos: number | null };
    const pos = (maxPos.pos ?? -1) + 1;
    this.db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(playlistId, trackId, pos);
  }

  removeTrackFromPlaylist(playlistId: string, trackId: string): void {
    this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
  }

  reorderPlaylistTrack(playlistId: string, trackId: string, newPosition: number): void {
    this.db.transaction(() => {
      const current = this.db.prepare('SELECT position FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').get(playlistId, trackId) as { position: number } | undefined;
      if (!current) return;
      const old = current.position;
      if (old < newPosition) {
        this.db.prepare('UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ? AND position <= ?').run(playlistId, old, newPosition);
      } else {
        this.db.prepare('UPDATE playlist_tracks SET position = position + 1 WHERE playlist_id = ? AND position >= ? AND position < ?').run(playlistId, newPosition, old);
      }
      this.db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?').run(newPosition, playlistId, trackId);
    })();
  }

  deletePlaylist(playlistId: string): void {
    this.db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
  }

  // ── Crates ──────────────────────────────────────────────────────────────────

  getAllCrates(): Crate[] {
    const rows = this.db.prepare('SELECT * FROM crates ORDER BY name').all() as CrateRow[];
    return rows.map(row => {
      const trackIds = (this.db.prepare('SELECT track_id FROM crate_tracks WHERE crate_id = ? ORDER BY added_at').all(row.id) as Array<{ track_id: string }>).map(r => r.track_id);
      return rowToCrate(row, trackIds);
    });
  }

  createCrate(crate: Crate): void {
    this.db.prepare('INSERT INTO crates (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(crate.id, crate.name, crate.description, crate.color, crate.createdAt, crate.updatedAt);
  }

  addTrackToCrate(crateId: string, trackId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO crate_tracks (crate_id, track_id) VALUES (?, ?)').run(crateId, trackId);
  }

  removeTrackFromCrate(crateId: string, trackId: string): void {
    this.db.prepare('DELETE FROM crate_tracks WHERE crate_id = ? AND track_id = ?').run(crateId, trackId);
  }

  deleteCrate(crateId: string): void {
    this.db.prepare('DELETE FROM crates WHERE id = ?').run(crateId);
  }

  // ── History ─────────────────────────────────────────────────────────────────

  addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): string {
    const id = uuidv4();
    this.db.prepare('INSERT INTO history (id, track_id, deck_id, played_at, duration_ms, set_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, entry.trackId, entry.deckId, entry.playedAt, entry.duration, entry.setId);
    return id;
  }

  getHistory(limit = 500, offset = 0): HistoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM history ORDER BY played_at DESC LIMIT ? OFFSET ?').all(limit, offset) as HistoryRow[];
    return rows.map(r => ({
      id: r.id,
      trackId: r.track_id,
      deckId: r.deck_id as DeckId,
      playedAt: r.played_at,
      duration: r.duration_ms,
      setId: r.set_id,
    }));
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  getSetting<T>(key: string, defaultValue: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), Date.now());
  }

  getAllSettings(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map(r => {
      try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, r.value]; }
    }));
  }

  // ── MIDI mappings ───────────────────────────────────────────────────────────

  getAllMidiMappings(): MidiMapping[] {
    const rows = this.db.prepare('SELECT * FROM midi_mappings ORDER BY label').all() as MidiMappingRow[];
    return rows.map(r => ({
      id: r.id,
      label: r.label,
      deviceName: r.device_name,
      deviceId: r.device_id,
      message: {
        type: r.message_type,
        channel: r.channel,
        note: r.note ?? undefined,
        controller: r.controller ?? undefined,
      } as MidiMessage,
      action: JSON.parse(r.action_json) as MidiMappingAction,
      scaleMin: r.scale_min,
      scaleMax: r.scale_max,
      isEnabled: r.is_enabled === 1,
    }));
  }

  upsertMidiMapping(mapping: MidiMapping): void {
    this.db.prepare(`
      INSERT INTO midi_mappings (id, label, device_name, device_id, message_type, channel, note, controller, action_json, scale_min, scale_max, is_enabled)
      VALUES (@id, @label, @device_name, @device_id, @message_type, @channel, @note, @controller, @action_json, @scale_min, @scale_max, @is_enabled)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        device_name = excluded.device_name,
        device_id = excluded.device_id,
        message_type = excluded.message_type,
        channel = excluded.channel,
        note = excluded.note,
        controller = excluded.controller,
        action_json = excluded.action_json,
        scale_min = excluded.scale_min,
        scale_max = excluded.scale_max,
        is_enabled = excluded.is_enabled
    `).run({
      id: mapping.id,
      label: mapping.label,
      device_name: mapping.deviceName,
      device_id: mapping.deviceId,
      message_type: mapping.message.type,
      channel: mapping.message.channel,
      note: mapping.message.note ?? null,
      controller: mapping.message.controller ?? null,
      action_json: JSON.stringify(mapping.action),
      scale_min: mapping.scaleMin,
      scale_max: mapping.scaleMax,
      is_enabled: mapping.isEnabled ? 1 : 0,
    });
  }

  deleteMidiMapping(mappingId: string): void {
    this.db.prepare('DELETE FROM midi_mappings WHERE id = ?').run(mappingId);
  }

  // ── Watched folders ─────────────────────────────────────────────────────────

  getWatchedFolders(): Array<{ id: string; path: string; autoImport: boolean; lastScan: number | null }> {
    const rows = this.db.prepare('SELECT * FROM watched_folders ORDER BY path').all() as Array<{
      id: string; path: string; auto_import: number; last_scan: number | null;
    }>;
    return rows.map(r => ({ id: r.id, path: r.path, autoImport: r.auto_import === 1, lastScan: r.last_scan }));
  }

  addWatchedFolder(folderPath: string): string {
    const id = uuidv4();
    this.db.prepare('INSERT OR IGNORE INTO watched_folders (id, path) VALUES (?, ?)').run(id, folderPath);
    const row = this.db.prepare('SELECT id FROM watched_folders WHERE path = ?').get(folderPath) as { id: string };
    return row.id;
  }

  removeWatchedFolder(folderPath: string): void {
    this.db.prepare('DELETE FROM watched_folders WHERE path = ?').run(folderPath);
  }

  updateFolderScanTime(folderPath: string): void {
    this.db.prepare('UPDATE watched_folders SET last_scan = ? WHERE path = ?').run(Date.now(), folderPath);
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /** Run a function inside a transaction; rolls back on any thrown error. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /** Vacuum and analyze to reclaim space and refresh query planner statistics. */
  optimize(): void {
    this.db.exec('PRAGMA optimize');
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
  }

  close(): void {
    this.db.close();
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let instance: DJDatabase | null = null;

export function getDatabase(dbPath?: string): DJDatabase {
  if (!instance) {
    if (!dbPath) throw new Error('Database path required for first initialization');
    instance = new DJDatabase(dbPath);
  }
  return instance;
}

export function closeDatabase(): void {
  instance?.close();
  instance = null;
}
