//! Deterministic screen-space XYZ indicator stamped into readback RGBA.

use crate::Projection;
use crate::render::{CameraState, Rendered};
use glam::{Vec2, Vec3};

const X_COLOR: [u8; 4] = [255, 0, 0, 255];
const Y_COLOR: [u8; 4] = [0, 128, 0, 255];
const Z_COLOR: [u8; 4] = [37, 78, 136, 255];
const COLORS: [[u8; 4]; 3] = [X_COLOR, Y_COLOR, Z_COLOR];
const AXES: [Vec3; 3] = [Vec3::X, Vec3::Y, Vec3::Z];
const SUPPRESS_DOT: f32 = 0.965_925_8; // cos(15°)
const SUPERSAMPLE: i32 = 4;
const FIXED_SCALE: f32 = 65_536.0;

const GLYPHS: [[[u8; 5]; 7]; 3] = [
    [
        [1, 0, 0, 0, 1],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [1, 0, 0, 0, 1],
    ],
    [
        [1, 0, 0, 0, 1],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
    ],
    [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
    ],
];

#[derive(Clone, Copy)]
struct ProjectedAxis {
    index: usize,
    direction: Vec2,
    depth: f32,
}

/// Stamp the indicator and reuse `scratch` between batch views.
pub(crate) fn stamp_axis_indicator(
    rendered: &mut Rendered,
    camera: CameraState,
    projection: Projection,
    scratch: &mut Vec<u8>,
) {
    let min_dimension = rendered.width.min(rendered.height) as f32;
    let tile = ((min_dimension * 0.18).round() as u32)
        .max(16)
        .min(rendered.width.min(rendered.height));
    let inset = (min_dimension * 0.03).round() as u32;
    let x0 = rendered.width.saturating_sub(tile + inset);
    let y0 = rendered.height.saturating_sub(tile + inset);
    let side = tile as i32 * SUPERSAMPLE;
    scratch.clear();
    scratch.resize((side * side) as usize, 0);

    let mut axes = projected_axes(camera, projection);
    axes.sort_by(|left, right| {
        left.depth
            .total_cmp(&right.depth)
            .then(left.index.cmp(&right.index))
    });

    let origin = Vec2::splat(tile as f32 * 0.5);
    let shaft_length = tile as f32 * 0.30;
    let shaft_width = (tile as f32 * 0.03).max(1.0);
    let arrow_length = tile as f32 * 0.09;
    let arrow_half_width = tile as f32 * 0.06;
    let label_height = tile as f32 * 0.14;
    let label_gap = tile as f32 * 0.04;

    for axis in axes {
        let length = axis.direction.length();
        if length <= f32::EPSILON {
            continue;
        }
        let unit = axis.direction / length;
        let tip = origin + axis.direction * shaft_length;
        let base = tip - unit * arrow_length;
        let perpendicular = Vec2::new(-unit.y, unit.x);
        draw_segment(
            scratch,
            side,
            origin,
            base,
            shaft_width,
            axis.index as u8 + 1,
        );
        draw_triangle(
            scratch,
            side,
            tip,
            base + perpendicular * arrow_half_width,
            base - perpendicular * arrow_half_width,
            axis.index as u8 + 1,
        );
        draw_glyph(
            scratch,
            side,
            axis.index,
            tip + unit * (label_gap + label_height * 0.5),
            label_height,
            axis.index as u8 + 1,
        );
    }

    composite(rendered, scratch, x0, y0, tile);
}

fn projected_axes(camera: CameraState, projection: Projection) -> Vec<ProjectedAxis> {
    AXES.into_iter()
        .enumerate()
        .filter_map(|(index, world_axis)| {
            if camera.forward.dot(world_axis).abs() >= SUPPRESS_DOT {
                return None;
            }
            let camera_axis = camera.view.transform_vector3(world_axis);
            let direction = match projection {
                Projection::Orthographic => Vec2::new(camera_axis.x, -camera_axis.y),
                Projection::Perspective => perspective_direction(camera_axis),
            };
            Some(ProjectedAxis {
                index,
                direction,
                depth: camera_axis.z,
            })
        })
        .collect()
}

fn perspective_direction(axis: Vec3) -> Vec2 {
    let tangent = (45f32.to_radians() * 0.5).tan();
    let depth = 4.0;
    let endpoint_depth = depth - axis.z;
    let projected = Vec2::new(
        axis.x / (endpoint_depth * tangent),
        -axis.y / (endpoint_depth * tangent),
    );
    projected / (1.0 / (depth * tangent))
}

fn fixed(value: f32) -> i64 {
    let scaled = value * FIXED_SCALE;
    if scaled.is_sign_negative() {
        (scaled - 0.5).ceil() as i64
    } else {
        (scaled + 0.5).floor() as i64
    }
}

fn rounded_div(value: i64, divisor: i64) -> i64 {
    if value.is_negative() {
        -((-value + divisor / 2) / divisor)
    } else {
        (value + divisor / 2) / divisor
    }
}

fn sample_point(point: Vec2) -> (i32, i32) {
    (
        rounded_div(fixed(point.x) * i64::from(SUPERSAMPLE), 65_536) as i32,
        rounded_div(fixed(point.y) * i64::from(SUPERSAMPLE), 65_536) as i32,
    )
}

fn set_sample(scratch: &mut [u8], side: i32, x: i32, y: i32, axis: u8) {
    if x >= 0 && y >= 0 && x < side && y < side {
        scratch[(y * side + x) as usize] = axis;
    }
}

fn draw_segment(scratch: &mut [u8], side: i32, start: Vec2, end: Vec2, width: f32, axis: u8) {
    let (x1, y1) = sample_point(start);
    let (x2, y2) = sample_point(end);
    let radius = ((width * SUPERSAMPLE as f32 * 0.5).round() as i32).max(1);
    let min_x = x1.min(x2) - radius;
    let max_x = x1.max(x2) + radius;
    let min_y = y1.min(y2) - radius;
    let max_y = y1.max(y2) + radius;
    let dx = i64::from(x2 - x1);
    let dy = i64::from(y2 - y1);
    let length_squared = dx * dx + dy * dy;
    let radius_squared = i64::from(radius) * i64::from(radius);
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let px = i64::from(x - x1);
            let py = i64::from(y - y1);
            let dot = px * dx + py * dy;
            let inside = if dot <= 0 {
                px * px + py * py <= radius_squared
            } else if dot >= length_squared {
                let ex = i64::from(x - x2);
                let ey = i64::from(y - y2);
                ex * ex + ey * ey <= radius_squared
            } else {
                let cross = px * dy - py * dx;
                cross * cross <= radius_squared * length_squared
            };
            if inside {
                set_sample(scratch, side, x, y, axis);
            }
        }
    }
}

fn edge(a: (i32, i32), b: (i32, i32), p: (i32, i32)) -> i64 {
    i64::from(p.0 - a.0) * i64::from(b.1 - a.1) - i64::from(p.1 - a.1) * i64::from(b.0 - a.0)
}

fn draw_triangle(scratch: &mut [u8], side: i32, a: Vec2, b: Vec2, c: Vec2, axis: u8) {
    let (a, b, c) = (sample_point(a), sample_point(b), sample_point(c));
    let min_x = a.0.min(b.0).min(c.0);
    let max_x = a.0.max(b.0).max(c.0);
    let min_y = a.1.min(b.1).min(c.1);
    let max_y = a.1.max(b.1).max(c.1);
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let point = (x, y);
            let edges = [edge(a, b, point), edge(b, c, point), edge(c, a, point)];
            if edges.iter().all(|value| *value >= 0) || edges.iter().all(|value| *value <= 0) {
                set_sample(scratch, side, x, y, axis);
            }
        }
    }
}

fn draw_glyph(scratch: &mut [u8], side: i32, glyph: usize, center: Vec2, height: f32, axis: u8) {
    let height = (height * SUPERSAMPLE as f32).round().max(1.0) as i32;
    let width = (height * 5 / 7).max(1);
    let (center_x, center_y) = sample_point(center);
    let left = center_x - width / 2;
    let top = center_y - height / 2;
    for (row, cells) in GLYPHS[glyph].iter().enumerate() {
        for (column, filled) in cells.iter().enumerate() {
            if *filled == 0 {
                continue;
            }
            let x_start = left + width * column as i32 / 5;
            let x_end = left + width * (column as i32 + 1) / 5;
            let y_start = top + height * row as i32 / 7;
            let y_end = top + height * (row as i32 + 1) / 7;
            for y in y_start..y_end.max(y_start + 1) {
                for x in x_start..x_end.max(x_start + 1) {
                    set_sample(scratch, side, x, y, axis);
                }
            }
        }
    }
}

fn composite(rendered: &mut Rendered, scratch: &[u8], x0: u32, y0: u32, tile: u32) {
    let side = tile as usize * SUPERSAMPLE as usize;
    let samples = (SUPERSAMPLE * SUPERSAMPLE) as u32;
    for y in 0..tile as usize {
        for x in 0..tile as usize {
            let mut counts = [0u32; 3];
            for sy in 0..SUPERSAMPLE as usize {
                for sx in 0..SUPERSAMPLE as usize {
                    let value = scratch
                        [(y * SUPERSAMPLE as usize + sy) * side + x * SUPERSAMPLE as usize + sx];
                    if value != 0 {
                        counts[value as usize - 1] += 1;
                    }
                }
            }
            let covered = counts.iter().sum::<u32>();
            if covered == 0 {
                continue;
            }
            let pixel = (((y0 as usize + y) * rendered.width as usize) + x0 as usize + x) * 4;
            let background: [u8; 4] = rendered.rgba[pixel..pixel + 4]
                .try_into()
                .expect("RGBA pixel");
            let uncovered = samples - covered;
            let alpha_sum = covered * 255 + uncovered * u32::from(background[3]);
            for channel in 0..3 {
                let premultiplied = counts
                    .iter()
                    .enumerate()
                    .map(|(axis, count)| count * u32::from(COLORS[axis][channel]) * 255)
                    .sum::<u32>()
                    + uncovered * u32::from(background[channel]) * u32::from(background[3]);
                rendered.rgba[pixel + channel] =
                    ((premultiplied + alpha_sum / 2) / alpha_sum) as u8;
            }
            rendered.rgba[pixel + 3] = ((alpha_sum + samples / 2) / samples) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encode::{encode_jpeg, encode_png, encode_webp};
    use crate::glb::Scene;
    use crate::render::camera_state;
    use crate::{RenderOptions, UpAxis};
    use glam::Mat4;

    fn camera(forward: Vec3) -> CameraState {
        let forward = forward.normalize();
        let up = if forward.dot(Vec3::Y).abs() > 0.99 {
            Vec3::Z
        } else {
            Vec3::Y
        };
        CameraState {
            projection: Mat4::IDENTITY,
            view: glam::camera::rh::view::look_at_mat4(-forward * 4.0, Vec3::ZERO, up),
            forward,
        }
    }

    fn image(alpha: u8) -> Rendered {
        Rendered {
            rgba: [240, 240, 240, alpha].repeat(512 * 512),
            width: 512,
            height: 512,
        }
    }

    fn fnv64(bytes: &[u8]) -> u64 {
        bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
        })
    }

    #[test]
    fn suppression_is_inclusive_and_never_hides_two_axes() {
        for sign in [-1.0, 1.0] {
            for (angle, hidden) in [(14.9_f32, true), (15.0, true), (15.1, false)] {
                let radians = angle.to_radians();
                let forward = Vec3::new(radians.sin(), 0.0, sign * radians.cos());
                let axes = projected_axes(camera(forward), Projection::Orthographic);
                assert_eq!(axes.iter().all(|axis| axis.index != 2), hidden);
                assert!(axes.iter().any(|axis| axis.index == 0));
                assert!(axes.iter().any(|axis| axis.index == 1));
                assert!(axes.len() >= 2);
            }
        }
    }

    #[test]
    fn stamping_is_deterministic_bounded_and_uses_shipped_colors() {
        let mut first = image(0);
        let mut second = image(0);
        let before = first.rgba.clone();
        let mut scratch = Vec::new();
        stamp_axis_indicator(
            &mut first,
            camera(Vec3::new(1.0, 1.0, 1.0)),
            Projection::Orthographic,
            &mut scratch,
        );
        stamp_axis_indicator(
            &mut second,
            camera(Vec3::new(1.0, 1.0, 1.0)),
            Projection::Orthographic,
            &mut scratch,
        );
        assert_eq!(first.rgba, second.rgba);
        assert!(first.rgba.chunks_exact(4).any(|pixel| pixel == X_COLOR));
        assert!(first.rgba.chunks_exact(4).any(|pixel| pixel == Y_COLOR));
        assert!(first.rgba.chunks_exact(4).any(|pixel| pixel == Z_COLOR));
        for y in 0..512usize {
            for x in 0..512usize {
                if x < 405 || y < 405 {
                    let index = (y * 512 + x) * 4;
                    assert_eq!(&first.rgba[index..index + 4], &before[index..index + 4]);
                }
            }
        }
        assert_eq!(fnv64(&first.rgba), 0xcae2_7efd_92b4_58eb);
    }

    #[test]
    fn aligned_axis_is_fully_suppressed_while_other_two_remain() {
        let mut rendered = image(255);
        let mut scratch = Vec::new();
        stamp_axis_indicator(
            &mut rendered,
            camera(Vec3::Z),
            Projection::Orthographic,
            &mut scratch,
        );
        assert!(rendered.rgba.chunks_exact(4).any(|pixel| pixel == X_COLOR));
        assert!(rendered.rgba.chunks_exact(4).any(|pixel| pixel == Y_COLOR));
        assert!(!rendered.rgba.chunks_exact(4).any(|pixel| pixel == Z_COLOR));
        assert!(rendered.rgba.chunks_exact(4).all(|pixel| pixel[3] == 255));
    }

    #[test]
    fn camera_projection_uses_only_orientation_for_all_up_axes() {
        let scene = Scene {
            meshes: Vec::new(),
            instances: Vec::new(),
            bounds: Some(([-3.0, -2.0, -1.0], [5.0, 7.0, 11.0])),
        };
        for up in [UpAxis::X, UpAxis::Y, UpAxis::Z] {
            let mut reference = None;
            for projection in [Projection::Perspective, Projection::Orthographic] {
                let options = RenderOptions {
                    width: 400,
                    height: 300,
                    up,
                    projection,
                    ..Default::default()
                };
                let axes = projected_axes(camera_state(&scene, &options), projection);
                assert!(axes.len() >= 2);
                assert!(axes.iter().all(|axis| axis.direction.is_finite()));
                if projection == Projection::Orthographic {
                    reference = Some(axes);
                }
            }

            let changed_fit = RenderOptions {
                width: 1600,
                height: 300,
                padding_factor: 0.2,
                up,
                projection: Projection::Orthographic,
                ..Default::default()
            };
            let changed =
                projected_axes(camera_state(&scene, &changed_fit), Projection::Orthographic);
            for (left, right) in reference.expect("orthographic axes").iter().zip(&changed) {
                assert_eq!(left.index, right.index);
                assert!((left.direction - right.direction).length() < 1e-6);
            }
        }
    }

    #[test]
    fn stamped_pixels_roundtrip_and_all_codecs_are_deterministic() {
        let mut rendered = image(255);
        let mut scratch = Vec::new();
        stamp_axis_indicator(
            &mut rendered,
            camera(Vec3::new(1.0, 1.0, 1.0)),
            Projection::Perspective,
            &mut scratch,
        );

        let png = encode_png(&rendered).expect("png");
        assert_eq!(png, encode_png(&rendered).expect("repeat png"));
        let mut png_reader = png::Decoder::new(std::io::Cursor::new(&png))
            .read_info()
            .expect("png header");
        let mut png_pixels = vec![0; png_reader.output_buffer_size().expect("png size")];
        let png_info = png_reader.next_frame(&mut png_pixels).expect("png pixels");
        png_pixels.truncate(png_info.buffer_size());
        assert_eq!(png_pixels, rendered.rgba);

        let webp = encode_webp(&rendered).expect("webp");
        assert_eq!(webp, encode_webp(&rendered).expect("repeat webp"));
        let mut webp_reader =
            image_webp::WebPDecoder::new(std::io::Cursor::new(&webp)).expect("webp header");
        let mut webp_pixels = vec![0; webp_reader.output_buffer_size().expect("webp size")];
        webp_reader
            .read_image(&mut webp_pixels)
            .expect("webp pixels");
        assert_eq!(webp_pixels, rendered.rgba);

        let jpeg = encode_jpeg(&rendered, 85).expect("jpeg");
        assert_eq!(jpeg, encode_jpeg(&rendered, 85).expect("repeat jpeg"));
        assert_eq!(fnv64(&jpeg), 0x4a66_69c5_274f_1f0e);
    }
}
