// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Waveform Analysis
//
// For each "column" (pixel) of the waveform overview we compute:
//   • RMS level
//   • Peak level
//   • Spectral energy in three bands: bass (< 250 Hz), mid (250–4 kHz), high
//   • An RGB colour from the spectral balance
//
// The FFT is computed once per block; band energies are derived from it.
// ─────────────────────────────────────────────────────────────────────────────

use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformColumn {
    /// RMS amplitude (0.0 – 1.0)
    pub rms: f32,
    /// Peak amplitude (0.0 – 1.0)
    pub peak: f32,
    /// Bass energy (0.0 – 1.0)
    pub bass: f32,
    /// Mid energy (0.0 – 1.0)
    pub mid: f32,
    /// High energy (0.0 – 1.0)
    pub high: f32,
    /// Red channel (0–255) — derived from spectral balance
    pub r: u8,
    /// Green channel (0–255)
    pub g: u8,
    /// Blue channel (0–255)
    pub b: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformAnalysis {
    pub columns: Vec<WaveformColumn>,
    pub sample_rate: u32,
    pub total_frames: u64,
    pub duration_seconds: f64,
    /// Peak amplitude across entire track (for normalisation in renderer)
    pub global_peak: f32,
    /// Average RMS across entire track
    pub global_rms: f32,
}

// ── Analysis ──────────────────────────────────────────────────────────────────

/// Analyse interleaved stereo f32 PCM and produce `width` waveform columns.
pub fn analyse(
    samples: &[f32],
    sample_rate: u32,
    width: usize,
    channels: usize,
) -> WaveformAnalysis {
    let channels = channels.max(1);
    let total_stereo = samples.len();
    let total_frames = total_stereo / channels;
    let duration_seconds = total_frames as f64 / sample_rate as f64;

    if total_frames == 0 || width == 0 {
        return WaveformAnalysis {
            columns: vec![],
            sample_rate,
            total_frames: 0,
            duration_seconds: 0.0,
            global_peak: 0.0,
            global_rms: 0.0,
        };
    }

    let frames_per_col = (total_frames / width).max(1);
    // Use a power-of-two FFT size that fits within frames_per_col, min 64
    let fft_size = prev_pow2(frames_per_col.max(64)).min(4096);

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    // Frequency bin boundaries
    let hz_per_bin = sample_rate as f32 / fft_size as f32;
    let bass_end  = (250.0 / hz_per_bin) as usize;
    let mid_end   = (4000.0 / hz_per_bin) as usize;
    let high_end  = fft_size / 2;

    let mut columns: Vec<WaveformColumn> = Vec::with_capacity(width);
    let mut global_peak = 0.0f32;
    let mut global_rms_acc = 0.0f64;

    for col in 0..width {
        let frame_start = col * frames_per_col;
        let frame_end = ((col + 1) * frames_per_col).min(total_frames);
        if frame_start >= total_frames {
            columns.push(silent_column());
            continue;
        }

        // Mono-mix the block
        let block: Vec<f32> = (frame_start..frame_end)
            .map(|f| {
                let idx = f * channels;
                if channels == 1 {
                    samples[idx]
                } else {
                    (samples[idx] + samples.get(idx + 1).copied().unwrap_or(0.0)) * 0.5
                }
            })
            .collect();

        // RMS + peak
        let (rms, peak) = rms_peak(&block);
        global_peak = global_peak.max(peak);
        global_rms_acc += rms as f64;

        // Spectral analysis via FFT on the block (zero-padded to fft_size)
        let mut fft_buf: Vec<Complex<f32>> = {
            let mut buf = vec![Complex::new(0.0f32, 0.0f32); fft_size];
            for (i, &s) in block.iter().take(fft_size).enumerate() {
                // Apply Hann window
                let w = 0.5
                    * (1.0
                        - (2.0 * std::f32::consts::PI * i as f32
                            / (fft_size - 1) as f32)
                            .cos());
                buf[i] = Complex::new(s * w, 0.0);
            }
            buf
        };

        fft.process(&mut fft_buf);

        // Band energies (sum of squared magnitudes, then sqrt)
        let bass  = band_energy(&fft_buf, 1,        bass_end.max(1));
        let mid   = band_energy(&fft_buf, bass_end,  mid_end.max(bass_end + 1));
        let high  = band_energy(&fft_buf, mid_end,   high_end.max(mid_end + 1));

        // Normalise band energies
        let max_band = bass.max(mid).max(high).max(1e-10);
        let bass_n  = (bass  / max_band).sqrt();
        let mid_n   = (mid   / max_band).sqrt();
        let high_n  = (high  / max_band).sqrt();

        // RGB colour: bass→blue, mid→green, high→red
        let r = (high_n * 255.0) as u8;
        let g = (mid_n  * 200.0) as u8;
        let b = (bass_n * 230.0) as u8;

        columns.push(WaveformColumn {
            rms,
            peak,
            bass: bass_n,
            mid: mid_n,
            high: high_n,
            r,
            g,
            b,
        });
    }

    let global_rms = (global_rms_acc / width as f64) as f32;

    WaveformAnalysis {
        columns,
        sample_rate,
        total_frames: total_frames as u64,
        duration_seconds,
        global_peak,
        global_rms,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

#[inline]
fn rms_peak(block: &[f32]) -> (f32, f32) {
    if block.is_empty() {
        return (0.0, 0.0);
    }
    let mut sum_sq = 0.0f64;
    let mut peak = 0.0f32;
    for &s in block {
        let abs = s.abs();
        sum_sq += (s as f64) * (s as f64);
        if abs > peak {
            peak = abs;
        }
    }
    let rms = (sum_sq / block.len() as f64).sqrt() as f32;
    (rms, peak)
}

#[inline]
fn band_energy(fft_buf: &[Complex<f32>], start: usize, end: usize) -> f32 {
    fft_buf[start..end.min(fft_buf.len())]
        .iter()
        .map(|c| c.norm_sqr())
        .sum::<f32>()
        .sqrt()
}

fn silent_column() -> WaveformColumn {
    WaveformColumn {
        rms: 0.0,
        peak: 0.0,
        bass: 0.0,
        mid: 0.0,
        high: 0.0,
        r: 20,
        g: 20,
        b: 20,
    }
}

/// Largest power of two ≤ n.
fn prev_pow2(n: usize) -> usize {
    if n == 0 {
        return 1;
    }
    let mut p = 1;
    while p * 2 <= n {
        p *= 2;
    }
    p
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_empty() {
        let result = analyse(&[], 44_100, 100, 2);
        assert!(result.columns.is_empty());
    }

    #[test]
    fn correct_column_count() {
        let sr = 44_100u32;
        let samples: Vec<f32> = (0..sr as usize * 2 * 2) // 2s stereo
            .map(|i| (i as f32 * 0.001).sin() * 0.5)
            .collect();
        let result = analyse(&samples, sr, 200, 2);
        assert_eq!(result.columns.len(), 200);
    }

    #[test]
    fn silence_rms_is_zero() {
        let sr = 44_100u32;
        let samples = vec![0.0f32; sr as usize * 2];
        let result = analyse(&samples, sr, 100, 2);
        for col in &result.columns {
            assert!(col.rms < 1e-7, "rms={}", col.rms);
            assert!(col.peak < 1e-7, "peak={}", col.peak);
        }
    }

    #[test]
    fn full_scale_sine_peak_near_one() {
        let sr = 44_100u32;
        let samples: Vec<f32> = (0..sr as usize * 2) // 1s stereo
            .map(|i| {
                let t = i as f32 / (sr as f32 * 2.0);
                (2.0 * std::f32::consts::PI * 440.0 * t).sin()
            })
            .collect();
        let result = analyse(&samples, sr, 10, 2);
        let max_peak = result.columns.iter().map(|c| c.peak).fold(0.0f32, f32::max);
        assert!(max_peak > 0.9, "peak={max_peak}");
    }
}
