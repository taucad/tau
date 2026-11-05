/**
 * Browser stand-in for `@resvg/resvg-js` (a native `.node` binding).
 *
 * `circuit-json-to-gltf@0.0.123` (tscircuit EDA kernel charter, T8) imports the
 * native binding from the `svg-to-png` chunk it picks whenever `document` is
 * undefined, i.e. inside the kernel worker. `vite.config.ts` redirects that chunk
 * to the kernel's resvg-wasm rasterizer, so nothing should reach this module; it
 * stays so that a converter bump which renames the chunk fails at the binding
 * rather than failing the bundle on the `.node` file.
 */

/** Throws on construction: the browser bundle never rasterizes SVG through native resvg. */
// oxlint-disable-next-line typescript/no-extraneous-class -- Upstream does `new Resvg(...)`; the stub must stay constructible.
export class Resvg {
  public constructor() {
    throw new Error('Native resvg (@resvg/resvg-js) is unavailable in the browser.');
  }
}
