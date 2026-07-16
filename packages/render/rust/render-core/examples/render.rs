//! Native spike harness: render a kernel GLB to an image on the local GPU.
//! Format follows the output extension (.png / .webp / .jpg|.jpeg — jpeg
//! defaults to a white background).
//!
//! Usage: cargo run --release -p render-core --example render -- <in.glb> <out.{png,webp,jpg}> [width height] [line_width]

fn main() {
    let mut args = std::env::args().skip(1);
    let usage = "usage: render <in.glb> <out.{png,webp,jpg}> [width height] [line_width]";
    let input = args.next().expect(usage);
    let output = args.next().expect(usage);
    let mut options = render_core::RenderOptions::default();
    if let (Some(width), Some(height)) = (args.next(), args.next()) {
        options.width = width.parse().expect("width");
        options.height = height.parse().expect("height");
    }
    if let Some(line_width) = args.next() {
        options.line_width = line_width.parse().expect("line_width");
    }

    let extension = output
        .rsplit_once('.')
        .map(|(_, extension)| extension)
        .unwrap_or("png");
    let format = render_core::ImageFormat::from_name(extension, 85).expect("format from extension");
    if matches!(format, render_core::ImageFormat::Jpeg { .. }) && options.background.is_none() {
        options.background = Some([1.0, 1.0, 1.0, 1.0]);
    }

    let adapter = pollster::block_on(render_core::describe_adapter()).expect("adapter");
    eprintln!("adapter: {adapter}");

    let glb = std::fs::read(&input).expect("read glb");
    let started = std::time::Instant::now();
    let bytes = pollster::block_on(render_core::render_glb_to_image(&glb, &options, format))
        .expect("render");
    eprintln!(
        "rendered {}x{} in {:?}",
        options.width,
        options.height,
        started.elapsed()
    );

    std::fs::write(&output, &bytes).expect("write image");
    eprintln!("wrote {output} ({} bytes)", bytes.len());
}
