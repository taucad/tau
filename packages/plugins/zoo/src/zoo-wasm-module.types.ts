/**
 * The KCL WASM module type, loaded via dynamic import.
 *
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() required for module type
export type WasmModule = typeof import('@taucad/kcl-wasm-lib');
