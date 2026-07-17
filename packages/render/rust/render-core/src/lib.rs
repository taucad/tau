//! GLB → image transcoder core: parses kernel-written GLB scenes and renders
//! them with wgpu (matcap surfaces + line edges) into RGBA/PNG bytes, with no
//! surface/canvas — works headless on native (Metal/Vulkan/DX12) and in the
//! browser via WebGPU.
//!
//! Blueprints:
//! - docs/research/render-multi-view-images-and-axis-indicator.md
//! - docs/research/render-capture-overlay-annotations.md

mod bench;
mod capture_overlay;
mod encode;
mod glb;
mod options;
mod render;

use glb::parse_glb;

pub use bench::{bench_encodes, bench_multi_view, codec_conformance};
pub use encode::{ImageFormat, encode, encode_jpeg, encode_png, encode_webp};
pub use options::{RenderImagesRequest, RenderRequest, RenderView};
pub use render::Rendered;

/// World axis the camera treats as "up" when placing the spherical eye and
/// fitting the view. Kernel-exported GLBs are standard Y-up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum UpAxis {
    X,
    #[default]
    Y,
    Z,
}

/// Camera projection used for the encoded image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Projection {
    #[default]
    Perspective,
    Orthographic,
}

/// Rendering options. Camera angles use a right-handed spherical basis.
#[derive(Debug, Clone)]
pub struct RenderOptions {
    pub width: u32,
    pub height: u32,
    /// Polar angle from the up axis, degrees.
    pub phi_deg: f32,
    /// Right-handed azimuth around the selected up axis, degrees.
    pub theta_deg: f32,
    /// Corner-fit zoom padding (0.9 = 10% margin).
    pub padding_factor: f32,
    /// Edge line width in pixels at the default 432 px output height; scales
    /// linearly with height so edges keep the same weight at any size.
    pub line_width: f32,
    /// World up axis for camera placement and view fitting.
    pub up: UpAxis,
    /// Perspective for ordinary thumbnails, orthographic for canonical views.
    pub projection: Projection,
    /// Background clear color as sRGB straight-alpha `[r, g, b, a]` in 0..=1;
    /// `None` renders on transparent. JPEG output requires an opaque one.
    pub background: Option<[f32; 4]>,
    /// Optional authored view label. It is drawn only when `include_label` is true.
    pub label: Option<String>,
    /// Whether to stamp the bottom-right XYZ orientation indicator.
    pub include_axes: bool,
    /// Whether to stamp the top-left view label.
    pub include_label: bool,
    /// Whether to stamp the bottom-left scale. Perspective labels identify
    /// the subject-center plane with `@ center`; orthographic scale is
    /// depth-invariant.
    pub include_scale: bool,
}

pub(crate) const DEFAULT_HEIGHT: u32 = 432;

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            width: 768,
            height: DEFAULT_HEIGHT,
            phi_deg: 60.0,
            theta_deg: -45.0,
            padding_factor: 0.9,
            line_width: 2.0,
            up: UpAxis::Y,
            projection: Projection::Perspective,
            background: None,
            label: None,
            include_axes: false,
            include_label: false,
            include_scale: false,
        }
    }
}

/// Failure taxonomy — the string prefixes are the stable contract surfaced to
/// the TS façade (`adapter-unavailable`, `gpu`, `parse`, `encode`).
#[derive(Debug)]
pub enum RenderError {
    Parse(String),
    AdapterUnavailable(String),
    Gpu(String),
    Encode(String),
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(m) => write!(f, "parse: {m}"),
            Self::AdapterUnavailable(m) => write!(f, "adapter-unavailable: {m}"),
            Self::Gpu(m) => write!(f, "gpu: {m}"),
            Self::Encode(m) => write!(f, "encode: {m}"),
        }
    }
}

impl std::error::Error for RenderError {}

/// Per-view timings recorded by the benchmark path.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderViewProfile {
    pub id: String,
    pub render_ms: f64,
    pub overlay_ms: f64,
    pub encode_ms: f64,
}

/// Batch setup/resource evidence recorded without changing the render path.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderBatchProfile {
    pub parse_ms: f64,
    pub setup_ms: f64,
    pub peak_readback_bytes: u64,
    pub glb_parses: u32,
    pub adapter_device_requests: u32,
    pub pipeline_sets: u32,
    pub matcap_uploads: u32,
    pub scene_uploads: u32,
    pub target_allocations: u32,
    pub views: Vec<RenderViewProfile>,
}

fn validate_options(options: &RenderOptions) -> Result<(), RenderError> {
    if !(options::MIN_DIMENSION..=options::MAX_DIMENSION).contains(&options.width)
        || !(options::MIN_DIMENSION..=options::MAX_DIMENSION).contains(&options.height)
    {
        return Err(RenderError::Parse(format!(
            "dimensions {}x{} outside {}..={}",
            options.width,
            options.height,
            options::MIN_DIMENSION,
            options::MAX_DIMENSION
        )));
    }
    if (options.include_axes || options.include_label || options.include_scale)
        && (options.width < options::ANNOTATED_MIN_DIMENSION
            || options.height < options::ANNOTATED_MIN_DIMENSION)
    {
        return Err(RenderError::Parse(format!(
            "annotated images must be at least {}x{}",
            options::ANNOTATED_MIN_DIMENSION,
            options::ANNOTATED_MIN_DIMENSION
        )));
    }
    if !options.phi_deg.is_finite() || !options.theta_deg.is_finite() {
        return Err(RenderError::Parse("camera angles must be finite".into()));
    }
    Ok(())
}

fn with_view(error: RenderError, id: &str) -> RenderError {
    if id.is_empty() {
        return error;
    }
    let context = |message: String| format!("view {id:?}: {message}");
    match error {
        RenderError::Parse(message) => RenderError::Parse(context(message)),
        RenderError::AdapterUnavailable(message) => {
            RenderError::AdapterUnavailable(context(message))
        }
        RenderError::Gpu(message) => RenderError::Gpu(context(message)),
        RenderError::Encode(message) => RenderError::Encode(context(message)),
    }
}

/// Render a kernel GLB to straight-alpha RGBA8 (sRGB-encoded) pixels.
pub async fn render_glb_to_rgba(
    glb: &[u8],
    options: &RenderOptions,
) -> Result<Rendered, RenderError> {
    validate_options(options)?;
    let scene = parse_glb(glb).map_err(RenderError::Parse)?;
    let prepared = capture_overlay::prepare_view(&scene, options)?;
    let session = render::RenderSession::new(&scene, options).await?;
    let mut rendered = session.render_view(prepared.camera, options).await?;
    if options.include_axes || options.include_label || options.include_scale {
        capture_overlay::stamp_capture_overlay(&mut rendered, &prepared, &mut Vec::new());
    }
    Ok(rendered)
}

/// Render a kernel GLB straight to encoded image bytes.
pub async fn render_glb_to_image(
    glb: &[u8],
    options: &RenderOptions,
    format: ImageFormat,
) -> Result<Vec<u8>, RenderError> {
    let view = RenderView {
        id: String::new(),
        label: options.label.clone(),
        phi_deg: options.phi_deg,
        theta_deg: options.theta_deg,
    };
    let mut images = render_glb_to_images(glb, options, format, &[view]).await?;
    Ok(images.remove(0))
}

/// Render ordered views while parsing and uploading the GLB only once.
pub async fn render_glb_to_images(
    glb: &[u8],
    options: &RenderOptions,
    format: ImageFormat,
    views: &[RenderView],
) -> Result<Vec<Vec<u8>>, RenderError> {
    render_glb_to_images_inner(glb, options, format, views, None)
        .await
        .map(|(images, _)| images)
}

/// Benchmark entry using the production batch path plus a caller-provided clock.
pub async fn render_glb_to_images_profiled(
    glb: &[u8],
    options: &RenderOptions,
    format: ImageFormat,
    views: &[RenderView],
    now: &dyn Fn() -> f64,
) -> Result<(Vec<Vec<u8>>, RenderBatchProfile), RenderError> {
    let (images, profile) =
        render_glb_to_images_inner(glb, options, format, views, Some(now)).await?;
    Ok((images, profile.expect("profile requested")))
}

async fn render_glb_to_images_inner(
    glb: &[u8],
    options: &RenderOptions,
    format: ImageFormat,
    views: &[RenderView],
    now: Option<&dyn Fn() -> f64>,
) -> Result<(Vec<Vec<u8>>, Option<RenderBatchProfile>), RenderError> {
    validate_options(options)?;
    if views.is_empty() {
        return Err(RenderError::Parse(
            "views must contain at least one view".into(),
        ));
    }
    let parse_started = now.map_or(0.0, |clock| clock());
    let scene = parse_glb(glb).map_err(RenderError::Parse)?;
    let parse_ms = now.map_or(0.0, |clock| clock() - parse_started);
    let setup_started = now.map_or(0.0, |clock| clock());
    let mut prepared = Vec::with_capacity(views.len());
    for view in views {
        let mut view_options = options.clone();
        view_options.phi_deg = view.phi_deg;
        view_options.theta_deg = view.theta_deg;
        view_options.label.clone_from(&view.label);
        validate_options(&view_options).map_err(|error| with_view(error, &view.id))?;
        prepared.push(
            capture_overlay::prepare_view(&scene, &view_options)
                .map_err(|error| with_view(error, &view.id))?,
        );
    }
    let session = render::RenderSession::new(&scene, options).await?;
    let setup_ms = now.map_or(0.0, |clock| clock() - setup_started);
    let mut images = Vec::with_capacity(views.len());
    let mut overlay_scratch = Vec::new();
    let mut view_profiles = Vec::with_capacity(if now.is_some() { views.len() } else { 0 });
    for (view, prepared_view) in views.iter().zip(prepared) {
        let mut view_options = options.clone();
        view_options.phi_deg = view.phi_deg;
        view_options.theta_deg = view.theta_deg;
        view_options.label.clone_from(&view.label);
        let render_started = now.map_or(0.0, |clock| clock());
        let mut rendered = session
            .render_view(prepared_view.camera, &view_options)
            .await
            .map_err(|error| with_view(error, &view.id))?;
        let render_ms = now.map_or(0.0, |clock| clock() - render_started);
        let overlay_started = now.map_or(0.0, |clock| clock());
        if view_options.include_axes || view_options.include_label || view_options.include_scale {
            capture_overlay::stamp_capture_overlay(
                &mut rendered,
                &prepared_view,
                &mut overlay_scratch,
            );
        }
        let overlay_ms = now.map_or(0.0, |clock| clock() - overlay_started);
        let encode_started = now.map_or(0.0, |clock| clock());
        images.push(encode(&rendered, format).map_err(|error| with_view(error, &view.id))?);
        if let Some(clock) = now {
            view_profiles.push(RenderViewProfile {
                id: view.id.clone(),
                render_ms,
                overlay_ms,
                encode_ms: clock() - encode_started,
            });
        }
    }
    let profile = now.map(|_| RenderBatchProfile {
        parse_ms,
        setup_ms,
        peak_readback_bytes: u64::from(options.width) * u64::from(options.height) * 4,
        glb_parses: 1,
        adapter_device_requests: 1,
        pipeline_sets: 1,
        matcap_uploads: 1,
        scene_uploads: 1,
        target_allocations: 1,
        views: view_profiles,
    });
    Ok((images, profile))
}

/// One-call surface for the wasm/napi bindings: parse the TS façade's JSON
/// render request (see [`RenderRequest`]), render, encode.
pub async fn render_glb_request(glb: &[u8], options_json: &str) -> Result<Vec<u8>, RenderError> {
    let (options, format) = RenderRequest::from_json(options_json)?.resolve()?;
    render_glb_to_image(glb, &options, format).await
}

/// Binding surface for an ordered plural request.
pub async fn render_glb_images_request(
    glb: &[u8],
    options_json: &str,
) -> Result<Vec<Vec<u8>>, RenderError> {
    let (options, format, views) = RenderImagesRequest::from_json(options_json)?.resolve()?;
    render_glb_to_images(glb, &options, format, &views).await
}

/// Report the adapter wgpu selects (backend + device name) — used by spike
/// harnesses and CI to assert the expected backend (Metal/lavapipe/WARP).
pub async fn describe_adapter() -> Result<String, RenderError> {
    let adapter = render::request_adapter().await?;
    let info = adapter.get_info();
    Ok(format!(
        "{:?} / {} ({:?})",
        info.backend, info.name, info.device_type
    ))
}
