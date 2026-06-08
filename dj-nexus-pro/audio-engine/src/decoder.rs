// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Audio File Decoder
// Supports: MP3, WAV, FLAC, OGG Vorbis, AAC/M4A, AIFF via Symphonia
// ─────────────────────────────────────────────────────────────────────────────

use std::path::Path;
use serde::{Deserialize, Serialize};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::{DecoderOptions, CODEC_TYPE_NULL},
    errors::Error as SymphoniaError,
    formats::{FormatOptions, FormatReader, Track},
    io::{MediaSourceStream, MediaSourceStreamOptions},
    meta::{MetadataOptions, StandardTagKey},
    probe::Hint,
};
use log::{debug, info, warn};

// ── Public types ──────────────────────────────────────────────────────────────

/// Metadata extracted from an audio file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub comment: Option<String>,
    /// Beats per minute extracted from tag (if present)
    pub bpm: Option<f64>,
    /// Duration in seconds
    pub duration_seconds: f64,
    /// Original file sample rate
    pub sample_rate: u32,
    /// Number of audio channels in source file
    pub channels: u32,
    /// Total number of frames (samples per channel)
    pub total_frames: u64,
    /// Codec/format string (e.g. "MP3", "FLAC")
    pub format: String,
    /// Bit depth (if known)
    pub bit_depth: Option<u32>,
    /// Average bitrate kbps (if known)
    pub bitrate_kbps: Option<u32>,
}

/// A fully-decoded audio track with interleaved f32 PCM samples
/// resampled to the engine's output sample rate.
pub struct DecodedTrack {
    pub metadata: TrackMetadata,
    /// Interleaved f32 stereo samples at `output_sample_rate`.
    /// Length = total_output_frames * 2
    pub samples: Vec<f32>,
}

// ── Decode entry point ────────────────────────────────────────────────────────

pub fn decode_file(
    file_path: &str,
    target_sample_rate: u32,
) -> Result<DecodedTrack, Box<dyn std::error::Error + Send + Sync>> {
    info!("Decoding: {file_path}  target_sr={target_sample_rate}");

    let path = Path::new(file_path);
    let file = std::fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());

    // Build probe hint from file extension
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let meta_opts = MetadataOptions::default();
    let fmt_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };

    let mut probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    // Extract metadata tags
    let mut title: Option<String> = None;
    let mut artist: Option<String> = None;
    let mut album: Option<String> = None;
    let mut genre: Option<String> = None;
    let mut year: Option<u32> = None;
    let mut comment: Option<String> = None;
    let mut bpm: Option<f64> = None;

    // Check current metadata (embedded ID3v2 / Vorbis comment etc.)
    if let Some(metadata) = probed.format.metadata().current() {
        for tag in metadata.tags() {
            match tag.std_key {
                Some(StandardTagKey::TrackTitle)  => title   = Some(tag.value.to_string()),
                Some(StandardTagKey::Artist)      => artist  = Some(tag.value.to_string()),
                Some(StandardTagKey::Album)       => album   = Some(tag.value.to_string()),
                Some(StandardTagKey::Genre)       => genre   = Some(tag.value.to_string()),
                Some(StandardTagKey::Date)        => {
                    year = tag.value.to_string().parse::<u32>().ok()
                }
                Some(StandardTagKey::Comment)     => comment = Some(tag.value.to_string()),
                Some(StandardTagKey::Bpm)         => {
                    bpm = tag.value.to_string().parse::<f64>().ok()
                }
                _ => {}
            }
        }
    }

    // Find the first audio track
    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("No supported audio track found")?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let src_sample_rate = codec_params.sample_rate.unwrap_or(44_100);
    let src_channels = codec_params
        .channels
        .map(|c| c.count() as u32)
        .unwrap_or(2);
    let total_frames = codec_params.n_frames.unwrap_or(0);
    let duration_seconds = if total_frames > 0 && src_sample_rate > 0 {
        total_frames as f64 / src_sample_rate as f64
    } else {
        0.0
    };

    let format_str = format!("{:?}", codec_params.codec).to_uppercase();

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    // Pre-allocate estimated output buffer
    let estimated_output_frames = if duration_seconds > 0.0 {
        (duration_seconds * target_sample_rate as f64 * 1.05) as usize
    } else {
        src_sample_rate as usize * 600 // fallback: ~10 min
    };
    let mut pcm_f32: Vec<f32> = Vec::with_capacity(estimated_output_frames * 2);

    // Decode loop
    loop {
        let packet = match probed.format.next_packet() {
            Ok(p) => p,
            Err(SymphoniaError::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(e) => {
                warn!("Decode error (non-fatal): {e}");
                break;
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(audio_buf_ref) => {
                collect_samples(&audio_buf_ref, &mut pcm_f32, src_channels as usize);
            }
            Err(SymphoniaError::DecodeError(e)) => {
                warn!("Decode error (skipping packet): {e}");
                continue;
            }
            Err(e) => {
                warn!("Fatal decode error: {e}");
                break;
            }
        }
    }

    // Resample if necessary
    let final_samples = if src_sample_rate != target_sample_rate {
        debug!(
            "Resampling {} Hz → {} Hz ({} frames)",
            src_sample_rate,
            target_sample_rate,
            pcm_f32.len() / 2
        );
        crate::resampler::resample_stereo(
            &pcm_f32,
            src_sample_rate,
            target_sample_rate,
        )
    } else {
        pcm_f32
    };

    let output_frames = final_samples.len() / 2;
    let actual_duration = output_frames as f64 / target_sample_rate as f64;

    let metadata = TrackMetadata {
        file_path: file_path.to_string(),
        title,
        artist,
        album,
        genre,
        year,
        comment,
        bpm,
        duration_seconds: if actual_duration > 0.0 { actual_duration } else { duration_seconds },
        sample_rate: target_sample_rate, // report resampled SR
        channels: 2,
        total_frames: output_frames as u64,
        format: format_str,
        bit_depth: None,
        bitrate_kbps: None,
    };

    info!(
        "Decoded '{}' — {:.1}s, {} frames @ {}Hz",
        path.file_name().unwrap_or_default().to_string_lossy(),
        metadata.duration_seconds,
        output_frames,
        target_sample_rate
    );

    Ok(DecodedTrack {
        metadata,
        samples: final_samples,
    })
}

// ── Sample collection helpers ─────────────────────────────────────────────────

/// Convert any AudioBufferRef variant to interleaved f32 stereo and append
/// to `out`.
fn collect_samples(buf_ref: &AudioBufferRef<'_>, out: &mut Vec<f32>, src_ch: usize) {
    match buf_ref {
        AudioBufferRef::F32(buf) => {
            interleave_to_stereo_f32(
                buf.chan(0),
                if src_ch > 1 { buf.chan(1) } else { buf.chan(0) },
                out,
            );
        }
        AudioBufferRef::S16(buf) => {
            let ch0: Vec<f32> = buf.chan(0).iter().map(|&s| s as f32 / i16::MAX as f32).collect();
            let ch1: Vec<f32> = if src_ch > 1 {
                buf.chan(1).iter().map(|&s| s as f32 / i16::MAX as f32).collect()
            } else {
                ch0.clone()
            };
            interleave_to_stereo_f32(&ch0, &ch1, out);
        }
        AudioBufferRef::S24(buf) => {
            let norm = 1.0 / (1 << 23) as f32;
            let ch0: Vec<f32> = buf.chan(0).iter().map(|s| s.0 as f32 * norm).collect();
            let ch1: Vec<f32> = if src_ch > 1 {
                buf.chan(1).iter().map(|s| s.0 as f32 * norm).collect()
            } else {
                ch0.clone()
            };
            interleave_to_stereo_f32(&ch0, &ch1, out);
        }
        AudioBufferRef::S32(buf) => {
            let norm = 1.0 / i32::MAX as f32;
            let ch0: Vec<f32> = buf.chan(0).iter().map(|&s| s as f32 * norm).collect();
            let ch1: Vec<f32> = if src_ch > 1 {
                buf.chan(1).iter().map(|&s| s as f32 * norm).collect()
            } else {
                ch0.clone()
            };
            interleave_to_stereo_f32(&ch0, &ch1, out);
        }
        AudioBufferRef::U8(buf) => {
            let ch0: Vec<f32> = buf.chan(0).iter().map(|&s| (s as f32 - 128.0) / 128.0).collect();
            let ch1: Vec<f32> = if src_ch > 1 {
                buf.chan(1).iter().map(|&s| (s as f32 - 128.0) / 128.0).collect()
            } else {
                ch0.clone()
            };
            interleave_to_stereo_f32(&ch0, &ch1, out);
        }
        AudioBufferRef::F64(buf) => {
            let ch0: Vec<f32> = buf.chan(0).iter().map(|&s| s as f32).collect();
            let ch1: Vec<f32> = if src_ch > 1 {
                buf.chan(1).iter().map(|&s| s as f32).collect()
            } else {
                ch0.clone()
            };
            interleave_to_stereo_f32(&ch0, &ch1, out);
        }
        _ => {
            warn!("Unsupported buffer format — skipping packet");
        }
    }
}

#[inline]
fn interleave_to_stereo_f32(left: &[f32], right: &[f32], out: &mut Vec<f32>) {
    let frames = left.len().min(right.len());
    out.reserve(frames * 2);
    for i in 0..frames {
        out.push(left[i]);
        out.push(right[i]);
    }
}

// ── Streaming decoder (chunked for large files / real-time preview) ───────────

/// Iterator that yields decoded f32 stereo chunks from a file without loading
/// the entire file into memory.  Each chunk is `chunk_frames` frames long.
pub struct StreamingDecoder {
    format_reader: Box<dyn FormatReader>,
    decoder: Box<dyn symphonia::core::codecs::Decoder>,
    track_id: u32,
    src_channels: usize,
    pub src_sample_rate: u32,
    pub target_sample_rate: u32,
    chunk_frames: usize,
    leftover: Vec<f32>,
    eof: bool,
}

impl StreamingDecoder {
    pub fn new(
        file_path: &str,
        target_sample_rate: u32,
        chunk_frames: usize,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let path = Path::new(file_path);
        let file = std::fs::File::open(path)?;
        let mss = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let mut probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions { enable_gapless: true, ..Default::default() },
                &MetadataOptions::default(),
            )
            .map_err(|e| format!("Probe failed: {e}"))?;

        let track = probed
            .format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or("No audio track")?;

        let codec_params = track.codec_params.clone();
        let track_id = track.id;
        let src_channels = codec_params.channels.map(|c| c.count()).unwrap_or(2);
        let src_sample_rate = codec_params.sample_rate.unwrap_or(44_100);

        let decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())?;

        Ok(Self {
            format_reader: probed.format,
            decoder,
            track_id,
            src_channels,
            src_sample_rate,
            target_sample_rate,
            chunk_frames,
            leftover: Vec::new(),
            eof: false,
        })
    }
}

impl Iterator for StreamingDecoder {
    type Item = Vec<f32>; // interleaved stereo f32 at target_sample_rate

    fn next(&mut self) -> Option<Self::Item> {
        if self.eof && self.leftover.is_empty() {
            return None;
        }

        let target_len = self.chunk_frames * 2; // stereo

        while self.leftover.len() < target_len && !self.eof {
            let packet = match self.format_reader.next_packet() {
                Ok(p) => p,
                Err(_) => {
                    self.eof = true;
                    break;
                }
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            if let Ok(buf_ref) = self.decoder.decode(&packet) {
                collect_samples(&buf_ref, &mut self.leftover, self.src_channels);
            }
        }

        if self.leftover.is_empty() {
            return None;
        }

        let take = target_len.min(self.leftover.len());
        // round down to even (stereo pairs)
        let take = take & !1;
        let chunk: Vec<f32> = self.leftover.drain(..take).collect();

        // Resample chunk if needed
        let chunk = if self.src_sample_rate != self.target_sample_rate {
            crate::resampler::resample_stereo(
                &chunk,
                self.src_sample_rate,
                self.target_sample_rate,
            )
        } else {
            chunk
        };

        Some(chunk)
    }
}
