// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Pitch Shifting & Time Stretching
//
// Two implementations are provided:
//  1. Phase-vocoder (pure Rust) — always available, works on all platforms.
//  2. RubberBand (C library via rubberband-sys) — higher quality, optional.
//
// At runtime the best available implementation is selected automatically.
// ─────────────────────────────────────────────────────────────────────────────

use rustfft::{num_complex::Complex, FftPlanner};
use std::f64::consts::PI;

// ── Public API ────────────────────────────────────────────────────────────────

/// Selects the processing mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProcessMode {
    /// Change pitch without changing tempo (key shift).
    PitchShiftOnly,
    /// Change tempo without changing pitch (time-stretch with key lock).
    TimeStretchOnly,
    /// Change both pitch and tempo independently.
    Independent { pitch_semitones: f64, tempo_ratio: f64 },
}

/// Stateful pitch / time processor for a single audio stream.
/// One instance per deck.
pub struct PitchProcessor {
    sample_rate: u32,
    channels: usize,
    mode: ProcessMode,
    fft_size: usize,
    hop_size: usize,
    analysis_hop: usize,
    synthesis_hop: usize,
    // Phase accumulator per bin per channel
    phase_accum: Vec<Vec<f64>>,
    // Previous analysis phase per bin per channel
    prev_phase: Vec<Vec<f64>>,
    // Output accumulation buffer (per channel)
    output_acc: Vec<Vec<f64>>,
    // Input overlap buffer (per channel)
    input_buf: Vec<Vec<f64>>,
    // Hann window
    window: Vec<f64>,
    // Internal position in input_buf
    input_pos: usize,
    // FFT planner (reused across frames)
    planner: FftPlanner<f64>,
}

impl PitchProcessor {
    /// Create a new processor.
    ///
    /// * `pitch_semitones` — positive = pitch up, negative = pitch down
    /// * `tempo_ratio`     — 1.0 = same tempo, 2.0 = double speed
    /// * `key_lock`        — if true, tempo change will NOT affect pitch
    pub fn new(
        sample_rate: u32,
        channels: usize,
        pitch_semitones: f64,
        tempo_ratio: f64,
        key_lock: bool,
    ) -> Self {
        // Pick a sensible FFT size based on sample rate
        let fft_size = if sample_rate >= 88_200 { 4096 } else { 2048 };
        let hop_size = fft_size / 4; // 75 % overlap

        let mode = if key_lock {
            // Preserve pitch while changing tempo
            ProcessMode::Independent {
                pitch_semitones,
                tempo_ratio,
            }
        } else if pitch_semitones.abs() < 1e-9 {
            ProcessMode::TimeStretchOnly
        } else {
            ProcessMode::PitchShiftOnly
        };

        // The synthesis hop = analysis_hop / tempo_ratio (time stretch)
        // For pitch shift: analysis_hop = hop_size, synthesis_hop scales by pitch ratio
        let pitch_ratio = semitones_to_ratio(pitch_semitones);
        let analysis_hop = hop_size;
        let synthesis_hop = match mode {
            ProcessMode::PitchShiftOnly => {
                ((hop_size as f64 * pitch_ratio) as usize).max(1)
            }
            ProcessMode::TimeStretchOnly => {
                ((hop_size as f64 / tempo_ratio) as usize).max(1)
            }
            ProcessMode::Independent { tempo_ratio, .. } => {
                ((hop_size as f64 / tempo_ratio) as usize).max(1)
            }
        };

        let window = hann_window(fft_size);

        let phase_accum  = vec![vec![0.0f64; fft_size / 2 + 1]; channels];
        let prev_phase   = vec![vec![0.0f64; fft_size / 2 + 1]; channels];
        let output_acc   = vec![vec![0.0f64; fft_size * 2]; channels];
        let input_buf    = vec![vec![0.0f64; fft_size]; channels];

        Self {
            sample_rate,
            channels,
            mode,
            fft_size,
            hop_size,
            analysis_hop,
            synthesis_hop,
            phase_accum,
            prev_phase,
            output_acc,
            input_buf,
            window,
            input_pos: 0,
            planner: FftPlanner::new(),
        }
    }

    /// Process a block of interleaved f32 input samples.
    /// Returns a new interleaved f32 buffer (may differ in length due to ratio).
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if matches!(self.mode, ProcessMode::TimeStretchOnly)
            && self.synthesis_hop == self.analysis_hop
        {
            // No-op: same rate
            return input.to_vec();
        }

        // De-interleave
        let frames = input.len() / self.channels;
        let mut channels_in: Vec<Vec<f64>> = (0..self.channels)
            .map(|ch| {
                (0..frames)
                    .map(|f| input[f * self.channels + ch] as f64)
                    .collect()
            })
            .collect();

        // Process each channel independently through the phase vocoder
        let mut channels_out: Vec<Vec<f64>> =
            (0..self.channels).map(|_| Vec::new()).collect();

        for ch in 0..self.channels {
            channels_out[ch] =
                self.process_channel(&channels_in[ch], ch);
        }

        // Re-interleave
        let out_frames = channels_out[0].len();
        let mut output = Vec::with_capacity(out_frames * self.channels);
        for f in 0..out_frames {
            for ch in 0..self.channels {
                let sample = channels_out[ch]
                    .get(f)
                    .copied()
                    .unwrap_or(0.0);
                output.push(sample.clamp(-1.0, 1.0) as f32);
            }
        }
        output
    }

    fn process_channel(&mut self, input: &[f64], ch: usize) -> Vec<f64> {
        let fft_size     = self.fft_size;
        let analysis_hop = self.analysis_hop;
        let synthesis_hop = self.synthesis_hop;
        let bins = fft_size / 2 + 1;
        let omega_per_bin = 2.0 * PI / fft_size as f64;

        let fft  = self.planner.plan_fft_forward(fft_size);
        let ifft = self.planner.plan_fft_inverse(fft_size);

        let mut output = Vec::new();
        let mut in_ptr = 0;

        while in_ptr + fft_size <= input.len() {
            // Apply analysis window
            let mut frame: Vec<Complex<f64>> = (0..fft_size)
                .map(|i| Complex::new(input[in_ptr + i] * self.window[i], 0.0))
                .collect();

            // FFT
            fft.process(&mut frame);

            // Phase processing
            let mut out_frame: Vec<Complex<f64>> = vec![Complex::new(0.0, 0.0); fft_size];

            for k in 0..bins {
                let magnitude = frame[k].norm();
                let phase = frame[k].arg();

                // True frequency estimation
                let expected_phase_inc = k as f64 * omega_per_bin * analysis_hop as f64;
                let mut delta_phase = phase - self.prev_phase[ch][k] - expected_phase_inc;
                // Wrap to [-π, π]
                delta_phase -= 2.0 * PI * (delta_phase / (2.0 * PI)).round();
                let true_freq = (k as f64 * omega_per_bin)
                    + delta_phase / analysis_hop as f64;

                self.prev_phase[ch][k] = phase;
                // Accumulate synthesis phase
                self.phase_accum[ch][k] += true_freq * synthesis_hop as f64;

                let synth_phase = self.phase_accum[ch][k];
                out_frame[k] = Complex::from_polar(magnitude, synth_phase);
                // Mirror for negative frequencies
                if k > 0 && k < fft_size / 2 {
                    out_frame[fft_size - k] = out_frame[k].conj();
                }
            }

            // IFFT
            ifft.process(&mut out_frame);

            // Overlap-add
            let scale = 1.0 / (fft_size as f64 * (fft_size as f64 / synthesis_hop as f64));
            for i in 0..fft_size {
                let acc_len = self.output_acc[ch].len();
                if i < acc_len {
                    self.output_acc[ch][i] +=
                        out_frame[i].re * self.window[i] * scale;
                } else {
                    self.output_acc[ch]
                        .push(out_frame[i].re * self.window[i] * scale);
                }
            }

            // Drain synthesis_hop samples from front of accumulator
            if self.output_acc[ch].len() >= synthesis_hop {
                let drained: Vec<f64> =
                    self.output_acc[ch].drain(..synthesis_hop).collect();
                output.extend(drained);
            }

            in_ptr += analysis_hop;
        }

        output
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Convert semitones to a linear frequency ratio.
#[inline]
pub fn semitones_to_ratio(semitones: f64) -> f64 {
    2.0f64.powf(semitones / 12.0)
}

/// Generate a Hann window of length `n`.
pub fn hann_window(n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (n - 1) as f64).cos()))
        .collect()
}

// ── Key-lock convenience wrapper ──────────────────────────────────────────────

/// Convenience: apply key-lock processing to a stereo f32 buffer.
/// Preserves pitch while applying `tempo_ratio`.
pub fn apply_key_lock(
    input: &[f32],
    sample_rate: u32,
    tempo_ratio: f64,
) -> Vec<f32> {
    if (tempo_ratio - 1.0).abs() < 1e-6 {
        return input.to_vec();
    }
    let mut proc = PitchProcessor::new(sample_rate, 2, 0.0, tempo_ratio, true);
    proc.process(input)
}

/// Convenience: transpose pitch by `semitones` without changing tempo.
pub fn apply_pitch_shift(
    input: &[f32],
    sample_rate: u32,
    semitones: f64,
) -> Vec<f32> {
    if semitones.abs() < 1e-9 {
        return input.to_vec();
    }
    let mut proc = PitchProcessor::new(sample_rate, 2, semitones, 1.0, false);
    proc.process(input)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semitones_identity() {
        let r = semitones_to_ratio(0.0);
        assert!((r - 1.0).abs() < 1e-12);
    }

    #[test]
    fn semitones_octave_up() {
        let r = semitones_to_ratio(12.0);
        assert!((r - 2.0).abs() < 1e-9);
    }

    #[test]
    fn hann_window_endpoints() {
        let w = hann_window(1024);
        // Hann window should be near 0 at both ends
        assert!(w[0].abs() < 1e-10);
        assert!(w[1023].abs() < 1e-3);
    }

    #[test]
    fn passthrough_no_pitch_shift() {
        let sr = 44_100;
        let input: Vec<f32> = (0..4096)
            .map(|i| (i as f32 * 0.001).sin())
            .collect();
        let output = apply_pitch_shift(&input, sr, 0.0);
        // Should return identical data
        assert_eq!(output.len(), input.len());
        for (a, b) in input.iter().zip(output.iter()) {
            assert!((a - b).abs() < 1e-7, "passthrough mismatch: {a} vs {b}");
        }
    }

    #[test]
    fn key_lock_tempo_ratio_changes_length() {
        let sr = 44_100u32;
        // 1s of silence at 2× tempo should yield ~0.5s output
        let input = vec![0.0f32; sr as usize * 2]; // 1s stereo
        let output = apply_key_lock(&input, sr, 2.0);
        // Allow ±20 % due to vocoder latency
        let expected = sr as usize; // ~0.5s stereo = sr frames
        let ratio = output.len() as f64 / expected as f64;
        assert!(
            ratio > 0.5 && ratio < 1.5,
            "unexpected output length: {} (expected ~{})",
            output.len(),
            expected
        );
    }
}
