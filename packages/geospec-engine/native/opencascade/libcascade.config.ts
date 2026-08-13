/**
 * GeoSpec's custom OpenCascade WASM build, expressed for `@libcascade/toolchain`.
 *
 * Replaces the hand-written build config and the `geospec:build-wasm` docker
 * one-liner: `libcascade build` renders
 * `.libcascade/geospec_opencascade_single.yml` from this file and
 * `libcascade assemble` generates the `./init` factory next to the artifacts
 * in `dist/`.
 *
 * GeoSpec* custom classes only (lazy-evidence blueprint R6). JS consumes a
 * coarse whole-claim-in/whole-verdict-out surface (geospec-policy §18); the
 * OCCT autobindings that used to sit here were dead glue: nothing in TS ever
 * called them, and each binding symbol costs one full recompile of every
 * wrapper source at link time (the binder compiles each bound symbol as its own
 * TU containing ALL wrapper files — blueprint C2). Wrapper hygiene rule that
 * follows from that TU model: cross-wrapper globals must be
 * `__attribute__((weak))` (strong = duplicate symbol, static = silently
 * per-TU).
 */
import { defineBuild } from '@libcascade/toolchain';

export default defineBuild({
  name: 'geospec_opencascade',
  bindings: ['GeoSpecXdeReadResult', 'GeoSpecXdeReader'],
  customBindings: [
    {
      file: 'wrappers/geospec-xde-reader.cpp',
      symbols: ['GeoSpecXdeReadResult', 'GeoSpecXdeReader'],
    },
  ],
  /* eslint-disable @typescript-eslint/naming-convention -- Emcc `-s` setting names are SCREAMING_SNAKE by definition: these are the toolchain's generated `EmccSettings` keys, not identifiers we choose. */
  settings: {
    MODULARIZE: true,
    EXPORT_ES6: true,
    WASM_BIGINT: true,
    EVAL_CTORS: 2,
    ALLOW_MEMORY_GROWTH: true,
    INITIAL_MEMORY: '100MB',
    MAXIMUM_MEMORY: '4GB',
    // Emsdk 6.0.5 migration (opencascade.js 7734d9d): -sEXPORT_EXCEPTION_HANDLING_HELPERS
    // is replaced by exporting the three exception helpers directly, and the
    // link pipeline hard-fails on -fwasm-exceptions without them. Same delta
    // the upstream full.yml and replicad's config received.
    EXPORTED_RUNTIME_METHODS: [
      'HEAP32',
      'HEAPF64',
      'FS',
      'getExceptionMessage',
      'incrementExceptionRefcount',
      'decrementExceptionRefcount',
    ],
    EXPORTED_FUNCTIONS: ['_malloc', '_free'],
    // Mimalloc: ~4.6% geomean / ~8.6% on boolean-heavy OCCT work for a flag
    // (lazy-evidence blueprint R6, per the ocjs benchmark survey).
    MALLOC: 'mimalloc',
    // The XDE wrapper's commonVolume proof uses BRepAlgoAPI_Common internally,
    // which pulls OCCT OSD_MemInfo and its glibc mallinfo reference. The wasm
    // path never calls that reporter; allow Emscripten's dormant
    // missing-function stub for this custom Boolean-analysis build.
    ERROR_ON_UNDEFINED_SYMBOLS: false,
  },
  /* eslint-enable @typescript-eslint/naming-convention -- Back to normal identifier rules. */
  compilerFlags: { lto: true, optimize: 'O3', exceptions: 'wasm', simd: true, noEntry: true },
  // N=1: single-threaded only. GeoSpec runs Node-side and fans out with
  // worker_threads, not with pthreads inside one instance.
  variants: [{ name: 'single' }],
});
