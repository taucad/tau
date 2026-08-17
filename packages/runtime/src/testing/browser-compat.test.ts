/**
 * @vitest-environment jsdom
 *
 * Browser compatibility gate.
 * Verifies that the main entry point and key modules can be imported
 * without relying on Node.js-only APIs at import time.
 */

import { describe, it, expect } from 'vitest';
import type * as NextRuntimeModule from '#nextjs/index.js';

describe('Browser compatibility (jsdom)', () => {
  it('should import the main entry point without errors', async () => {
    const module_ = await import('#index.js');
    expect('presets' in module_).toBe(false);
    expect('createKernelSuccess' in module_).toBe(false);
    expect('createKernelError' in module_).toBe(false);
    expect(module_.fromFsLike).toBeTypeOf('function');
  }, 30_000);

  it('should import the browser client entry without in-process fallback exports', async () => {
    const module_ = await import('#client/index.js');

    expect(module_.createRuntimeClient).toBeTypeOf('function');
    expect('inProcessTransport' in module_).toBe(false);
  });

  it('should import the Next adapter entry without in-process fallback exports', async () => {
    const module_: typeof NextRuntimeModule = await import('#nextjs/index.js');
    const [headerConfig] = module_.nextRuntimeHeaders();

    expect(module_.withTauRuntime).toBeTypeOf('function');
    expect(headerConfig?.source).toBe('/:path*');
    expect(headerConfig?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ]),
    );
    expect('inProcessTransport' in module_).toBe(false);
  });

  it('should import the filesystem subpath without errors', async () => {
    const module_ = await import('#filesystem/index.js');
    expect(module_.fromMemoryFs).toBeTypeOf('function');
    expect(module_.fromFsLike).toBeTypeOf('function');
    expect(module_.fromFileSystemBridge).toBeTypeOf('function');
    expect(module_.fromBrowserFs).toBeTypeOf('function');
    expect(module_.isRuntimeFileSystem).toBeTypeOf('function');
  });

  it('should import the middleware entry point without errors', async () => {
    const module_ = await import('#middleware/runtime-middleware.js');
    expect(module_.defineMiddleware).toBeTypeOf('function');
    expect(module_.createMiddlewareRuntime).toBeTypeOf('function');
  });

  it('presets.all() should return valid plugin configuration', async () => {
    const { presets } = await import('#plugins/presets.js');
    const config = presets.all();

    expect(config.kernels).toBeInstanceOf(Array);
    expect(config.middleware).toBeInstanceOf(Array);
    expect(config.bundlers).toBeInstanceOf(Array);
    expect(config.kernels.length).toBeGreaterThan(0);
  }, 30_000);
});
