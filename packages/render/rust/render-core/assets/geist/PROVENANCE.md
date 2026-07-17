# Geist Regular provenance

- Package: `geist@1.7.2`
- Source file: `dist/fonts/geist-sans/Geist-Regular.ttf`
- SHA-256: `5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615`
- License: SIL Open Font License 1.1 (`LICENSE.txt`)

`render-core/build.rs` rasterizes the documented repertoire with the pinned build-only `fontdue` 0.9.3 dependency. Cargo embeds only the generated coverage bytes and metrics from `OUT_DIR`; neither `fontdue` nor the TTF is linked into renderer WASM.
