/* tslint:disable */
/* eslint-disable */

/** Render ordered identified views through one batch-scoped render session. */
export function render_glb_to_images(glb: Uint8Array, options_json: string): Promise<Array<Uint8Array>>;

/**
 * Benchmark the codec encoders over one render (white background so JPEG
 * participates): JSON report with per-format avg ms / bytes / FNV-1a
 * fingerprints for cross-artifact byte-identity checks.
 */
export function bench_codecs(glb: Uint8Array, width: number, height: number): Promise<string>;

/**
 * Compare six singular calls with one six-view batch.
 */
export function bench_multi_view(glb: Uint8Array, width: number, height: number): Promise<string>;

/**
 * GPU-independent PNG/WebP/JPEG fingerprints for native/wasm conformance.
 */
export function codec_conformance(): string;

/**
 * Backend + device name of the adapter the browser hands us.
 */
export function describe_adapter(): Promise<string>;

/**
 * Render a kernel GLB to encoded image bytes. `options_json` is the shared
 * render-request contract (`render_core::RenderRequest`): width/height,
 * format `"png" | "webp" | "jpeg" | "jpg"`, quality 0..=1, phi/theta degrees,
 * margin 0..=0.5, up `"x" | "y" | "z"`, background `[r, g, b, a]` in 0..=1.
 */
export function render_glb_to_image(glb: Uint8Array, options_json: string): Promise<Uint8Array>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly render_glb_to_image: (a: number, b: number, c: number, d: number) => number;
  readonly render_glb_to_images: (a: number, b: number, c: number, d: number) => number;
  readonly bench_codecs: (a: number, b: number, c: number, d: number) => number;
  readonly bench_multi_view: (a: number, b: number, c: number, d: number) => number;
  readonly codec_conformance: (a: number) => void;
  readonly describe_adapter: () => number;
  readonly __wasm_bindgen_func_elem_650: (a: number, b: number, c: number, d: number) => void;
  readonly __wasm_bindgen_func_elem_650_1: (a: number, b: number, c: number, d: number) => void;
  readonly __wasm_bindgen_func_elem_650_2: (a: number, b: number, c: number, d: number) => void;
  readonly __wasm_bindgen_func_elem_650_3: (a: number, b: number, c: number, d: number) => void;
  readonly __wasm_bindgen_func_elem_900: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
  readonly __wbindgen_export4: (a: number, b: number) => void;
  readonly __wbindgen_export5: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
