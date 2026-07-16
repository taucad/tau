//! Codec benchmark surface for the spike harnesses: times each encoder over
//! one rendered frame and fingerprints outputs (FNV-1a 64) so the
//! byte-identity invariant can be checked across artifacts without shipping
//! images around.

use crate::{
    ImageFormat, Projection, RenderError, RenderOptions, RenderView, Rendered, encode,
    render_glb_to_image, render_glb_to_images_profiled,
};
use glam::{Mat4, Vec3};

/// FNV-1a 64 — enough to compare artifacts for equality across legs.
pub fn fnv64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn codec_fingerprints(rendered: &Rendered) -> Result<serde_json::Value, RenderError> {
    let mut report = serde_json::json!({
        "pixelFnv": format!("{:016x}", fnv64(&rendered.rgba)),
    });
    for (name, format) in [
        ("png", ImageFormat::Png),
        ("webp", ImageFormat::WebP),
        ("jpeg", ImageFormat::Jpeg { quality: 85 }),
    ] {
        let bytes = encode(rendered, format)?;
        report[name] = serde_json::json!({
            "bytes": bytes.len(),
            "fnv": format!("{:016x}", fnv64(&bytes)),
        });
    }
    Ok(report)
}

/// GPU-independent codec fixtures used to prove native/wasm byte parity.
pub fn codec_conformance() -> Result<serde_json::Value, RenderError> {
    let (width, height) = (320u32, 240u32);
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        for x in 0..width {
            rgba.extend_from_slice(&[
                ((x * 17 + y * 31) & 255) as u8,
                ((x * 7 + y * 43 + (x ^ y)) & 255) as u8,
                ((x * 53 + y * 11) & 255) as u8,
                255,
            ]);
        }
    }
    let base = Rendered {
        rgba,
        width,
        height,
    };
    let mut with_axes = Rendered {
        rgba: base.rgba.clone(),
        width,
        height,
    };
    let eye = Vec3::new(3.0, 2.0, 4.0);
    let forward = (-eye).normalize();
    crate::axis_indicator::stamp_axis_indicator(
        &mut with_axes,
        crate::render::CameraState {
            projection: Mat4::IDENTITY,
            view: glam::camera::rh::view::look_at_mat4(eye, Vec3::ZERO, Vec3::Y),
            forward,
        },
        Projection::Perspective,
        &mut Vec::new(),
    );
    Ok(serde_json::json!({
        "width": width,
        "height": height,
        "base": codec_fingerprints(&base)?,
        "withAxes": codec_fingerprints(&with_axes)?,
    }))
}

/// Compare six separate renders with one six-view batch, with and without axes.
pub async fn bench_multi_view(
    glb: &[u8],
    width: u32,
    height: u32,
    now: &dyn Fn() -> f64,
) -> Result<serde_json::Value, RenderError> {
    let views = [
        RenderView {
            id: "isometric".into(),
            phi_deg: 60.0,
            theta_deg: -45.0,
        },
        RenderView {
            id: "front".into(),
            phi_deg: 90.0,
            theta_deg: 0.0,
        },
        RenderView {
            id: "back".into(),
            phi_deg: 90.0,
            theta_deg: 180.0,
        },
        RenderView {
            id: "right".into(),
            phi_deg: 90.0,
            theta_deg: 90.0,
        },
        RenderView {
            id: "top".into(),
            phi_deg: 0.0,
            theta_deg: 0.0,
        },
        RenderView {
            id: "bottom".into(),
            phi_deg: 180.0,
            theta_deg: 0.0,
        },
    ];
    let mut variants = Vec::new();
    for include_axes in [false, true] {
        let options = RenderOptions {
            width,
            height,
            background: Some([1.0, 1.0, 1.0, 1.0]),
            include_axes,
            ..Default::default()
        };
        let singular_started = now();
        let mut singular = Vec::with_capacity(views.len());
        let mut singular_ms = Vec::with_capacity(views.len());
        for view in &views {
            let mut view_options = options.clone();
            view_options.phi_deg = view.phi_deg;
            view_options.theta_deg = view.theta_deg;
            let started = now();
            let bytes = render_glb_to_image(glb, &view_options, ImageFormat::WebP).await?;
            singular_ms.push(now() - started);
            singular.push(bytes);
        }
        let singular_wall_ms = now() - singular_started;

        let batch_started = now();
        let (batch, profile) =
            render_glb_to_images_profiled(glb, &options, ImageFormat::WebP, &views, now).await?;
        let batch_wall_ms = now() - batch_started;
        if batch != singular {
            return Err(RenderError::Encode(
                "batch benchmark outputs differ from singular bytes".into(),
            ));
        }
        let fingerprints: Vec<String> = batch
            .iter()
            .map(|bytes| format!("{:016x}", fnv64(bytes)))
            .collect();
        variants.push(serde_json::json!({
            "includeAxes": include_axes,
            "singular": {
                "wallMs": singular_wall_ms,
                "viewMs": singular_ms,
                "glbParses": views.len(),
                "renderSessions": views.len(),
            },
            "batch": {
                "wallMs": batch_wall_ms,
                "profile": profile,
            },
            "fingerprints": fingerprints,
        }));
    }
    Ok(serde_json::json!({
        "width": width,
        "height": height,
        "viewCount": views.len(),
        "variants": variants,
    }))
}

/// Time PNG / WebP / JPEG(q85) encodes of `rendered`, repeating each until
/// 250 ms or 20 reps have elapsed and averaging. `now` supplies milliseconds
/// (`Instant` on native, `Date.now` in wasm — `std::time::Instant` panics on
/// wasm32-unknown-unknown).
pub fn bench_encodes(
    rendered: &Rendered,
    now: &dyn Fn() -> f64,
) -> Result<serde_json::Value, RenderError> {
    let mut report = serde_json::json!({
        "width": rendered.width,
        "height": rendered.height,
        "pixelFnv": format!("{:016x}", fnv64(&rendered.rgba)),
    });
    for (name, format) in [
        ("png", ImageFormat::Png),
        ("webp", ImageFormat::WebP),
        ("jpeg", ImageFormat::Jpeg { quality: 85 }),
    ] {
        let start = now();
        let bytes = encode(rendered, format)?;
        let mut reps = 1u32;
        while now() - start < 250.0 && reps < 20 {
            encode(rendered, format)?;
            reps += 1;
        }
        let ms = (now() - start) / f64::from(reps);
        report[name] = serde_json::json!({
            "ms": (ms * 100.0).round() / 100.0,
            "bytes": bytes.len(),
            "fnv": format!("{:016x}", fnv64(&bytes)),
        });
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benches_all_codecs_deterministically() {
        let (width, height) = (4u32, 4u32);
        let mut rgba = Vec::new();
        for y in 0..height {
            for x in 0..width {
                rgba.extend_from_slice(&[(x * 60) as u8, (y * 60) as u8, 128, 255]);
            }
        }
        let rendered = Rendered {
            rgba,
            width,
            height,
        };
        let clock = std::cell::Cell::new(0.0f64);
        let now = move || {
            clock.set(clock.get() + 100.0);
            clock.get()
        };
        let report = bench_encodes(&rendered, &now).expect("bench");
        assert_eq!(report["width"], serde_json::json!(4));
        for name in ["png", "webp", "jpeg"] {
            assert!(report[name]["ms"].as_f64().expect("ms") > 0.0);
            assert!(report[name]["bytes"].as_u64().expect("bytes") > 0);
            let format = ImageFormat::from_name(name, 85).expect("format");
            let expected = format!(
                "{:016x}",
                fnv64(&encode(&rendered, format).expect("encode"))
            );
            assert_eq!(report[name]["fnv"], serde_json::json!(expected));
        }
    }

    #[test]
    fn fixed_codec_fixtures_are_deterministic() {
        let first = codec_conformance().expect("conformance");
        let second = codec_conformance().expect("conformance");
        assert_eq!(first, second);
        assert_ne!(first["base"]["pixelFnv"], first["withAxes"]["pixelFnv"]);
        for fixture in ["base", "withAxes"] {
            for codec in ["png", "webp", "jpeg"] {
                assert_eq!(
                    first[fixture][codec]["fnv"].as_str().map(str::len),
                    Some(16)
                );
            }
        }
    }
}
