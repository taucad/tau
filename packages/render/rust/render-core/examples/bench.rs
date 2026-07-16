//! Native codec benchmark: renders a GLB at the current thumbnail size and
//! historical comparison sizes, then
//! times each encoder (`bench_encodes`). Prints one JSON object to stdout;
//! progress goes to stderr.
//!
//! Usage: cargo run --release -p render-core --example bench -- <in.glb>

fn main() {
    let glb_path = std::env::args().nth(1).expect("usage: bench <in.glb>");
    let glb = std::fs::read(&glb_path).expect("read glb");
    let adapter = pollster::block_on(render_core::describe_adapter()).expect("adapter");
    eprintln!("adapter: {adapter}");

    let epoch = std::time::Instant::now();
    let now = move || epoch.elapsed().as_secs_f64() * 1000.0;
    let mut results = Vec::new();
    for (width, height) in [
        (640, 360),
        (768, 576),
        (1280, 720),
        (1920, 1080),
        (2560, 1440),
        (3840, 2160),
    ] {
        let options = render_core::RenderOptions {
            width,
            height,
            background: Some([1.0, 1.0, 1.0, 1.0]),
            ..Default::default()
        };
        let started = std::time::Instant::now();
        let rendered =
            pollster::block_on(render_core::render_glb_to_rgba(&glb, &options)).expect("render");
        let render_ms = started.elapsed().as_secs_f64() * 1000.0;
        let mut report = render_core::bench_encodes(&rendered, &now).expect("bench");
        report["renderMs"] = ((render_ms * 100.0).round() / 100.0).into();
        eprintln!("{width}x{height} done");
        results.push(report);
    }
    let multi_view = pollster::block_on(render_core::bench_multi_view(&glb, 768, 432, &now))
        .expect("multi-view benchmark");
    println!(
        "{}",
        serde_json::json!({ "adapter": adapter, "results": results, "multiView": multi_view })
    );
}
