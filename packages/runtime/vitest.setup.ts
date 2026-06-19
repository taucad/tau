import { vi } from 'vitest';

vi.stubGlobal('fetch', vi.fn());

// ESBuild-wasm checks that TextEncoder returns this realm's Uint8Array.
// Jsdom can mix Node's TextEncoder with jsdom's typed-array constructors,
// which fails that invariant before browser-side runtime import tests can
// inspect the package graph.
// eslint-disable-next-line @typescript-eslint/naming-convention -- constructor alias intentionally remains PascalCase for `new`.
const NativeTextEncoder = globalThis.TextEncoder;
if (typeof NativeTextEncoder === 'function' && !(new NativeTextEncoder().encode('') instanceof Uint8Array)) {
  class RealmSafeTextEncoder extends NativeTextEncoder {
    public override encode(input?: string): Uint8Array<ArrayBuffer> {
      return new Uint8Array(super.encode(input));
    }
  }

  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: RealmSafeTextEncoder,
  });
}
