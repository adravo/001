-- ─────────────────────────────────────────────────────────────────────────────
-- DJ Nexus Pro — SQLite Database Schema
-- All timestamps are stored as INTEGER Unix milliseconds.
-- All JSON blobs use TEXT with check constraints to ensure valid JSON.
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -32000;  -- 32 MB page cache
PRAGMA temp_store = MEMORY;

-- ── Tracks ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracks (
  id                TEXT PRIMARY KEY,
  file_path         TEXT NOT NULL UNIQUE,
  file_size         INTEGER NOT NULL DEFAULT 0,
  file_hash         TEXT NOT NULL DEFAULT '',
  duration          REAL NOT NULL DEFAULT 0,
  sample_rate       INTEGER NOT NULL DEFAULT 44100,
  bitrate           INTEGER NOT NULL DEFAULT 0,
  channels          INTEGER NOT NULL DEFAULT 2,
  codec             TEXT NOT NULL DEFAULT '',

  -- Metadata
  title             TEXT NOT NULL DEFAULT '',
  artist            TEXT NOT NULL DEFAULT '',
  album             TEXT NOT NULL DEFAULT '',
  album_artist      TEXT NOT NULL DEFAULT '',
  genre             TEXT NOT NULL DEFAULT '',
  year              INTEGER,
  track_number      INTEGER,
  disc_number       INTEGER,
  comment           TEXT NOT NULL DEFAULT '',
  composer          TEXT NOT NULL DEFAULT '',
  label             TEXT NOT NULL DEFAULT '',
  isrc              TEXT NOT NULL DEFAULT '',
  artwork_data_url  TEXT,

  -- Analysis results
  bpm               REAL,
  key_note          TEXT,
  key_scale         TEXT CHECK (key_scale IN ('major', 'minor') OR key_scale IS NULL),
  key_camelot       TEXT,
  key_open_key      TEXT,
  energy            REAL CHECK (energy IS NULL OR (energy >= 0 AND energy <= 1)),
  loudness          REAL,

  -- User data
  play_count        INTEGER NOT NULL DEFAULT 0,
  last_played_at    INTEGER,
  date_added        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  analysis_status   TEXT NOT NULL DEFAULT 'pending'
                      CHECK (analysis_status IN ('pending', 'analyzing', 'complete', 'failed')),
  analysis_error    TEXT,
  color             TEXT,
  rating            INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist   ON tracks (artist);
CREATE INDEX IF NOT EXISTS idx_tracks_bpm      ON tracks (bpm);
CREATE INDEX IF NOT EXISTS idx_tracks_key      ON tracks (key_camelot);
CREATE INDEX IF NOT EXISTS idx_tracks_added    ON tracks (date_added);
CREATE INDEX IF NOT EXISTS idx_tracks_played   ON tracks (last_played_at);
CREATE INDEX IF NOT EXISTS idx_tracks_hash     ON tracks (file_hash);
CREATE INDEX IF NOT EXISTS idx_tracks_analysis ON tracks (analysis_status);

-- Full-text search virtual table for library searching
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  id UNINDEXED,
  title,
  artist,
  album,
  album_artist,
  genre,
  composer,
  label,
  comment,
  content='tracks',
  content_rowid='rowid'
);

-- Keep FTS in sync
CREATE TRIGGER IF NOT EXISTS tracks_fts_insert AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, id, title, artist, album, album_artist, genre, composer, label, comment)
  VALUES (new.rowid, new.id, new.title, new.artist, new.album, new.album_artist, new.genre, new.composer, new.label, new.comment);
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_delete AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, id, title, artist, album, album_artist, genre, composer, label, comment)
  VALUES ('delete', old.rowid, old.id, old.title, old.artist, old.album, old.album_artist, old.genre, old.composer, old.label, old.comment);
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_update AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, id, title, artist, album, album_artist, genre, composer, label, comment)
  VALUES ('delete', old.rowid, old.id, old.title, old.artist, old.album, old.album_artist, old.genre, old.composer, old.label, old.comment);
  INSERT INTO tracks_fts(rowid, id, title, artist, album, album_artist, genre, composer, label, comment)
  VALUES (new.rowid, new.id, new.title, new.artist, new.album, new.album_artist, new.genre, new.composer, new.label, new.comment);
END;

-- ── Tags ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#666688'
);

CREATE TABLE IF NOT EXISTS track_tags (
  track_id  TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  tag_id    TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_track_tags_tag ON track_tags (tag_id);

-- ── Waveforms ─────────────────────────────────────────────────────────────────
-- Waveform peak data is stored as compressed binary blobs to keep the DB lean.

CREATE TABLE IF NOT EXISTS waveforms (
  track_id          TEXT PRIMARY KEY REFERENCES tracks (id) ON DELETE CASCADE,
  peaks_data        BLOB NOT NULL,        -- gzip-compressed Float32Array
  rms_data          BLOB NOT NULL,        -- gzip-compressed Float32Array
  samples_per_pixel INTEGER NOT NULL,
  sample_rate       INTEGER NOT NULL,
  duration          REAL NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- ── Beat grids ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beat_grids (
  id               TEXT PRIMARY KEY,
  track_id         TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  bpm              REAL NOT NULL,
  offset           REAL NOT NULL,
  algorithm        TEXT NOT NULL DEFAULT 'autocorrelation'
                     CHECK (algorithm IN ('autocorrelation', 'onset', 'manual', 'imported')),
  confidence       REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  is_manually_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_manually_edited IN (0, 1)),
  markers_json     TEXT NOT NULL DEFAULT '[]',
  last_analyzed    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE (track_id)
);

-- ── Cue points ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cue_points (
  id         TEXT PRIMARY KEY,
  track_id   TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  slot       INTEGER,                    -- NULL for non-hot-cues
  type       TEXT NOT NULL DEFAULT 'hot_cue'
               CHECK (type IN ('hot_cue', 'loop_in', 'loop_out', 'fade_in', 'fade_out', 'load', 'grid')),
  position   REAL NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT '#ff4444',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_cue_points_track ON cue_points (track_id);

-- ── Saved loops ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_loops (
  id         TEXT PRIMARY KEY,
  track_id   TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  in_point   REAL NOT NULL,
  out_point  REAL NOT NULL,
  bar_size   REAL NOT NULL DEFAULT 1,
  label      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_saved_loops_track ON saved_loops (track_id);

-- ── Playlists ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playlists (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  is_smart         INTEGER NOT NULL DEFAULT 0 CHECK (is_smart IN (0, 1)),
  smart_filters    TEXT,                -- JSON blob, only for smart playlists
  color            TEXT,
  icon             TEXT,
  parent_id        TEXT REFERENCES playlists (id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id  TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  track_id     TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  added_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks (playlist_id, position);

-- ── Crates ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS crate_tracks (
  crate_id  TEXT NOT NULL REFERENCES crates (id) ON DELETE CASCADE,
  track_id  TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  added_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (crate_id, track_id)
);

-- ── Watched folders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watched_folders (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  auto_import INTEGER NOT NULL DEFAULT 1 CHECK (auto_import IN (0, 1)),
  last_scan   INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- ── Play history ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS history (
  id          TEXT PRIMARY KEY,
  track_id    TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  deck_id     TEXT NOT NULL CHECK (deck_id IN ('A', 'B', 'C', 'D')),
  played_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  set_id      TEXT REFERENCES sets (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_history_track   ON history (track_id);
CREATE INDEX IF NOT EXISTS idx_history_played  ON history (played_at);
CREATE INDEX IF NOT EXISTS idx_history_set     ON history (set_id);

-- ── Sets ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  started_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  ended_at    INTEGER,
  recording_path TEXT
);

-- ── Recordings ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  set_id      TEXT REFERENCES sets (id) ON DELETE SET NULL,
  file_path   TEXT NOT NULL,
  format      TEXT NOT NULL CHECK (format IN ('wav', 'mp3', 'flac', 'aac')),
  sample_rate INTEGER NOT NULL DEFAULT 44100,
  bit_depth   INTEGER NOT NULL DEFAULT 24,
  started_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  file_size   INTEGER NOT NULL DEFAULT 0,
  tracklist   TEXT NOT NULL DEFAULT '[]'  -- JSON array of {trackId, startTime}
);

-- ── MIDI mappings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS midi_mappings (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL DEFAULT '',
  device_name  TEXT NOT NULL DEFAULT '',
  device_id    TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL CHECK (message_type IN ('note_on', 'note_off', 'control_change', 'pitch_bend', 'program_change')),
  channel      INTEGER NOT NULL DEFAULT 0 CHECK (channel BETWEEN 0 AND 15),
  note         INTEGER CHECK (note IS NULL OR note BETWEEN 0 AND 127),
  controller   INTEGER CHECK (controller IS NULL OR controller BETWEEN 0 AND 127),
  action_json  TEXT NOT NULL,             -- JSON MidiMappingAction
  scale_min    REAL NOT NULL DEFAULT 0,
  scale_max    REAL NOT NULL DEFAULT 1,
  is_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1))
);

-- ── Settings ──────────────────────────────────────────────────────────────────
-- Key-value store; large blobs (e.g. custom skins) are stored separately.

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('audio.outputDevice',     '"default"'),
  ('audio.sampleRate',       '44100'),
  ('audio.bufferSize',       '512'),
  ('audio.bitDepth',         '24'),
  ('theme',                  '"dark"'),
  ('language',               '"en"'),
  ('quantiseDefault',        'true'),
  ('autoAnalyse',            'true'),
  ('deckCount',              '2'),
  ('waveformStyle',          '"mirrored"'),
  ('recordingFormat',        '"wav"'),
  ('schemaVersion',          '"1.0.0"');

-- ── Stem cache ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stem_cache (
  track_id       TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  stem_type      TEXT NOT NULL CHECK (stem_type IN ('vocals', 'drums', 'bass', 'other', 'melody')),
  file_path      TEXT NOT NULL,
  model_version  TEXT NOT NULL,
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (track_id, stem_type)
);

-- ── Schema version ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  description TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO schema_migrations (version, description) VALUES
  ('1.0.0', 'Initial schema');
