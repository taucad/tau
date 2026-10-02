/**
 * Browser stand-in for `@resvg/resvg-js` (a native `.node` binding).
 *
 * `circuit-json-to-gltf@0.0.123` (tscircuit EDA kernel charter, T8) statically
 * imports the native binding from the `svg-to-png` chunk it loads whenever
 * `document` is undefined, i.e. inside the kernel worker. The kernel renders with
 * `boardTextureResolution: 0`, so that chunk never executes, but the bundler
 * cannot know that and fails on the `.node` file. `vite.config.ts` aliases the
 * package here so the reference resolves to a module that throws only if it is
 * ever actually reached.
 */

/** Throws on construction: the browser bundle never rasterizes SVG through native resvg. */
// oxlint-disable-next-line typescript/no-extraneous-class -- Upstream does `new Resvg(...)`; the stub must stay constructible.
export class Resvg {
  public constructor() {
    throw new Error('Native resvg (@resvg/resvg-js) is unavailable in the browser.');
  }
}
