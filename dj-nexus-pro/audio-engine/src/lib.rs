// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Rust Audio Engine (N-API bindings for Electron/Node.js)
// ─────────────────────────────────────────────────────────────────────────────
//
// Architecture:
//   • One global `EngineState` protected by a parking_lot::Mutex.
//   • Each logical "deck" owns a `Deck` struct.
//   • cpal output stream runs on its own OS thread, pulling interleaved f32
//     samples from per-deck ring buffers via crossbeam-channel.
//   • All N-API calls return immediately (no blocking on the JS thread);
//     heavy work (decode, waveform) is dispatched via tokio tasks.
// ─────────────────────────────────────────────────────────────────────────────

#![deny(clippy::all)]
#![allow(clippy::missing_safety_doc)]

mod decoder;
mod pitch_shift;
mod waveform;
mod resampler;

use std::sync::Arc;
use parking_lot::Mutex;
use crossbeam_channel::{bounded, Receiver, Sender};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Host, SampleFormat, Stream, StreamConfig,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};

pub use decoder::{DecodedTrack, TrackMetadata};
pub use waveform::WaveformAnalysis;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_DECKS: usize = 6;
const RING_BUFFER_FRAMES: usize = 65536; // ~1.5 s @ 44 100 Hz stereo
const TARGET_CHANNELS: usize = 2;

// ── Deck state ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum PlayState {
    Stopped,
    Playing,
    Paused,
    Cueing,
}

pub struct Deck {
    pub id: usize,
    pub track: Option<Arc<DecodedTrack>>,
    pub play_state: PlayState,
    /// Current read position in frames (within the decoded PCM buffer)
    pub position_frames: usize,
    pub playback_rate: f64,
    pub pitch_semitones: f64,
    pub key_lock: bool,
    pub volume: f32,
    pub trim: f32,
    // Ring buffer send end — audio thread reads from the receive end
    pub sample_tx: Sender<Vec<f32>>,
    // Pitch-shift processor (lazily initialised)
    pub pitch_processor: Option<pitch_shift::PitchProcessor>,
}

impl Deck {
    fn new(id: usize, sample_tx: Sender<Vec<f32>>) -> Self {
        Self {
            id,
            track: None,
            play_state: PlayState::Stopped,
            position_frames: 0,
            playback_rate: 1.0,
            pitch_semitones: 0.0,
            key_lock: false,
            volume: 1.0,
            trim: 1.0,
            sample_tx,
            pitch_processor: None,
        }
    }
}

// ── Engine state ──────────────────────────────────────────────────────────────

struct EngineState {
    decks: Vec<Deck>,
    output_sample_rate: u32,
    output_channels: usize,
    // Keep the stream alive — dropping it stops audio
    _stream: Option<Stream>,
    running: bool,
}

impl EngineState {
    fn new() -> Self {
        let (decks, _rxs) = Self::make_decks(MAX_DECKS);
        Self {
            decks,
            output_sample_rate: 44_100,
            output_channels: TARGET_CHANNELS,
            _stream: None,
            running: false,
        }
    }

    fn make_decks(n: usize) -> (Vec<Deck>, Vec<Receiver<Vec<f32>>>) {
        let mut decks = Vec::with_capacity(n);
        let mut rxs = Vec::with_capacity(n);
        for i in 0..n {
            let (tx, rx) = bounded::<Vec<f32>>(32);
            decks.push(Deck::new(i, tx));
            rxs.push(rx);
        }
        (decks, rxs)
    }
}

// Global singleton guarded by a parking_lot Mutex
static ENGINE: once_cell::sync::Lazy<Arc<Mutex<EngineState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(EngineState::new())));

// We also need the receivers accessible from the audio callback —
// store them separately (set once at startEngine time).
static DECK_RECEIVERS: once_cell::sync::OnceCell<Vec<Arc<Mutex<Receiver<Vec<f32>>>>>> =
    once_cell::sync::OnceCell::new();

// ── Audio callback helpers ────────────────────────────────────────────────────

fn audio_callback(output: &mut [f32]) {
    // Zero out buffer first (silence on underrun)
    output.fill(0.0_f32);

    let state = ENGINE.lock();
    if !state.running {
        return;
    }

    let channels = state.output_channels;
    let frames = output.len() / channels;

    for deck in &state.decks {
        if deck.play_state != PlayState::Playing {
            continue;
        }
        let Some(track) = &deck.track else { continue };

        let pcm = &track.samples; // interleaved f32, already at output SR
        let start = deck.position_frames * channels;
        let end = (start + frames * channels).min(pcm.len());
        let avail = end.saturating_sub(start);

        let vol = deck.volume * deck.trim;
        for (i, sample) in pcm[start..start + avail].iter().enumerate() {
            output[i] += sample * vol;
        }
    }

    // Clamp to [-1, 1]
    for s in output.iter_mut() {
        *s = s.clamp(-1.0, 1.0);
    }
}

// Advance deck positions after each callback.
// We run this on a secondary thread that mirrors the audio callback period.
fn advance_positions(frames: usize) {
    let mut state = ENGINE.lock();
    let channels = state.output_channels;
    for deck in &mut state.decks {
        if deck.play_state != PlayState::Playing {
            continue;
        }
        let Some(track) = &deck.track else { continue };
        let new_pos = deck.position_frames + frames;
        if new_pos * channels >= track.samples.len() {
            deck.play_state = PlayState::Stopped;
            deck.position_frames = 0;
        } else {
            deck.position_frames = new_pos;
        }
    }
}

// ── N-API exports ─────────────────────────────────────────────────────────────

/// Start the audio engine and open the default output device.
#[napi]
pub fn start_engine() -> napi::Result<()> {
    env_logger::try_init().ok();
    info!("Starting DJ Nexus Pro audio engine");

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| napi::Error::from_reason("No output audio device found"))?;

    let supported_config = device
        .default_output_config()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    info!(
        "Output device: {} | SR: {} | CH: {} | fmt: {:?}",
        device.name().unwrap_or_default(),
        supported_config.sample_rate().0,
        supported_config.channels(),
        supported_config.sample_format()
    );

    let config = StreamConfig {
        channels: supported_config.channels(),
        sample_rate: supported_config.sample_rate(),
        buffer_size: cpal::BufferSize::Fixed(512),
    };

    let sr = config.sample_rate.0;
    let ch = config.channels as usize;

    // Update engine config before starting stream
    {
        let mut state = ENGINE.lock();
        state.output_sample_rate = sr;
        state.output_channels = ch;
        state.running = true;
    }

    // Build the output stream (f32 only; we convert internally if needed)
    let stream = match supported_config.sample_format() {
        SampleFormat::F32 => {
            device
                .build_output_stream(
                    &config,
                    move |data: &mut [f32], _| {
                        audio_callback(data);
                        advance_positions(data.len() / ch);
                    },
                    |err| error!("Audio stream error: {err}"),
                    None,
                )
                .map_err(|e| napi::Error::from_reason(e.to_string()))?
        }
        SampleFormat::I16 => {
            device
                .build_output_stream(
                    &config,
                    move |data: &mut [i16], _| {
                        let frames = data.len() / ch;
                        let mut buf = vec![0.0f32; data.len()];
                        audio_callback(&mut buf);
                        advance_positions(frames);
                        for (d, s) in data.iter_mut().zip(buf.iter()) {
                            *d = (*s * i16::MAX as f32) as i16;
                        }
                    },
                    |err| error!("Audio stream error: {err}"),
                    None,
                )
                .map_err(|e| napi::Error::from_reason(e.to_string()))?
        }
        SampleFormat::U16 => {
            device
                .build_output_stream(
                    &config,
                    move |data: &mut [u16], _| {
                        let frames = data.len() / ch;
                        let mut buf = vec![0.0f32; data.len()];
                        audio_callback(&mut buf);
                        advance_positions(frames);
                        for (d, s) in data.iter_mut().zip(buf.iter()) {
                            *d = ((*s + 1.0) * 0.5 * u16::MAX as f32) as u16;
                        }
                    },
                    |err| error!("Audio stream error: {err}"),
                    None,
                )
                .map_err(|e| napi::Error::from_reason(e.to_string()))?
        }
        f => return Err(napi::Error::from_reason(format!("Unsupported sample format: {f:?}"))),
    };

    stream
        .play()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    {
        let mut state = ENGINE.lock();
        state._stream = Some(stream);
    }

    info!("Audio engine started (SR={sr} CH={ch})");
    Ok(())
}

/// Stop the audio engine and close the output device.
#[napi]
pub fn stop_engine() -> napi::Result<()> {
    let mut state = ENGINE.lock();
    state.running = false;
    state._stream = None; // dropping the stream stops audio
    info!("Audio engine stopped");
    Ok(())
}

/// Load a track file into a deck (async — decodes in background).
/// Returns track metadata as JSON string.
#[napi]
pub async fn load_track(deck_id: u32, file_path: String) -> napi::Result<String> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }

    info!("Loading track into deck {deck_id}: {file_path}");

    // Get target sample rate from engine
    let target_sr = {
        let state = ENGINE.lock();
        state.output_sample_rate
    };

    // Decode on tokio thread pool (blocking)
    let path = file_path.clone();
    let decoded = tokio::task::spawn_blocking(move || {
        decoder::decode_file(&path, target_sr)
    })
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let meta = decoded.metadata.clone();
    let track_arc = Arc::new(decoded);

    {
        let mut state = ENGINE.lock();
        let deck = &mut state.decks[deck_idx];
        deck.track = Some(track_arc);
        deck.play_state = PlayState::Stopped;
        deck.position_frames = 0;
    }

    let json = serde_json::to_string(&meta)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Set deck playback state: "playing" | "paused" | "stopped" | "cueing"
#[napi]
pub fn set_playback(deck_id: u32, state_str: String) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let new_state = match state_str.as_str() {
        "playing" => PlayState::Playing,
        "paused"  => PlayState::Paused,
        "stopped" => PlayState::Stopped,
        "cueing"  => PlayState::Cueing,
        other => return Err(napi::Error::from_reason(format!("Unknown state: {other}"))),
    };
    let mut state = ENGINE.lock();
    state.decks[deck_idx].play_state = new_state;
    Ok(())
}

/// Set pitch offset in semitones (range: -24.0 .. +24.0)
#[napi]
pub fn set_pitch(deck_id: u32, semitones: f64) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let mut state = ENGINE.lock();
    let deck = &mut state.decks[deck_idx];
    deck.pitch_semitones = semitones.clamp(-24.0, 24.0);
    // Invalidate pitch processor so it is rebuilt on next audio callback
    deck.pitch_processor = None;
    Ok(())
}

/// Set deck volume (0.0 – 1.0)
#[napi]
pub fn set_volume(deck_id: u32, volume: f64) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let mut state = ENGINE.lock();
    state.decks[deck_idx].volume = (volume as f32).clamp(0.0, 2.0);
    Ok(())
}

/// Seek deck to position in seconds
#[napi]
pub fn seek_to(deck_id: u32, position_seconds: f64) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let mut state = ENGINE.lock();
    let sr = state.output_sample_rate as f64;
    let deck = &mut state.decks[deck_idx];
    let max_frames = deck
        .track
        .as_ref()
        .map(|t| t.samples.len() / state.output_channels)
        .unwrap_or(0);
    let target = ((position_seconds * sr) as usize).min(max_frames);
    deck.position_frames = target;
    Ok(())
}

/// Get current playback position in seconds
#[napi]
pub fn get_position(deck_id: u32) -> napi::Result<f64> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let state = ENGINE.lock();
    let sr = state.output_sample_rate as f64;
    let deck = &state.decks[deck_idx];
    Ok(deck.position_frames as f64 / sr)
}

/// Compute and return waveform analysis as a JSON string.
/// width: number of pixels (columns) for the waveform overview.
#[napi]
pub async fn get_waveform_data(deck_id: u32, width: u32) -> napi::Result<String> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }

    let track_arc = {
        let state = ENGINE.lock();
        state.decks[deck_idx].track.clone()
    };

    let track = track_arc
        .ok_or_else(|| napi::Error::from_reason("No track loaded in deck"))?;

    let w = width as usize;
    let analysis = tokio::task::spawn_blocking(move || {
        waveform::analyse(&track.samples, track.metadata.sample_rate, w, TARGET_CHANNELS)
    })
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    serde_json::to_string(&analysis)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// List available audio output devices as JSON array of names.
#[napi]
pub fn list_output_devices() -> napi::Result<String> {
    let host = cpal::default_host();
    let devices: Vec<String> = host
        .output_devices()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .filter_map(|d| d.name().ok())
        .collect();
    serde_json::to_string(&devices)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Set playback rate (tempo) for a deck. 1.0 = normal.
#[napi]
pub fn set_playback_rate(deck_id: u32, rate: f64) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let mut state = ENGINE.lock();
    state.decks[deck_idx].playback_rate = rate.clamp(0.25, 4.0);
    Ok(())
}

/// Enable / disable key lock for a deck.
#[napi]
pub fn set_key_lock(deck_id: u32, enabled: bool) -> napi::Result<()> {
    let deck_idx = deck_id as usize;
    if deck_idx >= MAX_DECKS {
        return Err(napi::Error::from_reason(format!("Invalid deck id: {deck_id}")));
    }
    let mut state = ENGINE.lock();
    state.decks[deck_idx].key_lock = enabled;
    Ok(())
}
