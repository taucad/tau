//! Deterministic screen-space capture annotations stamped into readback RGBA.

use crate::glb::Scene;
use crate::render::{CameraState, Rendered, aabb_corners, camera_state};
use crate::{Projection, RenderError, RenderOptions};
use glam::{Vec2, Vec3, Vec4};

const X_COLOR: [u8; 4] = [255, 0, 0, 255];
const Y_COLOR: [u8; 4] = [0, 128, 0, 255];
const Z_COLOR: [u8; 4] = [37, 78, 136, 255];
const BLACK: [u8; 4] = [0, 0, 0, 255];
const WHITE: [u8; 4] = [255, 255, 255, 255];
const AXIS_COLORS: [[u8; 4]; 3] = [X_COLOR, Y_COLOR, Z_COLOR];
const AXES: [Vec3; 3] = [Vec3::X, Vec3::Y, Vec3::Z];
const ALIGNMENT_DOT: f32 = 0.965_925_8; // cos(15°)
const SUPERSAMPLE: u32 = 4;
const MARKER_RADIUS_RATIO: f32 = 0.065;
const MARKER_DOT_RATIO: f32 = 0.30;
const MARKER_CROSS_ARM_RATIO: f32 = 0.50;
const MARKER_CROSS_STROKE_RATIO: f32 = 0.012;
const VISIBLE_AXIS_LABEL_OFFSET_EM: f32 = 0.45;
const SCALE_FONT_RATIO: f32 = 0.82;
const SCALE_FONT_MIN_PX: f32 = 7.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl Rect {
    fn right(self) -> u32 {
        self.x + self.width
    }

    fn bottom(self) -> u32 {
        self.y + self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Alignment {
    axis: usize,
    camera_forward_positive: bool,
}

#[derive(Clone, Debug)]
struct OverlayLayout {
    label: Option<Rect>,
    scale: Option<Rect>,
    axes: Option<Rect>,
    inset: u32,
    guard: u32,
    font_px: f32,
}

pub(crate) struct PreparedView {
    pub(crate) camera: CameraState,
    layout: OverlayLayout,
    alignment: Option<Alignment>,
    label: Option<String>,
    scale_width_px: Option<f32>,
    scale_label: Option<String>,
    scale_font_px: Option<f32>,
    projection: Projection,
}

#[derive(Clone, Copy)]
pub(crate) struct Glyph {
    code: u32,
    offset: usize,
    width: usize,
    height: usize,
    xmin: i32,
    ymin: i32,
    advance: f32,
}

include!(concat!(env!("OUT_DIR"), "/capture_font.rs"));

pub(crate) fn prepare_view(
    scene: &Scene,
    options: &RenderOptions,
) -> Result<PreparedView, RenderError> {
    debug_assert_eq!(FONTDUE_VERSION, "0.9.3");
    debug_assert_ne!(FONT_GENERATOR_FNV, 0);
    debug_assert_ne!(FONT_SOURCE_FNV, 0);
    debug_assert_ne!(FONT_ATLAS_FNV, 0);
    let mut camera = camera_state(scene, options);
    let alignment = classify_alignment(camera.forward);
    let label = if options.include_label {
        let label = options.label.as_deref().ok_or_else(|| {
            RenderError::Parse("label is required when includeLabel is true".into())
        })?;
        Some(label.to_owned())
    } else {
        None
    };
    let mut layout = measure_layout(options, label.as_deref())?;
    camera = overlay_safe_camera(scene, options, camera, &layout)?;

    let (scale_width_px, scale_label, scale_font_px) = if let Some(rect) = layout.scale {
        let meters_per_pixel = meters_per_pixel(camera, options)?;
        let target_width = rect.width as f32 * 0.55;
        let (length, exponent) = nice_length(meters_per_pixel * target_width);
        let width = length / meters_per_pixel;
        let quantity = format_si(length, exponent);
        let label = match options.projection {
            Projection::Orthographic => quantity,
            Projection::Perspective => format!("{quantity} @ center"),
        };
        let preferred_font = layout.font_px * SCALE_FONT_RATIO;
        let available_width = rect.width as f32 * 0.8;
        let fitted_font = (available_width / measure_text(&label, 1.0)).min(preferred_font);
        if fitted_font < SCALE_FONT_MIN_PX {
            return Err(RenderError::Parse(
                "scale label does not fit the scale overlay".into(),
            ));
        }
        (Some(width), Some(label), Some(fitted_font))
    } else {
        (None, None, None)
    };

    // Layout is retained as one value so fitting and stamping cannot drift.
    layout.inset = layout.inset.max(1);
    Ok(PreparedView {
        camera,
        layout,
        alignment,
        label,
        scale_width_px,
        scale_label,
        scale_font_px,
        projection: options.projection,
    })
}

pub(crate) fn stamp_capture_overlay(
    rendered: &mut Rendered,
    prepared: &PreparedView,
    scratch: &mut Vec<u8>,
) {
    if let (Some(rect), Some(label)) = (prepared.layout.label, prepared.label.as_deref()) {
        draw_chip(rendered, scratch, rect, prepared.layout.font_px * 0.55);
        let text_width = measure_text(label, prepared.layout.font_px);
        let x = rect.x as f32 + (rect.width as f32 - text_width) * 0.5;
        let baseline = rect.y as f32 + rect.height as f32 * 0.67;
        draw_text(
            rendered,
            scratch,
            label,
            Vec2::new(x, baseline),
            prepared.layout.font_px,
            BLACK,
        );
    }
    if let (Some(rect), Some(width), Some(label), Some(font_px)) = (
        prepared.layout.scale,
        prepared.scale_width_px,
        prepared.scale_label.as_deref(),
        prepared.scale_font_px,
    ) {
        draw_chip(rendered, scratch, rect, prepared.layout.font_px * 0.55);
        let center_x = rect.x as f32 + rect.width as f32 * 0.5;
        let bar_y = rect.y as f32 + rect.height as f32 * 0.36;
        let left = center_x - width * 0.5;
        let right = center_x + width * 0.5;
        let stroke = (prepared.layout.font_px * 0.11).max(1.0);
        draw_segment(
            rendered,
            scratch,
            Vec2::new(left, bar_y),
            Vec2::new(right, bar_y),
            stroke,
            BLACK,
        );
        draw_segment(
            rendered,
            scratch,
            Vec2::new(left, bar_y - stroke * 2.0),
            Vec2::new(left, bar_y + stroke * 2.0),
            stroke,
            BLACK,
        );
        draw_segment(
            rendered,
            scratch,
            Vec2::new(right, bar_y - stroke * 2.0),
            Vec2::new(right, bar_y + stroke * 2.0),
            stroke,
            BLACK,
        );
        let text_width = measure_text(label, font_px);
        draw_text(
            rendered,
            scratch,
            label,
            Vec2::new(
                center_x - text_width * 0.5,
                rect.y as f32 + rect.height as f32 * 0.79,
            ),
            font_px,
            BLACK,
        );
    }
    if let Some(rect) = prepared.layout.axes {
        draw_axes(rendered, scratch, rect, prepared);
    }
}

fn classify_alignment(forward: Vec3) -> Option<Alignment> {
    AXES.into_iter().enumerate().find_map(|(axis, world_axis)| {
        let dot = forward.dot(world_axis);
        (dot.abs() >= ALIGNMENT_DOT).then_some(Alignment {
            axis,
            camera_forward_positive: dot >= 0.0,
        })
    })
}

fn axis_name(axis: usize) -> char {
    ['X', 'Y', 'Z'][axis]
}

fn measure_layout(
    options: &RenderOptions,
    label: Option<&str>,
) -> Result<OverlayLayout, RenderError> {
    let min_dimension = options.width.min(options.height) as f32;
    let inset = (min_dimension * 0.03).round().max(1.0) as u32;
    let guard = (min_dimension * 0.02).round().max(2.0) as u32;
    let font_px = (min_dimension * 0.025).round().max(12.0);
    let chip_height = (font_px * 2.15).ceil() as u32;
    let center_x = options.width / 2;

    let label_rect = label.map(|text| {
        let width = (measure_text(text, font_px) + font_px * 1.4).ceil() as u32;
        Rect {
            x: inset,
            y: inset,
            width,
            height: chip_height,
        }
    });
    if let Some(rect) = label_rect
        && rect.right().saturating_add(guard) >= center_x
    {
        return Err(RenderError::Parse(
            "label does not fit the top-left overlay slot".into(),
        ));
    }

    let scale_rect = options.include_scale.then(|| Rect {
        x: inset,
        y: options
            .height
            .saturating_sub(inset + (font_px * 3.0).ceil() as u32),
        width: ((min_dimension * 0.42).round() as u32).min(center_x.saturating_sub(inset + guard)),
        height: (font_px * 3.0).ceil() as u32,
    });
    let axes_side = (min_dimension * 0.18).round().max(16.0) as u32;
    let axes_rect = options.include_axes.then(|| Rect {
        x: options.width.saturating_sub(inset + axes_side),
        y: options.height.saturating_sub(inset + axes_side),
        width: axes_side,
        height: axes_side,
    });
    if let (Some(left), Some(right)) = (scale_rect, axes_rect)
        && left.right().saturating_add(guard) >= right.x
    {
        return Err(RenderError::Parse(
            "scale and axes overlays do not fit without overlap".into(),
        ));
    }
    Ok(OverlayLayout {
        label: label_rect,
        scale: scale_rect,
        axes: axes_rect,
        inset,
        guard,
        font_px,
    })
}

fn overlay_safe_camera(
    scene: &Scene,
    options: &RenderOptions,
    mut camera: CameraState,
    layout: &OverlayLayout,
) -> Result<CameraState, RenderError> {
    let overlays = [layout.label, layout.scale, layout.axes]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    if overlays.is_empty() {
        return Ok(camera);
    }
    let Some((min, max)) = scene.bounds else {
        return Ok(camera);
    };
    let envelope = projected_envelope(
        camera,
        min.into(),
        max.into(),
        options.width,
        options.height,
    )?;
    let center = Vec2::new(options.width as f32 * 0.5, options.height as f32 * 0.5);
    // Keep one device pixel beyond the declared guard so floating-point
    // projection at the exact analytical boundary cannot fail the final
    // strict intersection check on real scene bounds.
    let separation = layout.guard as f32 + 1.0;
    let mut scale = 1.0_f32;
    for overlay in overlays {
        if !intersects(envelope, overlay, layout.guard as f32) {
            continue;
        }
        let left = overlay.x < options.width / 2;
        let top = overlay.y < options.height / 2;
        let x_limit = if left {
            ratio(
                center.x - overlay.right() as f32 - separation,
                center.x - envelope.0,
            )
        } else {
            ratio(
                overlay.x as f32 - separation - center.x,
                envelope.2 - center.x,
            )
        };
        let y_limit = if top {
            ratio(
                center.y - overlay.bottom() as f32 - separation,
                center.y - envelope.1,
            )
        } else {
            ratio(
                overlay.y as f32 - separation - center.y,
                envelope.3 - center.y,
            )
        };
        scale = scale.min(x_limit.max(y_limit).clamp(0.001, 1.0));
    }
    camera.projection.x_axis.x *= scale;
    camera.projection.y_axis.y *= scale;
    let verified = projected_envelope(
        camera,
        min.into(),
        max.into(),
        options.width,
        options.height,
    )?;
    if [layout.label, layout.scale, layout.axes]
        .into_iter()
        .flatten()
        .any(|overlay| intersects(verified, overlay, layout.guard as f32))
    {
        return Err(RenderError::Parse(
            "overlay-safe camera fit could not separate the scene and annotations".into(),
        ));
    }
    Ok(camera)
}

fn ratio(numerator: f32, denominator: f32) -> f32 {
    if denominator <= 0.0 {
        1.0
    } else {
        numerator / denominator
    }
}

fn projected_envelope(
    camera: CameraState,
    min: Vec3,
    max: Vec3,
    width: u32,
    height: u32,
) -> Result<(f32, f32, f32, f32), RenderError> {
    let matrix = camera.projection * camera.view;
    let mut bounds = (
        f32::INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
    );
    for corner in aabb_corners(min, max) {
        let clip = matrix * Vec4::new(corner.x, corner.y, corner.z, 1.0);
        // Homogeneous W scales with world units; a small but normal value is
        // valid for sub-millimetre scenes. Only zero/subnormal W cannot be
        // divided safely.
        if !clip.is_finite() || clip.w.abs() < f32::MIN_POSITIVE {
            return Err(RenderError::Parse(
                "non-finite projected scene bounds".into(),
            ));
        }
        let ndc = clip.truncate() / clip.w;
        if !ndc.is_finite() {
            return Err(RenderError::Parse(
                "non-finite projected scene bounds".into(),
            ));
        }
        let x = (ndc.x * 0.5 + 0.5) * width as f32;
        let y = (0.5 - ndc.y * 0.5) * height as f32;
        bounds.0 = bounds.0.min(x);
        bounds.1 = bounds.1.min(y);
        bounds.2 = bounds.2.max(x);
        bounds.3 = bounds.3.max(y);
    }
    Ok(bounds)
}

fn intersects(envelope: (f32, f32, f32, f32), rect: Rect, guard: f32) -> bool {
    envelope.2 + guard > rect.x as f32
        && envelope.0 - guard < rect.right() as f32
        && envelope.3 + guard > rect.y as f32
        && envelope.1 - guard < rect.bottom() as f32
}

fn meters_per_pixel(camera: CameraState, options: &RenderOptions) -> Result<f32, RenderError> {
    let projection_scale = camera.projection.y_axis.y.abs();
    let value = match options.projection {
        Projection::Orthographic => 2.0 / (projection_scale * options.height as f32),
        Projection::Perspective => {
            2.0 * camera.target_depth / (projection_scale * options.height as f32)
        }
    };
    if !value.is_finite() || value <= 0.0 {
        return Err(RenderError::Parse("invalid subject-center scale".into()));
    }
    Ok(value)
}

fn nice_length(target: f32) -> (f32, i32) {
    let exponent = target.log10().floor() as i32;
    let power = 10.0_f32.powi(exponent);
    let mantissa = target / power;
    (
        (if mantissa < 10.0_f32.sqrt() { 1.0 } else { 5.0 }) * power,
        exponent,
    )
}

fn format_si(meters: f32, decimal_exponent: i32) -> String {
    let (value, unit, unit_exponent) = if meters < 0.001 {
        (meters * 1_000_000.0, "µm", 6)
    } else if meters < 1.0 {
        (meters * 1_000.0, "mm", 3)
    } else if meters < 1_000.0 {
        (meters, "m", 0)
    } else {
        (meters / 1_000.0, "km", -3)
    };
    let decimals = (-(decimal_exponent + unit_exponent)).max(0) as usize;
    let mut number = format!("{value:.decimals$}");
    if number.starts_with('-')
        && number[1..]
            .chars()
            .all(|character| character == '0' || character == '.')
    {
        number.remove(0);
    }
    format!("{number} {unit}")
}

fn glyph(character: char) -> &'static Glyph {
    FONT_GLYPHS
        .binary_search_by_key(&u32::from(character), |glyph| glyph.code)
        .ok()
        .map(|index| &FONT_GLYPHS[index])
        .expect("labels validated against generated repertoire")
}

fn measure_text(text: &str, size: f32) -> f32 {
    let scale = size / FONT_SOURCE_SIZE;
    text.chars()
        .map(|character| glyph(character).advance * scale)
        .sum()
}

fn text_bounds(text: &str, size: f32) -> (Vec2, Vec2) {
    let scale = size / FONT_SOURCE_SIZE;
    let mut cursor = 0.0_f32;
    let mut min = Vec2::splat(f32::INFINITY);
    let mut max = Vec2::splat(f32::NEG_INFINITY);
    for character in text.chars() {
        let glyph = glyph(character);
        if glyph.width != 0 && glyph.height != 0 {
            let left = (cursor + glyph.xmin as f32 * scale).floor();
            let top = (-(glyph.ymin + glyph.height as i32) as f32 * scale).floor();
            let right = left + (glyph.width as f32 * scale).ceil().max(1.0);
            let bottom = top + (glyph.height as f32 * scale).ceil().max(1.0);
            min = min.min(Vec2::new(left, top));
            max = max.max(Vec2::new(right, bottom));
        }
        cursor += glyph.advance * scale;
    }
    if min.x.is_finite() {
        (min, max)
    } else {
        (Vec2::ZERO, Vec2::new(cursor, 0.0))
    }
}

fn draw_text(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    text: &str,
    origin: Vec2,
    size: f32,
    color: [u8; 4],
) {
    let scale = size / FONT_SOURCE_SIZE;
    let mut cursor = origin.x;
    for character in text.chars() {
        let glyph = glyph(character);
        if glyph.width != 0 && glyph.height != 0 {
            let left = cursor + glyph.xmin as f32 * scale;
            let top = origin.y - (glyph.ymin + glyph.height as i32) as f32 * scale;
            let width = (glyph.width as f32 * scale).ceil().max(1.0) as u32;
            let height = (glyph.height as f32 * scale).ceil().max(1.0) as u32;
            let rect = clipped_rect(
                rendered,
                left.floor() as i32,
                top.floor() as i32,
                width,
                height,
            );
            if let Some(rect) = rect {
                scratch.clear();
                scratch.resize((rect.width * rect.height) as usize, 0);
                for y in 0..rect.height {
                    for x in 0..rect.width {
                        let mut coverage = 0.0_f32;
                        for sample_y in 0..SUPERSAMPLE {
                            for sample_x in 0..SUPERSAMPLE {
                                let x = rect.x as f32
                                    + x as f32
                                    + (sample_x as f32 + 0.5) / SUPERSAMPLE as f32;
                                let y = rect.y as f32
                                    + y as f32
                                    + (sample_y as f32 + 0.5) / SUPERSAMPLE as f32;
                                coverage +=
                                    sample_glyph(glyph, (x - left) / scale, (y - top) / scale);
                            }
                        }
                        scratch[(y * rect.width + x) as usize] =
                            (coverage / (SUPERSAMPLE * SUPERSAMPLE) as f32).round() as u8;
                    }
                }
                composite_coverage(rendered, scratch, rect, color);
            }
        }
        cursor += glyph.advance * scale;
    }
}

fn sample_glyph(glyph: &Glyph, x: f32, y: f32) -> f32 {
    let x = x - 0.5;
    let y = y - 0.5;
    let left = x.floor() as i32;
    let top = y.floor() as i32;
    let horizontal = x - left as f32;
    let vertical = y - top as f32;
    let coverage = |x: i32, y: i32| -> f32 {
        if x < 0 || y < 0 || x >= glyph.width as i32 || y >= glyph.height as i32 {
            return 0.0;
        }
        f32::from(packed_font_coverage(
            glyph.offset + y as usize * glyph.width + x as usize,
        ))
    };
    let upper = coverage(left, top) * (1.0 - horizontal) + coverage(left + 1, top) * horizontal;
    let lower =
        coverage(left, top + 1) * (1.0 - horizontal) + coverage(left + 1, top + 1) * horizontal;
    upper * (1.0 - vertical) + lower * vertical
}

fn packed_font_coverage(index: usize) -> u8 {
    let packed = FONT_PIXELS[index / 2];
    let nibble = if index.is_multiple_of(2) {
        packed >> 4
    } else {
        packed & 0x0f
    };
    nibble * 17
}

fn clipped_rect(rendered: &Rendered, x: i32, y: i32, width: u32, height: u32) -> Option<Rect> {
    let left = x.max(0) as u32;
    let top = y.max(0) as u32;
    let right = (x.saturating_add(width as i32)).clamp(0, rendered.width as i32) as u32;
    let bottom = (y.saturating_add(height as i32)).clamp(0, rendered.height as i32) as u32;
    (right > left && bottom > top).then_some(Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

fn draw_chip(rendered: &mut Rendered, scratch: &mut Vec<u8>, rect: Rect, radius: f32) {
    draw_rounded_rect(rendered, scratch, rect, radius, BLACK);
    let border = (rect.height as f32 * 0.045).round().max(1.0) as u32;
    let inner = Rect {
        x: rect.x + border,
        y: rect.y + border,
        width: rect.width.saturating_sub(border * 2),
        height: rect.height.saturating_sub(border * 2),
    };
    draw_rounded_rect(
        rendered,
        scratch,
        inner,
        (radius - border as f32).max(1.0),
        WHITE,
    );
}

fn axis_font_size(rect: Rect) -> f32 {
    (rect.width as f32 * 0.14).max(7.0)
}

fn marker_radius(rect: Rect) -> f32 {
    (rect.width as f32 * MARKER_RADIUS_RATIO).max(2.0)
}

fn marker_cross_stroke(rect: Rect) -> f32 {
    (rect.width as f32 * MARKER_CROSS_STROKE_RATIO).max(1.0)
}

fn aligned_axis_label_origin(rect: Rect, directions: [Vec2; 2], text: &str) -> Vec2 {
    let center = Vec2::new(
        rect.x as f32 + rect.width as f32 * 0.5,
        rect.y as f32 + rect.height as f32 * 0.5,
    );
    let font = axis_font_size(rect);
    let (min, max) = text_bounds(text, font);
    let half_size = (max - min) * 0.5;
    let away = -(directions[0] + directions[1]);
    let free = if away.length_squared() <= f32::EPSILON {
        Vec2::Y
    } else {
        away.normalize()
    };
    let marker_radius = marker_radius(rect);
    let gap = font * 0.35;
    let support = free.x.abs() * half_size.x + free.y.abs() * half_size.y;
    let label_center = center + free * (marker_radius + gap + support);
    label_center - (min + max) * 0.5
}

fn draw_axes(rendered: &mut Rendered, scratch: &mut Vec<u8>, rect: Rect, prepared: &PreparedView) {
    let center = Vec2::new(
        rect.x as f32 + rect.width as f32 * 0.5,
        rect.y as f32 + rect.height as f32 * 0.5,
    );
    let radius = rect.width as f32 * 0.5;
    draw_circle(rendered, scratch, center, radius, BLACK);
    draw_circle(
        rendered,
        scratch,
        center,
        (radius - (radius * 0.035).max(1.0)).max(1.0),
        WHITE,
    );

    let mut axes = projected_axes(prepared.camera, prepared.projection, prepared.alignment);
    axes.sort_by(|left, right| left.2.total_cmp(&right.2).then(left.0.cmp(&right.0)));
    let shaft_length = rect.width as f32 * 0.29;
    let shaft_width = (rect.width as f32 * 0.03).max(1.0);
    let arrow_length = rect.width as f32 * 0.09;
    let arrow_half_width = rect.width as f32 * 0.055;
    let axis_font = axis_font_size(rect);
    for &(index, direction, _) in &axes {
        let unit = direction.normalize_or_zero();
        if unit == Vec2::ZERO {
            continue;
        }
        let tip = center + direction * shaft_length;
        let base = tip - unit * arrow_length;
        let perpendicular = Vec2::new(-unit.y, unit.x);
        draw_segment(
            rendered,
            scratch,
            center,
            base,
            shaft_width,
            AXIS_COLORS[index],
        );
        draw_triangle(
            rendered,
            scratch,
            tip,
            base + perpendicular * arrow_half_width,
            base - perpendicular * arrow_half_width,
            AXIS_COLORS[index],
        );
        let text = format!("+{}", axis_name(index));
        let text_origin = tip + unit * (axis_font * VISIBLE_AXIS_LABEL_OFFSET_EM);
        draw_text(
            rendered,
            scratch,
            &text,
            Vec2::new(
                text_origin.x - measure_text(&text, axis_font) * 0.5,
                text_origin.y + axis_font * 0.35,
            ),
            axis_font,
            AXIS_COLORS[index],
        );
    }
    if let Some(alignment) = prepared.alignment {
        let marker_radius = marker_radius(rect);
        draw_circle(
            rendered,
            scratch,
            center,
            marker_radius,
            AXIS_COLORS[alignment.axis],
        );
        draw_circle(rendered, scratch, center, marker_radius * 0.68, WHITE);
        if alignment.camera_forward_positive {
            draw_segment(
                rendered,
                scratch,
                center - Vec2::splat(marker_radius * MARKER_CROSS_ARM_RATIO),
                center + Vec2::splat(marker_radius * MARKER_CROSS_ARM_RATIO),
                marker_cross_stroke(rect),
                AXIS_COLORS[alignment.axis],
            );
            draw_segment(
                rendered,
                scratch,
                center
                    + Vec2::new(
                        -marker_radius * MARKER_CROSS_ARM_RATIO,
                        marker_radius * MARKER_CROSS_ARM_RATIO,
                    ),
                center
                    + Vec2::new(
                        marker_radius * MARKER_CROSS_ARM_RATIO,
                        -marker_radius * MARKER_CROSS_ARM_RATIO,
                    ),
                marker_cross_stroke(rect),
                AXIS_COLORS[alignment.axis],
            );
        } else {
            draw_circle(
                rendered,
                scratch,
                center,
                marker_radius * MARKER_DOT_RATIO,
                AXIS_COLORS[alignment.axis],
            );
        }
        let text = format!("+{}", axis_name(alignment.axis));
        let directions = [axes[0].1.normalize_or_zero(), axes[1].1.normalize_or_zero()];
        draw_text(
            rendered,
            scratch,
            &text,
            aligned_axis_label_origin(rect, directions, &text),
            axis_font,
            AXIS_COLORS[alignment.axis],
        );
    }
}

fn projected_axes(
    camera: CameraState,
    projection: Projection,
    alignment: Option<Alignment>,
) -> Vec<(usize, Vec2, f32)> {
    AXES.into_iter()
        .enumerate()
        .filter(|(index, _)| alignment.is_none_or(|alignment| alignment.axis != *index))
        .map(|(index, world_axis)| {
            let camera_axis = camera.view.transform_vector3(world_axis);
            let direction = match projection {
                Projection::Orthographic => Vec2::new(camera_axis.x, -camera_axis.y),
                Projection::Perspective => perspective_direction(camera_axis),
            };
            (index, direction, camera_axis.z)
        })
        .collect()
}

fn perspective_direction(axis: Vec3) -> Vec2 {
    let tangent = (45f32.to_radians() * 0.5).tan();
    let depth = 4.0;
    let endpoint_depth = depth - axis.z;
    Vec2::new(
        axis.x / (endpoint_depth * tangent),
        -axis.y / (endpoint_depth * tangent),
    ) / (1.0 / (depth * tangent))
}

fn draw_rounded_rect(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    rect: Rect,
    radius: f32,
    color: [u8; 4],
) {
    raster_shape(rendered, scratch, rect, color, |point| {
        let left = rect.x as f32;
        let top = rect.y as f32;
        let right = rect.right() as f32;
        let bottom = rect.bottom() as f32;
        let closest = Vec2::new(
            point.x.clamp(left + radius, right - radius),
            point.y.clamp(top + radius, bottom - radius),
        );
        (point - closest).length_squared() <= radius * radius
    });
}

fn draw_circle(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    center: Vec2,
    radius: f32,
    color: [u8; 4],
) {
    let rect = clipped_rect(
        rendered,
        (center.x - radius).floor() as i32,
        (center.y - radius).floor() as i32,
        (radius * 2.0).ceil() as u32 + 1,
        (radius * 2.0).ceil() as u32 + 1,
    );
    if let Some(rect) = rect {
        raster_shape(rendered, scratch, rect, color, |point| {
            (point - center).length_squared() <= radius * radius
        });
    }
}

fn draw_segment(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    start: Vec2,
    end: Vec2,
    width: f32,
    color: [u8; 4],
) {
    let radius = width * 0.5;
    let min = start.min(end) - Vec2::splat(radius + 1.0);
    let max = start.max(end) + Vec2::splat(radius + 1.0);
    if let Some(rect) = clipped_rect(
        rendered,
        min.x.floor() as i32,
        min.y.floor() as i32,
        (max.x - min.x).ceil() as u32,
        (max.y - min.y).ceil() as u32,
    ) {
        let delta = end - start;
        let length_squared = delta.length_squared();
        raster_shape(rendered, scratch, rect, color, |point| {
            let t = if length_squared <= f32::EPSILON {
                0.0
            } else {
                ((point - start).dot(delta) / length_squared).clamp(0.0, 1.0)
            };
            (point - (start + delta * t)).length_squared() <= radius * radius
        });
    }
}

fn draw_triangle(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    a: Vec2,
    b: Vec2,
    c: Vec2,
    color: [u8; 4],
) {
    let min = a.min(b).min(c);
    let max = a.max(b).max(c);
    if let Some(rect) = clipped_rect(
        rendered,
        min.x.floor() as i32,
        min.y.floor() as i32,
        (max.x - min.x).ceil() as u32 + 1,
        (max.y - min.y).ceil() as u32 + 1,
    ) {
        raster_shape(rendered, scratch, rect, color, |point| {
            let edge = |left: Vec2, right: Vec2| {
                (point.x - left.x) * (right.y - left.y) - (point.y - left.y) * (right.x - left.x)
            };
            let values = [edge(a, b), edge(b, c), edge(c, a)];
            values.iter().all(|value| *value >= 0.0) || values.iter().all(|value| *value <= 0.0)
        });
    }
}

fn raster_shape(
    rendered: &mut Rendered,
    scratch: &mut Vec<u8>,
    rect: Rect,
    color: [u8; 4],
    contains: impl Fn(Vec2) -> bool,
) {
    scratch.clear();
    scratch.resize((rect.width * rect.height) as usize, 0);
    let sample_count = SUPERSAMPLE * SUPERSAMPLE;
    for y in 0..rect.height {
        for x in 0..rect.width {
            let mut covered = 0_u32;
            for sy in 0..SUPERSAMPLE {
                for sx in 0..SUPERSAMPLE {
                    let point = Vec2::new(
                        rect.x as f32 + x as f32 + (sx as f32 + 0.5) / SUPERSAMPLE as f32,
                        rect.y as f32 + y as f32 + (sy as f32 + 0.5) / SUPERSAMPLE as f32,
                    );
                    covered += u32::from(contains(point));
                }
            }
            scratch[(y * rect.width + x) as usize] =
                ((covered * 255 + sample_count / 2) / sample_count) as u8;
        }
    }
    composite_coverage(rendered, scratch, rect, color);
}

fn composite_coverage(rendered: &mut Rendered, coverage: &[u8], rect: Rect, color: [u8; 4]) {
    for y in 0..rect.height {
        for x in 0..rect.width {
            let coverage = u32::from(coverage[(y * rect.width + x) as usize]);
            if coverage == 0 {
                continue;
            }
            let source_alpha = (u32::from(color[3]) * coverage + 127) / 255;
            let index = (((rect.y + y) * rendered.width + rect.x + x) * 4) as usize;
            let destination_alpha = u32::from(rendered.rgba[index + 3]);
            let output_alpha =
                source_alpha + (destination_alpha * (255 - source_alpha) + 127) / 255;
            for channel in 0..3 {
                let source = u32::from(color[channel]) * source_alpha;
                let destination = u32::from(rendered.rgba[index + channel])
                    * destination_alpha
                    * (255 - source_alpha)
                    / 255;
                rendered.rgba[index + channel] = if output_alpha == 0 {
                    0
                } else {
                    ((source + destination + output_alpha / 2) / output_alpha) as u8
                };
            }
            rendered.rgba[index + 3] = output_alpha as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Mat4;

    fn scene() -> Scene {
        scaled_scene(1.0)
    }

    fn scaled_scene(half_extent: f32) -> Scene {
        bounded_scene([-half_extent; 3], [half_extent; 3])
    }

    fn bounded_scene(min: [f32; 3], max: [f32; 3]) -> Scene {
        Scene {
            meshes: Vec::new(),
            instances: Vec::new(),
            bounds: Some((min, max)),
        }
    }

    fn hash(bytes: &[u8]) -> u64 {
        bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
        })
    }

    fn camera(forward: Vec3) -> CameraState {
        let forward = forward.normalize();
        CameraState {
            projection: Mat4::IDENTITY,
            view: Mat4::IDENTITY,
            forward,
            target_depth: 4.0,
        }
    }

    fn pixel(rendered: &Rendered, x: u32, y: u32) -> [u8; 4] {
        let offset = ((y * rendered.width + x) * 4) as usize;
        rendered.rgba[offset..offset + 4]
            .try_into()
            .expect("RGBA pixel")
    }

    #[test]
    fn alignment_boundary_identifies_one_axis() {
        for sign in [-1.0, 1.0] {
            for (angle, aligned) in [(14.9_f32, true), (15.0, true), (15.1, false)] {
                let radians = angle.to_radians();
                let forward = Vec3::new(radians.sin(), 0.0, sign * radians.cos());
                let result = classify_alignment(forward);
                assert_eq!(result.is_some_and(|value| value.axis == 2), aligned);
            }
        }
    }

    #[test]
    fn depth_convention_matches_canonical_views() {
        for (forward, positive) in [
            (Vec3::NEG_Z, false),
            (Vec3::Z, true),
            (Vec3::NEG_X, false),
            (Vec3::X, true),
            (Vec3::NEG_Y, false),
            (Vec3::Y, true),
        ] {
            let alignment = classify_alignment(forward).expect("canonical alignment");
            assert_eq!(alignment.camera_forward_positive, positive);
        }
    }

    #[test]
    fn labels_are_preserved_verbatim_for_aligned_and_unaligned_views() {
        for (phi_deg, theta_deg) in [(90.0, 270.0), (60.0, -45.0)] {
            let prepared = prepare_view(
                &scene(),
                &RenderOptions {
                    phi_deg,
                    theta_deg,
                    label: Some("Housing datum A".into()),
                    include_label: true,
                    ..RenderOptions::default()
                },
            )
            .expect("labeled view");
            assert_eq!(prepared.label.as_deref(), Some("Housing datum A"));
        }
    }

    #[test]
    fn polar_alignment_is_consistent_for_every_up_axis_and_projection() {
        for (up, axis) in [
            (crate::UpAxis::X, 0),
            (crate::UpAxis::Y, 1),
            (crate::UpAxis::Z, 2),
        ] {
            for projection in [Projection::Perspective, Projection::Orthographic] {
                let options = RenderOptions {
                    phi_deg: 0.0,
                    theta_deg: 0.0,
                    up,
                    projection,
                    label: Some("Top".into()),
                    include_axes: true,
                    include_label: true,
                    include_scale: true,
                    ..RenderOptions::default()
                };
                let prepared = prepare_view(&scene(), &options).expect("annotated polar view");
                let alignment = prepared.alignment.expect("polar axis alignment");
                assert_eq!(alignment.axis, axis);
                assert!(!alignment.camera_forward_positive);
                assert_eq!(
                    projected_axes(prepared.camera, projection, Some(alignment)).len(),
                    2
                );
                assert!(prepared.scale_width_px.is_some_and(f32::is_finite));
            }
        }
    }

    #[test]
    fn aligned_axis_marker_is_concentric_with_the_shaft_origin() {
        let rect = Rect {
            x: 0,
            y: 0,
            width: 200,
            height: 200,
        };
        let center = (100_u32, 100_u32);
        let ring_offset = 11_u32;
        for (up, axis) in [
            (crate::UpAxis::X, 0),
            (crate::UpAxis::Y, 1),
            (crate::UpAxis::Z, 2),
        ] {
            for phi_deg in [0.0, 180.0] {
                for projection in [Projection::Perspective, Projection::Orthographic] {
                    let options = RenderOptions {
                        width: 256,
                        height: 256,
                        phi_deg,
                        theta_deg: 0.0,
                        up,
                        projection,
                        include_axes: true,
                        ..RenderOptions::default()
                    };
                    let prepared = prepare_view(&scene(), &options).expect("polar view");
                    let mut rendered = Rendered {
                        rgba: WHITE.repeat(256 * 256),
                        width: 256,
                        height: 256,
                    };
                    draw_axes(&mut rendered, &mut Vec::new(), rect, &prepared);
                    for (x, y) in [
                        (center.0 - ring_offset, center.1),
                        (center.0 + ring_offset, center.1),
                        (center.0, center.1 - ring_offset),
                        (center.0, center.1 + ring_offset),
                    ] {
                        assert_eq!(
                            pixel(&rendered, x, y),
                            AXIS_COLORS[axis],
                            "{up:?}/{projection:?}/phi={phi_deg}: marker ring is not centered at ({x}, {y})"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn depth_marker_geometry_scales_with_the_axes_badge() {
        for (side, expected_radius, expected_stroke) in
            [(35, 2.275, 1.0), (144, 9.36, 1.728), (737, 47.905, 8.844)]
        {
            let rect = Rect {
                x: 0,
                y: 0,
                width: side,
                height: side,
            };
            assert!((marker_radius(rect) - expected_radius).abs() < 0.001);
            assert!((marker_cross_stroke(rect) - expected_stroke).abs() < 0.001);
        }
    }

    #[test]
    fn aligned_axis_label_occupies_the_half_plane_opposite_both_shafts() {
        let rect = Rect {
            x: 0,
            y: 0,
            width: 200,
            height: 200,
        };
        let center = Vec2::splat(100.0);
        let radius = 100.0;
        for (up, aligned_axis) in [
            (crate::UpAxis::X, 0),
            (crate::UpAxis::Y, 1),
            (crate::UpAxis::Z, 2),
        ] {
            for phi_deg in [0.0, 14.9, 15.0, 165.0, 165.1, 180.0] {
                for projection in [Projection::Perspective, Projection::Orthographic] {
                    let options = RenderOptions {
                        phi_deg,
                        theta_deg: 0.0,
                        up,
                        projection,
                        include_axes: true,
                        ..RenderOptions::default()
                    };
                    let prepared = prepare_view(&scene(), &options).expect("polar view");
                    let axes = projected_axes(prepared.camera, projection, prepared.alignment);
                    let directions = [axes[0].1.normalize_or_zero(), axes[1].1.normalize_or_zero()];
                    let text = format!("+{}", axis_name(aligned_axis));
                    let font = axis_font_size(rect);
                    let origin = aligned_axis_label_origin(rect, directions, &text);
                    let (relative_min, relative_max) = text_bounds(&text, font);
                    let min = origin + relative_min;
                    let max = origin + relative_max;
                    let corners = [
                        Vec2::new(min.x, min.y),
                        Vec2::new(min.x, max.y),
                        Vec2::new(max.x, min.y),
                        Vec2::new(max.x, max.y),
                    ];
                    for corner in corners {
                        assert!(
                            (corner - center).length() < radius,
                            "{up:?}/{projection:?}/phi={phi_deg}: label corner {corner:?} leaves the axes circle"
                        );
                    }
                    for direction in directions {
                        let furthest = corners
                            .into_iter()
                            .map(|corner| (corner - center).dot(direction))
                            .fold(f32::NEG_INFINITY, f32::max);
                        assert!(
                            furthest < 0.0,
                            "{up:?}/{projection:?}/phi={phi_deg}: label crosses shaft half-plane by {furthest}"
                        );
                    }
                }
            }
            for phi_deg in [15.1, 164.9] {
                for projection in [Projection::Perspective, Projection::Orthographic] {
                    let prepared = prepare_view(
                        &scene(),
                        &RenderOptions {
                            phi_deg,
                            theta_deg: 0.0,
                            up,
                            projection,
                            include_axes: true,
                            ..RenderOptions::default()
                        },
                    )
                    .expect("non-aligned view");
                    assert_eq!(
                        prepared.alignment, None,
                        "{up:?}/{projection:?}/phi={phi_deg}"
                    );
                    assert_eq!(projected_axes(prepared.camera, projection, None).len(), 3);
                }
            }
        }
    }

    #[test]
    fn overlay_text_scales_with_output_resolution_above_the_legibility_floor() {
        for (width, height, expected_font, expected_axis_font) in [
            (192, 192, 12.0, 7.0),
            (800, 800, 20.0, 20.16),
            (1600, 1600, 40.0, 40.32),
            (3840, 2160, 54.0, 54.46),
            (4096, 4096, 102.0, 103.18),
        ] {
            let options = RenderOptions {
                width,
                height,
                include_axes: true,
                ..RenderOptions::default()
            };
            let layout = measure_layout(&options, Some("I")).expect("overlay layout");
            let axes = layout.axes.expect("axes layout");
            assert_eq!(layout.font_px, expected_font, "{width}x{height}");
            assert!(
                (axis_font_size(axes) - expected_axis_font).abs() < 0.011,
                "{width}x{height}: expected {expected_axis_font}, got {}",
                axis_font_size(axes)
            );
        }
    }

    #[test]
    fn grid_quantizer_and_si_format_are_stable() {
        assert_eq!(nice_length(3.0), (1.0, 0));
        assert_eq!(nice_length(4.0), (5.0, 0));
        assert_eq!(format_si(0.000_000_5, -7), "0.5 µm");
        assert_eq!(format_si(0.000_005, -6), "5 µm");
        assert_eq!(format_si(0.005, -3), "5 mm");
        assert_eq!(format_si(5.0, 0), "5 m");
        assert_eq!(format_si(5_000.0, 3), "5 km");
        assert_eq!(format_si(-0.0, 0), "0 µm");

        let below = f32::from_bits(0.05_f32.to_bits() - 1);
        let above = f32::from_bits(0.05_f32.to_bits() + 1);
        for target in [below, 0.05, above] {
            let (meters, exponent) = nice_length(target);
            assert_eq!(format_si(meters, exponent), "50 mm");
        }
    }

    #[test]
    fn generated_font_is_sorted_and_fingerprinted() {
        assert!(
            FONT_GLYPHS
                .windows(2)
                .all(|pair| pair[0].code < pair[1].code)
        );
        assert_eq!(FONTDUE_VERSION, "0.9.3");
        assert_eq!(FONT_GENERATOR_FNV, 0x69eb_05c8_ae9d_a2d5);
        assert_eq!(FONT_SOURCE_FNV, 0x5d34_752d_5fd0_b666);
        assert_eq!(FONT_ATLAS_FNV, 0x7d64_8b80_86ba_a388);
        assert!(measure_text("Front — View From +Z", 14.0) > 0.0);
    }

    #[test]
    fn projected_axes_suppress_only_the_aligned_axis() {
        let alignment = classify_alignment(Vec3::NEG_Z);
        let axes = projected_axes(camera(Vec3::NEG_Z), Projection::Orthographic, alignment);
        assert_eq!(axes.len(), 2);
        assert!(axes.iter().all(|axis| axis.0 != 2));
    }

    #[test]
    fn overlay_fit_preserves_unannotated_camera_and_separates_enabled_slots() {
        let options = RenderOptions {
            projection: Projection::Orthographic,
            phi_deg: 90.0,
            theta_deg: 270.0,
            ..RenderOptions::default()
        };
        let expected = camera_state(&scene(), &options);
        let unannotated = prepare_view(&scene(), &options).expect("unannotated view");
        assert_eq!(unannotated.camera.projection, expected.projection);
        assert_eq!(unannotated.camera.view, expected.view);

        let annotated_options = RenderOptions {
            label: Some("Front".into()),
            include_axes: true,
            include_label: true,
            include_scale: true,
            ..options
        };
        let annotated = prepare_view(&scene(), &annotated_options).expect("annotated view");
        let envelope = projected_envelope(
            annotated.camera,
            Vec3::splat(-1.0),
            Vec3::splat(1.0),
            annotated_options.width,
            annotated_options.height,
        )
        .expect("finite projection");
        for rect in [
            annotated.layout.label,
            annotated.layout.scale,
            annotated.layout.axes,
        ]
        .into_iter()
        .flatten()
        {
            assert!(!intersects(envelope, rect, annotated.layout.guard as f32));
        }
    }

    #[test]
    fn overlay_fit_covers_canonical_views_projections_and_extreme_shapes() {
        let scenes = [
            bounded_scene([-20.0, -1.0, -1.0], [20.0, 1.0, 1.0]),
            bounded_scene([-1.0, -20.0, -1.0], [1.0, 20.0, 1.0]),
            bounded_scene([-1.0, -1.0, -20.0], [1.0, 1.0, 20.0]),
            bounded_scene([0.0; 3], [0.0; 3]),
            bounded_scene([-1.0e9; 3], [1.0e9; 3]),
            bounded_scene([-1.0e-9; 3], [1.0e-9; 3]),
        ];
        let views = [
            (90.0, 270.0),
            (90.0, 90.0),
            (90.0, 0.0),
            (90.0, 180.0),
            (0.0, 0.0),
            (180.0, 0.0),
        ];
        for scene in scenes {
            for projection in [Projection::Perspective, Projection::Orthographic] {
                for (phi_deg, theta_deg) in views {
                    let options = RenderOptions {
                        width: 768,
                        height: 576,
                        phi_deg,
                        theta_deg,
                        projection,
                        label: Some("V".into()),
                        include_axes: true,
                        include_label: true,
                        include_scale: true,
                        ..RenderOptions::default()
                    };
                    let prepared = prepare_view(&scene, &options).unwrap_or_else(|error| {
                        panic!(
                            "overlay-safe canonical view failed for {:?}, {projection:?}, ({phi_deg}, {theta_deg}): {error}",
                            scene.bounds
                        )
                    });
                    let (min, max) = scene.bounds.expect("fixture bounds");
                    let envelope = projected_envelope(
                        prepared.camera,
                        min.into(),
                        max.into(),
                        options.width,
                        options.height,
                    )
                    .expect("finite envelope");
                    for rect in [
                        prepared.layout.label,
                        prepared.layout.scale,
                        prepared.layout.axes,
                    ]
                    .into_iter()
                    .flatten()
                    {
                        assert!(!intersects(envelope, rect, prepared.layout.guard as f32));
                    }
                }
            }
        }
    }

    #[test]
    fn scale_uses_subject_center_for_each_projection() {
        let mut state = camera(Vec3::NEG_Z);
        state.projection = Mat4::IDENTITY;
        assert_eq!(
            meters_per_pixel(
                state,
                &RenderOptions {
                    width: 200,
                    height: 200,
                    projection: Projection::Orthographic,
                    ..RenderOptions::default()
                }
            )
            .expect("orthographic scale"),
            0.01
        );
        assert_eq!(
            meters_per_pixel(
                state,
                &RenderOptions {
                    width: 200,
                    height: 200,
                    projection: Projection::Perspective,
                    ..RenderOptions::default()
                }
            )
            .expect("perspective scale"),
            0.04
        );
    }

    #[test]
    fn scale_copy_and_font_fit_are_projection_specific() {
        for (width, height) in [(192, 192), (800, 800), (4096, 4096)] {
            for projection in [Projection::Orthographic, Projection::Perspective] {
                let prepared = prepare_view(
                    &scene(),
                    &RenderOptions {
                        width,
                        height,
                        projection,
                        include_scale: true,
                        ..RenderOptions::default()
                    },
                )
                .expect("scale overlay");
                let label = prepared.scale_label.as_deref().expect("scale label");
                let font = prepared.scale_font_px.expect("scale font");
                let rect = prepared.layout.scale.expect("scale rect");
                assert_eq!(
                    label.ends_with(" @ center"),
                    projection == Projection::Perspective
                );
                assert!(font >= 7.0, "{width}x{height}: {font}");
                assert!(
                    measure_text(label, font) <= rect.width as f32 * 0.8 + 0.01,
                    "{width}x{height}/{projection:?}: {label} at {font}px"
                );
            }
        }
    }

    #[test]
    fn subject_center_scale_tracks_world_size_linearly() {
        for projection in [Projection::Perspective, Projection::Orthographic] {
            let options = RenderOptions {
                projection,
                ..RenderOptions::default()
            };
            let small = meters_per_pixel(camera_state(&scaled_scene(1.0), &options), &options)
                .expect("small scene scale");
            let large = meters_per_pixel(camera_state(&scaled_scene(2.0), &options), &options)
                .expect("large scene scale");
            assert!(
                (large / small - 2.0).abs() < 1e-5,
                "{projection:?}: {small} → {large}"
            );
        }
    }

    #[test]
    fn text_and_shapes_are_deterministic_and_bounded() {
        let mut first = Rendered {
            rgba: [220, 220, 220, 255].repeat(256 * 256),
            width: 256,
            height: 256,
        };
        let mut second = Rendered {
            rgba: first.rgba.clone(),
            width: 256,
            height: 256,
        };
        let before = first.rgba.clone();
        let mut scratch = Vec::new();
        let rect = Rect {
            x: 8,
            y: 8,
            width: 150,
            height: 32,
        };
        for rendered in [&mut first, &mut second] {
            draw_chip(rendered, &mut scratch, rect, 7.0);
            draw_text(
                rendered,
                &mut scratch,
                "Front — −Z",
                Vec2::new(16.0, 29.0),
                14.0,
                BLACK,
            );
        }
        assert_eq!(first.rgba, second.rgba);
        assert_ne!(first.rgba, before);
        let mut text = Rendered {
            rgba: vec![0; 96 * 32 * 4],
            width: 96,
            height: 32,
        };
        draw_text(
            &mut text,
            &mut scratch,
            "A—µ",
            Vec2::new(4.0, 22.0),
            14.0,
            BLACK,
        );
        assert!(
            text.rgba
                .chunks_exact(4)
                .any(|pixel| pixel[3] > 0 && pixel[3] < 255)
        );
        assert_eq!(hash(&first.rgba), 2_172_587_291_750_748_294);
        for y in 40..256 {
            let start = y * 256 * 4;
            assert_eq!(
                &first.rgba[start..start + 256 * 4],
                &before[start..start + 256 * 4]
            );
        }
    }
}
