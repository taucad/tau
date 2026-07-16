//! RGBA → PNG / lossless-WebP / JPEG encoders. All pure Rust so every
//! artifact (native, wasm, napi) produces byte-identical files from the same
//! pixels — jpeg-encoder's opt-in x86 `simd` feature stays off for the same
//! reason.

use crate::{RenderError, Rendered};

/// Output image format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    /// Lossless (VP8L) with alpha — `image-webp` does not encode lossy.
    WebP,
    /// Baseline JPEG, 4:4:4 chroma (subsampling smears colored edge lines).
    /// No alpha channel: render with an opaque `RenderOptions::background`.
    Jpeg {
        quality: u8,
    },
}

impl ImageFormat {
    /// Binding-facing parse; `quality` (0-100) applies to jpeg only.
    pub fn from_name(name: &str, quality: u8) -> Result<Self, RenderError> {
        match name {
            "png" => Ok(Self::Png),
            "webp" => Ok(Self::WebP),
            "jpeg" | "jpg" => Ok(Self::Jpeg { quality }),
            other => Err(RenderError::Encode(format!(
                "unknown image format {other:?}"
            ))),
        }
    }
}

/// Encode rendered RGBA pixels in the requested format.
pub fn encode(rendered: &Rendered, format: ImageFormat) -> Result<Vec<u8>, RenderError> {
    match format {
        ImageFormat::Png => encode_png(rendered),
        ImageFormat::WebP => encode_webp(rendered),
        ImageFormat::Jpeg { quality } => encode_jpeg(rendered, quality),
    }
}

/// Encode rendered RGBA pixels as PNG.
pub fn encode_png(rendered: &Rendered) -> Result<Vec<u8>, RenderError> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, rendered.width, rendered.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    writer
        .write_image_data(&rendered.rgba)
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    writer
        .finish()
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    Ok(out)
}

/// Encode rendered RGBA pixels as lossless WebP (alpha preserved).
pub fn encode_webp(rendered: &Rendered) -> Result<Vec<u8>, RenderError> {
    let mut out = Vec::new();
    image_webp::WebPEncoder::new(&mut out)
        .encode(
            &rendered.rgba,
            rendered.width,
            rendered.height,
            image_webp::ColorType::Rgba8,
        )
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    Ok(out)
}

/// Encode rendered RGBA pixels as baseline JPEG (no chroma subsampling).
///
/// JPEG has no alpha channel, so any translucent pixel is an error rather
/// than a silent black-background surprise — render with an opaque
/// `RenderOptions::background` first.
pub fn encode_jpeg(rendered: &Rendered, quality: u8) -> Result<Vec<u8>, RenderError> {
    if rendered
        .rgba
        .iter()
        .skip(3)
        .step_by(4)
        .any(|&alpha| alpha != 255)
    {
        return Err(RenderError::Encode(
            "jpeg has no alpha channel — render with an opaque background".into(),
        ));
    }
    let width = u16::try_from(rendered.width)
        .map_err(|_| RenderError::Encode("jpeg width exceeds 65535".into()))?;
    let height = u16::try_from(rendered.height)
        .map_err(|_| RenderError::Encode("jpeg height exceeds 65535".into()))?;
    let mut out = Vec::new();
    let mut encoder = jpeg_encoder::Encoder::new(&mut out, quality.min(100));
    encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_1_1);
    encoder
        .encode(&rendered.rgba, width, height, jpeg_encoder::ColorType::Rgba)
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 4x4 gradient with the given constant alpha.
    fn gradient(alpha: u8) -> Rendered {
        let (width, height) = (4u32, 4u32);
        let mut rgba = Vec::new();
        for y in 0..height {
            for x in 0..width {
                rgba.extend_from_slice(&[(x * 60) as u8, (y * 60) as u8, 128, alpha]);
            }
        }
        Rendered {
            rgba,
            width,
            height,
        }
    }

    #[test]
    fn webp_roundtrips_losslessly() {
        let rendered = gradient(200);
        let bytes = encode_webp(&rendered).expect("encode");
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        let mut decoder =
            image_webp::WebPDecoder::new(std::io::Cursor::new(&bytes)).expect("decoder");
        assert_eq!(decoder.dimensions(), (4, 4));
        let mut pixels = vec![0u8; decoder.output_buffer_size().expect("size")];
        decoder.read_image(&mut pixels).expect("decode");
        assert_eq!(pixels, rendered.rgba);
    }

    #[test]
    fn jpeg_encodes_opaque_and_rejects_translucent() {
        let bytes = encode_jpeg(&gradient(255), 85).expect("encode");
        assert_eq!(&bytes[..2], &[0xff, 0xd8]);
        let pixels = zune_jpeg::JpegDecoder::new(std::io::Cursor::new(bytes.as_slice()))
            .decode()
            .expect("decode");
        // Default zune-jpeg output is RGB: dims survived iff the length matches.
        assert_eq!(pixels.len(), 4 * 4 * 3);
        assert!(encode_jpeg(&gradient(254), 85).is_err());
    }

    #[test]
    fn parses_format_names() {
        assert!(matches!(
            ImageFormat::from_name("png", 85),
            Ok(ImageFormat::Png)
        ));
        assert!(matches!(
            ImageFormat::from_name("webp", 85),
            Ok(ImageFormat::WebP)
        ));
        assert!(matches!(
            ImageFormat::from_name("jpg", 80),
            Ok(ImageFormat::Jpeg { quality: 80 })
        ));
        assert!(ImageFormat::from_name("gif", 85).is_err());
    }
}
