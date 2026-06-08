// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Linear interpolation resampler
// Used to bring decoded audio to the engine output sample rate.
// For production quality, replace with a sinc/polyphase filter; the linear
// interpolator is sufficient for offline transcoding and avoids a heavy dep.
// ─────────────────────────────────────────────────────────────────────────────

/// Resample interleaved stereo f32 from `src_sr` to `dst_sr`.
/// Returns a new interleaved stereo f32 buffer.
pub fn resample_stereo(input: &[f32], src_sr: u32, dst_sr: u32) -> Vec<f32> {
    if src_sr == dst_sr {
        return input.to_vec();
    }

    let src_frames = input.len() / 2;
    let ratio = src_sr as f64 / dst_sr as f64;
    let dst_frames = (src_frames as f64 / ratio) as usize;

    let mut output = Vec::with_capacity(dst_frames * 2);

    for i in 0..dst_frames {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f64;

        let (l0, r0) = stereo_at(input, src_idx);
        let (l1, r1) = stereo_at(input, (src_idx + 1).min(src_frames - 1));

        output.push(lerp(l0, l1, frac as f32));
        output.push(lerp(r0, r1, frac as f32));
    }

    output
}

#[inline]
fn stereo_at(buf: &[f32], frame: usize) -> (f32, f32) {
    let idx = frame * 2;
    if idx + 1 < buf.len() {
        (buf[idx], buf[idx + 1])
    } else {
        (0.0, 0.0)
    }
}

#[inline]
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_identity() {
        let input: Vec<f32> = (0..200).map(|i| i as f32 / 200.0).collect();
        let output = resample_stereo(&input, 44_100, 44_100);
        assert_eq!(input, output);
    }

    #[test]
    fn resample_upsample_doubles_length() {
        // 100 stereo frames at 22 050 Hz → ~200 stereo frames at 44 100 Hz
        let input = vec![0.5f32; 200]; // 100 stereo frames
        let output = resample_stereo(&input, 22_050, 44_100);
        let expected = 200;
        assert!(
            output.len() >= expected - 4 && output.len() <= expected + 4,
            "got {}",
            output.len()
        );
    }

    #[test]
    fn resample_downsample_halves_length() {
        let input = vec![0.5f32; 400]; // 200 stereo frames at 44 100
        let output = resample_stereo(&input, 44_100, 22_050);
        assert!(
            output.len() >= 196 && output.len() <= 204,
            "got {}",
            output.len()
        );
    }
}
