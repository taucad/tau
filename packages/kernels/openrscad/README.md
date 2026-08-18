# @taucad/openrscad

OpenRSCAD Rust WebAssembly kernel for OpenSCAD-language models.

The package targets Tau's browser-worker, Node, and CLI runtimes. It supports nested `use`/`include` dependencies and OpenSCAD customizer parameters, renders deterministic authored-scene GLB, and exports deterministic GLB and object-aware 3MF.

The kernel publishes OpenRSCAD's native GLB bytes directly. User-authored module calls become nested, human-readable nodes; anonymous geometry falls back to exact hexadecimal material names. Preview rendering uses `renderToGlb`, including optional owner-local feature lines, while downloads use `exportShape3D`. 3MF keeps named physical manifold solids as build objects with per-triangle materials. Package export conditions select the browser or Node binding without environment-specific code in this kernel.

See `docs/research/openrscad-tau-workspace-benchmark.md` for compatibility and performance evidence, and `docs/research/language-kernel-selection-architecture.md` for the browser activation plan.
