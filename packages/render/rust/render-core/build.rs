use std::fmt::Write;
use std::fs;
use std::path::PathBuf;

const FONT_PATH: &str = "assets/geist/Geist-Regular.ttf";
const SOURCE_SIZE: f32 = 48.0;
const EXTRA_CHARACTERS: [char; 3] = ['µ', '—', '−'];

fn fnv64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn main() {
    for path in [FONT_PATH, "build.rs"] {
        println!("cargo:rerun-if-changed={path}");
    }
    let font_bytes = fs::read(FONT_PATH).expect("read pinned Geist font");
    let font = fontdue::Font::from_bytes(
        font_bytes.as_slice(),
        fontdue::FontSettings {
            scale: SOURCE_SIZE,
            ..fontdue::FontSettings::default()
        },
    )
    .expect("parse pinned Geist font");
    let characters = (0x20_u32..=0x7e)
        .map(|code| char::from_u32(code).expect("printable ASCII"))
        .chain(EXTRA_CHARACTERS)
        .collect::<Vec<_>>();
    let mut pixels = Vec::new();
    let mut glyphs = String::new();
    for character in characters {
        assert_ne!(
            font.lookup_glyph_index(character),
            0,
            "Geist is missing declared character U+{:04X}",
            u32::from(character)
        );
        let (metrics, coverage) = font.rasterize(character, SOURCE_SIZE);
        let offset = pixels.len();
        pixels.extend_from_slice(&coverage);
        writeln!(
            glyphs,
            "Glyph {{ code: {}, offset: {offset}, width: {}, height: {}, xmin: {}, ymin: {}, advance: {:?}f32 }},",
            u32::from(character),
            metrics.width,
            metrics.height,
            metrics.xmin,
            metrics.ymin,
            metrics.advance_width,
        )
        .expect("write glyph");
    }
    let packed_pixels = pixels
        .chunks(2)
        .map(|pair| {
            let high = ((u16::from(pair[0]) + 8) / 17).min(15) as u8;
            let low = pair
                .get(1)
                .map(|value| ((u16::from(*value) + 8) / 17).min(15) as u8)
                .unwrap_or(0);
            (high << 4) | low
        })
        .collect::<Vec<_>>();
    let generator_bytes = fs::read("build.rs").expect("read capture font generator");

    let generated = format!(
        "pub const FONTDUE_VERSION: &str = \"0.9.3\";\n\
         pub const FONT_GENERATOR_FNV: u64 = {:#x};\n\
         pub const FONT_SOURCE_FNV: u64 = {:#x};\n\
         pub const FONT_ATLAS_FNV: u64 = {:#x};\n\
         pub const FONT_SOURCE_SIZE: f32 = {SOURCE_SIZE:?};\n\
         pub static FONT_GLYPHS: &[Glyph] = &[{glyphs}];\n\
         pub static FONT_PIXELS: &[u8] = &{packed_pixels:?};\n",
        fnv64(&generator_bytes),
        fnv64(&font_bytes),
        fnv64(&packed_pixels),
    );
    let output =
        PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR")).join("capture_font.rs");
    fs::write(output, generated).expect("write generated capture font");
}
