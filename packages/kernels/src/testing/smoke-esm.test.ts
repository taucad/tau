/**
 * ESM import smoke test.
 * Verifies that all public export paths resolve correctly.
 */

import { describe, it, expect } from 'vitest';

describe('ESM import smoke tests', () => {
  it('should resolve the main entry point', async () => {
    const mod = await import('#index.js');
    expect(mod).toBeDefined();
    expect(mod.presets).toBeDefined();
    expect(mod.KernelWorkerClient).toBeTypeOf('function');
    expect(mod.createFileSystemPort).toBeTypeOf('function');
    expect(mod.fromZenFS).toBeTypeOf('function');
    expect(mod.createKernelSuccess).toBeTypeOf('function');
    expect(mod.createKernelError).toBeTypeOf('function');
    expect(mod.defineKernel).toBeTypeOf('function');
    expect(mod.defineBundler).toBeTypeOf('function');
  });

  it('should resolve the filesystem subpath', async () => {
    const mod = await import('#filesystem/index.js');
    expect(mod).toBeDefined();
    expect(mod.exposeFileSystem).toBeTypeOf('function');
    expect(mod.createFileSystemBridge).toBeTypeOf('function');
    expect(mod.createFileSystemServer).toBeTypeOf('function');
    expect(mod.createFileSystemProxy).toBeTypeOf('function');
    expect(mod.createFileSystemPort).toBeTypeOf('function');
    expect(mod.fromProxy).toBeTypeOf('function');
  });

  it('should resolve the middleware entry point', async () => {
    const mod = await import('#middleware/kernel-middleware.js');
    expect(mod).toBeDefined();
    expect(mod.defineMiddleware).toBeTypeOf('function');
    expect(mod.createMiddlewareRuntime).toBeTypeOf('function');
  });

  it('should resolve individual kernel modules', async () => {
    const replicad = await import('#kernels/replicad/replicad.kernel.js');
    expect(replicad.default).toBeDefined();

    const jscad = await import('#kernels/jscad/jscad.kernel.js');
    expect(jscad.default).toBeDefined();

    const manifold = await import('#kernels/manifold/manifold.kernel.js');
    expect(manifold.default).toBeDefined();

    const openscad = await import('#kernels/openscad/openscad.kernel.js');
    expect(openscad.default).toBeDefined();

    const tau = await import('#kernels/tau/tau.kernel.js');
    expect(tau.default).toBeDefined();
  });

  it('should resolve the bundler module', async () => {
    const mod = await import('#bundler/esbuild.bundler.js');
    expect(mod.default).toBeDefined();
  });

  it('should resolve middleware modules', async () => {
    const parameterCache = await import('#middleware/parameter-cache.middleware.js');
    expect(parameterCache.parameterCacheMiddleware).toBeDefined();

    const geoCache = await import('#middleware/geometry-cache.middleware.js');
    expect(geoCache.geometryCacheMiddleware).toBeDefined();

    const coordTransform = await import('#middleware/gltf-coordinate-transform.middleware.js');
    expect(coordTransform.gltfCoordinateTransformMiddleware).toBeDefined();

    const edgeDetection = await import('#middleware/gltf-edge-detection.middleware.js');
    expect(edgeDetection.gltfEdgeDetectionMiddleware).toBeDefined();
  });

  it('should resolve the testing entry point', async () => {
    const mod = await import('#testing/index.js');
    expect(mod).toBeDefined();
    expect(mod.createMockLogger).toBeTypeOf('function');
    expect(mod.createMockFilesystem).toBeTypeOf('function');
    expect(mod.createSuccessResult).toBeTypeOf('function');
    expect(mod.createErrorResult).toBeTypeOf('function');
  });
});
