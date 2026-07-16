//! napi-rs surface for the Node artifact (Metal / Vulkan / DX12; lavapipe and
//! WARP in CI). Synchronous: a thumbnail render is fast enough to block, and
//! napi-rs wraps calls in catch_unwind so a core panic surfaces as a JS error
//! instead of aborting the host process.

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Render a kernel GLB to encoded image bytes. `options_json` is the shared
/// render-request contract (`render_core::RenderRequest`): width/height,
/// format `"png" | "webp" | "jpeg" | "jpg"`, quality 0..=1, phi/theta degrees,
/// margin 0..=0.5, up `"x" | "y" | "z"`, background `[r, g, b, a]` in 0..=1.
#[napi]
pub fn render_glb_to_image(glb: Uint8Array, options_json: String) -> Result<Buffer> {
    pollster::block_on(render_core::render_glb_request(&glb, &options_json))
        .map(Into::into)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Render ordered identified views through one batch-scoped render session.
#[napi]
pub fn render_glb_to_images(glb: Uint8Array, options_json: String) -> Result<Vec<Buffer>> {
    pollster::block_on(render_core::render_glb_images_request(&glb, &options_json))
        .map(|images| images.into_iter().map(Into::into).collect())
        .map_err(|error| Error::from_reason(error.to_string()))
}

/// Benchmark the codec encoders over one render (white background so JPEG
/// participates): JSON report with per-format avg ms / bytes / FNV-1a
/// fingerprints for cross-artifact byte-identity checks.
#[napi]
pub fn bench_codecs(glb: Uint8Array, width: u32, height: u32) -> Result<String> {
    let options = render_core::RenderOptions {
        width,
        height,
        background: Some([1.0, 1.0, 1.0, 1.0]),
        ..Default::default()
    };
    let started = std::time::Instant::now();
    let rendered = pollster::block_on(render_core::render_glb_to_rgba(&glb, &options))
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let render_ms = started.elapsed().as_secs_f64() * 1000.0;
    let epoch = std::time::Instant::now();
    let now = move || epoch.elapsed().as_secs_f64() * 1000.0;
    let mut report = render_core::bench_encodes(&rendered, &now)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    report["renderMs"] = ((render_ms * 100.0).round() / 100.0).into();
    Ok(report.to_string())
}

/// Compare six singular calls with one six-view batch.
#[napi]
pub fn bench_multi_view(glb: Uint8Array, width: u32, height: u32) -> Result<String> {
    let epoch = std::time::Instant::now();
    let now = move || epoch.elapsed().as_secs_f64() * 1000.0;
    pollster::block_on(render_core::bench_multi_view(&glb, width, height, &now))
        .map(|report| report.to_string())
        .map_err(|error| Error::from_reason(error.to_string()))
}

/// GPU-independent PNG/WebP/JPEG fingerprints for native/wasm conformance.
#[napi]
pub fn codec_conformance() -> Result<String> {
    render_core::codec_conformance()
        .map(|report| report.to_string())
        .map_err(|error| Error::from_reason(error.to_string()))
}

#[napi]
pub fn describe_adapter() -> Result<String> {
    pollster::block_on(render_core::describe_adapter())
        .map_err(|e| Error::from_reason(e.to_string()))
}
