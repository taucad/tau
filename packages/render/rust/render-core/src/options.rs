//! Strict JSON request contracts shared by the WASM and N-API bindings.

use crate::encode::ImageFormat;
use crate::{Projection, RenderError, RenderOptions, UpAxis};
use serde::Deserialize;
use std::collections::HashSet;

pub(crate) const MIN_DIMENSION: u32 = 16;
pub(crate) const MAX_DIMENSION: u32 = 4096;
pub(crate) const ANNOTATED_MIN_DIMENSION: u32 = 192;

/// Wire shape for one image.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct RenderRequest {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub quality: Option<f32>,
    pub phi: Option<f32>,
    pub theta: Option<f32>,
    pub margin: Option<f32>,
    pub up: Option<String>,
    pub projection: Option<String>,
    pub background: Option<[f32; 4]>,
    pub label: Option<String>,
    pub include_axes: Option<bool>,
    pub include_label: Option<bool>,
    pub include_scale: Option<bool>,
}

/// Wire shape for one identified camera in a batch.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderImageViewRequest {
    pub id: String,
    pub label: Option<String>,
    pub phi: f32,
    pub theta: f32,
}

/// Wire shape for ordered multi-image rendering.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct RenderImagesRequest {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub quality: Option<f32>,
    pub margin: Option<f32>,
    pub up: Option<String>,
    pub projection: Option<String>,
    pub background: Option<[f32; 4]>,
    pub include_axes: Option<bool>,
    pub include_label: Option<bool>,
    pub include_scale: Option<bool>,
    pub views: Vec<RenderImageViewRequest>,
}

/// Resolved camera view. IDs are carried so failures can name the view.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderView {
    pub id: String,
    pub label: Option<String>,
    pub phi_deg: f32,
    pub theta_deg: f32,
}

struct CommonRequest<'a> {
    width: Option<u32>,
    height: Option<u32>,
    format: Option<&'a str>,
    quality: Option<f32>,
    margin: Option<f32>,
    up: Option<&'a str>,
    projection: Option<&'a str>,
    background: Option<[f32; 4]>,
    include_axes: Option<bool>,
    include_label: Option<bool>,
    include_scale: Option<bool>,
}

impl RenderRequest {
    pub fn from_json(json: &str) -> Result<Self, RenderError> {
        serde_json::from_str(json).map_err(|error| RenderError::Parse(format!("options: {error}")))
    }

    pub fn resolve(&self) -> Result<(RenderOptions, ImageFormat), RenderError> {
        let (mut options, format) = resolve_common(self.common())?;
        validate_optional_label(self.label.as_deref(), "label")?;
        if options.include_label && self.label.is_none() {
            return Err(RenderError::Parse(
                "label is required when includeLabel is true".into(),
            ));
        }
        options.label.clone_from(&self.label);
        options.phi_deg = finite_or_default(self.phi, options.phi_deg, "phi")?;
        options.theta_deg = finite_or_default(self.theta, options.theta_deg, "theta")?;
        Ok((options, format))
    }

    fn common(&self) -> CommonRequest<'_> {
        CommonRequest {
            width: self.width,
            height: self.height,
            format: self.format.as_deref(),
            quality: self.quality,
            margin: self.margin,
            up: self.up.as_deref(),
            projection: self.projection.as_deref(),
            background: self.background,
            include_axes: self.include_axes,
            include_label: self.include_label,
            include_scale: self.include_scale,
        }
    }
}

impl RenderImagesRequest {
    pub fn from_json(json: &str) -> Result<Self, RenderError> {
        serde_json::from_str(json).map_err(|error| RenderError::Parse(format!("options: {error}")))
    }

    pub fn resolve(&self) -> Result<(RenderOptions, ImageFormat, Vec<RenderView>), RenderError> {
        let (options, format) = resolve_common(self.common())?;
        if self.views.is_empty() {
            return Err(RenderError::Parse(
                "views must contain at least one view".into(),
            ));
        }
        let mut ids = HashSet::with_capacity(self.views.len());
        let mut views = Vec::with_capacity(self.views.len());
        for (index, view) in self.views.iter().enumerate() {
            if !valid_view_id(&view.id) {
                return Err(RenderError::Parse(format!(
                    "views[{index}].id must match [A-Za-z0-9][A-Za-z0-9_-]{{0,63}}"
                )));
            }
            if !ids.insert(view.id.as_str()) {
                return Err(RenderError::Parse(format!(
                    "views contains duplicate id {:?}",
                    view.id
                )));
            }
            if !view.phi.is_finite() {
                return Err(RenderError::Parse(format!(
                    "views[{index}].phi must be finite"
                )));
            }
            if !view.theta.is_finite() {
                return Err(RenderError::Parse(format!(
                    "views[{index}].theta must be finite"
                )));
            }
            validate_optional_label(view.label.as_deref(), &format!("views[{index}].label"))?;
            if options.include_label && view.label.is_none() {
                return Err(RenderError::Parse(format!(
                    "views[{index}].label is required when includeLabel is true"
                )));
            }
            views.push(RenderView {
                id: view.id.clone(),
                label: view.label.clone(),
                phi_deg: view.phi,
                theta_deg: view.theta,
            });
        }
        Ok((options, format, views))
    }

    fn common(&self) -> CommonRequest<'_> {
        CommonRequest {
            width: self.width,
            height: self.height,
            format: self.format.as_deref(),
            quality: self.quality,
            margin: self.margin,
            up: self.up.as_deref(),
            projection: self.projection.as_deref(),
            background: self.background,
            include_axes: self.include_axes,
            include_label: self.include_label,
            include_scale: self.include_scale,
        }
    }
}

fn resolve_common(request: CommonRequest<'_>) -> Result<(RenderOptions, ImageFormat), RenderError> {
    let defaults = RenderOptions::default();
    let width = request.width.unwrap_or(defaults.width);
    let height = request.height.unwrap_or(defaults.height);
    if !(MIN_DIMENSION..=MAX_DIMENSION).contains(&width)
        || !(MIN_DIMENSION..=MAX_DIMENSION).contains(&height)
    {
        return Err(RenderError::Parse(format!(
            "dimensions {width}x{height} outside {MIN_DIMENSION}..={MAX_DIMENSION}"
        )));
    }
    let include_axes = request.include_axes.unwrap_or(false);
    let include_label = request.include_label.unwrap_or(false);
    let include_scale = request.include_scale.unwrap_or(false);
    if (include_axes || include_label || include_scale)
        && (width < ANNOTATED_MIN_DIMENSION || height < ANNOTATED_MIN_DIMENSION)
    {
        return Err(RenderError::Parse(format!(
            "annotated images must be at least {ANNOTATED_MIN_DIMENSION}x{ANNOTATED_MIN_DIMENSION}"
        )));
    }

    let margin = request.margin.unwrap_or(0.1);
    if !margin.is_finite() || !(0.0..=0.5).contains(&margin) {
        return Err(RenderError::Parse(format!(
            "margin {margin} outside 0..=0.5"
        )));
    }
    let quality = request.quality.unwrap_or(0.92);
    if !quality.is_finite() || !(0.0..=1.0).contains(&quality) {
        return Err(RenderError::Parse(format!(
            "quality {quality} outside 0..=1"
        )));
    }
    let up = match request.up {
        None => defaults.up,
        Some("x") => UpAxis::X,
        Some("y") => UpAxis::Y,
        Some("z") => UpAxis::Z,
        Some(other) => return Err(RenderError::Parse(format!("up axis {other:?} not x/y/z"))),
    };
    let projection = match request.projection {
        None | Some("perspective") => Projection::Perspective,
        Some("orthographic") => Projection::Orthographic,
        Some(other) => {
            return Err(RenderError::Parse(format!(
                "projection {other:?} not perspective/orthographic"
            )));
        }
    };
    if let Some(background) = request.background
        && background
            .iter()
            .any(|channel| !channel.is_finite() || !(0.0..=1.0).contains(channel))
    {
        return Err(RenderError::Parse(
            "background channels outside 0..=1".into(),
        ));
    }

    let format_name = request.format.unwrap_or("png");
    let jpeg_quality = (quality * 100.0).round() as u8;
    let format = ImageFormat::from_name(format_name, jpeg_quality)
        .map_err(|_| RenderError::Parse(format!("format {format_name:?} not png/webp/jpeg/jpg")))?;

    Ok((
        RenderOptions {
            width,
            height,
            padding_factor: 1.0 - margin,
            line_width: defaults.line_width,
            up,
            projection,
            background: request.background,
            include_axes,
            include_label,
            include_scale,
            ..defaults
        },
        format,
    ))
}

fn validate_optional_label(label: Option<&str>, name: &str) -> Result<(), RenderError> {
    let Some(label) = label else {
        return Ok(());
    };
    if label.trim().is_empty() {
        return Err(RenderError::Parse(format!(
            "{name} must be a non-empty string"
        )));
    }
    if label.chars().count() > 64 {
        return Err(RenderError::Parse(format!(
            "{name} must contain at most 64 characters"
        )));
    }
    if let Some(character) = label.chars().find(|character| {
        let code = u32::from(*character);
        !((0x20..=0x7e).contains(&code) || matches!(code, 0xb5 | 0x2014 | 0x2212))
    }) {
        return Err(RenderError::Parse(format!(
            "{name} contains unsupported character {character:?}"
        )));
    }
    Ok(())
}

fn finite_or_default(value: Option<f32>, default: f32, name: &str) -> Result<f32, RenderError> {
    let value = value.unwrap_or(default);
    if !value.is_finite() {
        return Err(RenderError::Parse(format!("{name} must be finite")));
    }
    Ok(value)
}

fn valid_view_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn singular_defaults_include_axes_off() {
        let (options, format) = RenderRequest::from_json("{}")
            .expect("parse")
            .resolve()
            .expect("resolve");
        assert_eq!((options.width, options.height), (768, 432));
        assert_eq!((options.phi_deg, options.theta_deg), (60.0, -45.0));
        assert!(!options.include_axes);
        assert!(!options.include_label);
        assert!(!options.include_scale);
        assert_eq!(format, ImageFormat::Png);
    }

    #[test]
    fn plural_resolves_shared_settings_and_ordered_views() {
        let (options, format, views) = RenderImagesRequest::from_json(
            r#"{"format":"webp","includeAxes":true,"includeLabel":true,"includeScale":true,"views":[{"id":"front","label":"Front","phi":90,"theta":0},{"id":"top","label":"Top","phi":0,"theta":0}]}"#,
        )
        .expect("parse")
        .resolve()
        .expect("resolve");
        assert!(options.include_axes);
        assert!(options.include_label);
        assert!(options.include_scale);
        assert_eq!(views[0].label.as_deref(), Some("Front"));
        assert_eq!(format, ImageFormat::WebP);
        assert_eq!(views[0].id, "front");
        assert_eq!(views[1].id, "top");
    }

    #[test]
    fn rejects_invalid_singular_requests() {
        for json in [
            r#"{"width":15}"#,
            r#"{"margin":0.6}"#,
            r#"{"quality":1.5}"#,
            r#"{"up":"w"}"#,
            r#"{"projection":"fish-eye"}"#,
            r#"{"format":"gif"}"#,
            r#"{"background":[2.0,0.0,0.0,1.0]}"#,
            r#"{"zoomLevel":1.8}"#,
            r#"{"includeLabel":true}"#,
            r#"{"includeAxes":true,"width":191}"#,
            r#"{"label":"snowman ☃"}"#,
            "not json",
        ] {
            assert!(
                RenderRequest::from_json(json)
                    .and_then(|request| request.resolve())
                    .is_err(),
                "expected error for {json}"
            );
        }
    }

    #[test]
    fn rejects_invalid_plural_views_before_rendering() {
        for json in [
            r#"{"views":[]}"#,
            r#"{"views":[{"id":"../front","phi":90,"theta":0}]}"#,
            r#"{"views":[{"id":"front","phi":90,"theta":0},{"id":"front","phi":0,"theta":0}]}"#,
            r#"{"views":[{"id":"front","phi":90,"theta":0,"format":"png"}]}"#,
            r#"{"phi":90,"views":[{"id":"front","phi":90,"theta":0}]}"#,
            r#"{"includeLabel":true,"views":[{"id":"front","phi":90,"theta":0}]}"#,
        ] {
            assert!(
                RenderImagesRequest::from_json(json)
                    .and_then(|request| request.resolve())
                    .is_err(),
                "expected error for {json}"
            );
        }
    }
}
