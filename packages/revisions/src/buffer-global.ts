/**
 * The Node `Buffer` global `isomorphic-git` reads, installed in the realm that
 * calls it.
 *
 * `isomorphic-git` calls `Buffer.from`/`alloc`/`concat` on the global
 * (`isomorphic-git@1.38.5/index.js` :422, :663, :2577, and `FileSystem.read`
 * at :5079), and a browser realm has none. Each realm needs its own: the
 * file-manager worker and the revision compute worker are separate globals,
 * so an assignment in one does nothing for the other.
 *
 * A function rather than a side-effect import: the package is
 * `"sideEffects": false`, so a bundler drops a bare `import './buffer-global'`
 * and any top-level statement of a module whose exports go unused. That is how
 * the compute worker shipped without it: its bundle imports only
 * `serveComputeWorker`, so the assignment in the adapter never reached it, and
 * `FileSystem.read` swallowed the `ReferenceError` and handed `indexPack` a
 * `null` pack ("The pack does not index.").
 *
 * `node:`-less on purpose: Node resolves the bare specifier to its own builtin
 * and `??=` then keeps the global it already has, while a bundler resolves the
 * `buffer` package, which is the whole point.
 *
 * @module
 */

// oxlint-disable-next-line node-js/prefer-global/buffer, unicorn/prefer-node-protocol -- The global is exactly what is missing, and `node:buffer` has no browser build.
import { Buffer as BufferPolyfill } from 'buffer';

/**
 * Give this realm a `Buffer` global if it has none. Idempotent and cheap: call
 * it before any `isomorphic-git` call that may run in a fresh realm.
 */
export const installBufferGlobal = (): void => {
  /* `@types/node` types the global as always present; in a browser it is not. */
  const hostGlobals: { Buffer?: typeof BufferPolyfill } = globalThis;
  hostGlobals.Buffer ??= BufferPolyfill;
};
