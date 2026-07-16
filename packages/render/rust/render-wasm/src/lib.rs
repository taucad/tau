//! wasm-bindgen surface for the browser artifact. WebGPU-only, surface-less:
//! runs inside a plain dedicated worker with no canvas or OffscreenCanvas.

use wasm_bindgen::prelude::*;

/// Render a kernel GLB to encoded image bytes. `options_json` is the shared
/// render-request contract (`render_core::RenderRequest`): width/height,
/// format `"png" | "webp" | "jpeg" | "jpg"`, quality 0..=1, phi/theta degrees,
/// margin 0..=0.5, up `"x" | "y" | "z"`, background `[r, g, b, a]` in 0..=1.
#[wasm_bindgen]
pub async fn render_glb_to_image(glb: Vec<u8>, options_json: String) -> Result<Vec<u8>, JsError> {
    render_core::render_glb_request(&glb, &options_json)
        .await
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Render ordered identified views through one batch-scoped render session.
#[wasm_bindgen(skip_typescript)]
pub async fn render_glb_to_images(
    glb: Vec<u8>,
    options_json: String,
) -> Result<js_sys::Array, JsError> {
    let images = render_core::render_glb_images_request(&glb, &options_json)
        .await
        .map_err(|error| JsError::new(&error.to_string()))?;
    let result = js_sys::Array::new();
    for image in images {
        result.push(&js_sys::Uint8Array::from(image.as_slice()));
    }
    Ok(result)
}

#[wasm_bindgen(typescript_custom_section)]
const RENDER_GLB_TO_IMAGES_TYPES: &str = r#"
/** Render ordered identified views through one batch-scoped render session. */
export function render_glb_to_images(glb: Uint8Array, options_json: string): Promise<Array<Uint8Array>>;
"#;

/// Benchmark the codec encoders over one render (white background so JPEG
/// participates): JSON report with per-format avg ms / bytes / FNV-1a
/// fingerprints for cross-artifact byte-identity checks.
#[wasm_bindgen]
pub async fn bench_codecs(glb: Vec<u8>, width: u32, height: u32) -> Result<String, JsError> {
    let options = render_core::RenderOptions {
        width,
        height,
        background: Some([1.0, 1.0, 1.0, 1.0]),
        ..Default::default()
    };
    let start = js_sys::Date::now();
    let rendered = render_core::render_glb_to_rgba(&glb, &options)
        .await
        .map_err(|e| JsError::new(&e.to_string()))?;
    let render_ms = js_sys::Date::now() - start;
    let mut report = render_core::bench_encodes(&rendered, &js_sys::Date::now)
        .map_err(|e| JsError::new(&e.to_string()))?;
    report["renderMs"] = render_ms.round().into();
    Ok(report.to_string())
}

/// Compare six singular calls with one six-view batch.
#[wasm_bindgen]
pub async fn bench_multi_view(glb: Vec<u8>, width: u32, height: u32) -> Result<String, JsError> {
    render_core::bench_multi_view(&glb, width, height, &js_sys::Date::now)
        .await
        .map(|report| report.to_string())
        .map_err(|error| JsError::new(&error.to_string()))
}

/// GPU-independent PNG/WebP/JPEG fingerprints for native/wasm conformance.
#[wasm_bindgen]
pub fn codec_conformance() -> Result<String, JsError> {
    render_core::codec_conformance()
        .map(|report| report.to_string())
        .map_err(|error| JsError::new(&error.to_string()))
}

/// Backend + device name of the adapter the browser hands us.
#[wasm_bindgen]
pub async fn describe_adapter() -> Result<String, JsError> {
    render_core::describe_adapter()
        .await
        .map_err(|e| JsError::new(&e.to_string()))
}
