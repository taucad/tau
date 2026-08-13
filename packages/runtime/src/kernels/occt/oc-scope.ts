/**
 * Exception-safe disposal scope for embind-owned OCCT handles.
 *
 * Every `new oc.X()` allocates in the WASM heap and is freed only by an explicit
 * `.delete()`. A throw between allocation and a trailing delete sequence strands
 * the whole batch, and a WASM heap never shrinks — stranded bytes stay lost for
 * the lifetime of the module. Track handles as they are created, dispose the
 * scope in a `finally`.
 *
 * See docs/policy/resource-cleanup-policy.md.
 */

/** Embind-owned WASM object with a manual destructor. */
export type OcHandle = { delete(): void };

/**
 * Disposal scope for the embind handles created inside one function body or
 * loop iteration.
 * @internal
 */
export type OcScope = {
  /** Track a handle for disposal and return it unchanged. */
  track: <T extends OcHandle>(handle: T) => T;
  /** Delete every tracked handle, newest first. Idempotent. */
  dispose: () => void;
};

/**
 * Create a disposal scope for embind handles.
 *
 * @returns a scope whose `dispose` deletes everything tracked through it.
 * @internal
 */
export function createOcScope(): OcScope {
  const handles: OcHandle[] = [];

  return {
    track(handle) {
      handles.push(handle);
      return handle;
    },
    dispose() {
      // Newest first mirrors construction order. A failed delete must neither
      // strand the remaining handles nor replace an in-flight exception, so
      // each one is best-effort.
      for (let index = handles.length - 1; index >= 0; index--) {
        try {
          handles[index]!.delete();
        } catch {
          // Handle already released, or the module is being torn down.
        }
      }
      handles.length = 0;
    },
  };
}
