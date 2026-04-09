/**
 * ESM import smoke test.
 * Verifies that all public export paths resolve correctly.
 */

import { describe, it, expect } from 'vitest';

describe('ESM import smoke tests', () => {
  it('should resolve the main entry point', async () => {
    const module_ = await import('#index.js');
    expect(module_).toBeDefined();
    expect(module_.presets).toBeDefined();
    expect(module_.RuntimeWorkerClient).toBeTypeOf('function');
    expect(module_.createBridgePort).toBeTypeOf('function');
    expect(module_.fromFsLike).toBeTypeOf('function');
    expect(module_.createKernelSuccess).toBeTypeOf('function');
    expect(module_.createKernelError).toBeTypeOf('function');
    expect(module_.defineKernel).toBeTypeOf('function');
    expect(module_.defineBundler).toBeTypeOf('function');
  });

  it('should resolve the filesystem subpath', async () => {
    const module_ = await import('#filesystem/index.js');
    expect(module_).toBeDefined();
    expect(module_.exposeFileSystem).toBeTypeOf('function');
    expect(module_.createFileSystemBridge).toBeTypeOf('function');
    expect(module_.createBridgeServer).toBeTypeOf('function');
    expect(module_.createBridgeProxy).toBeTypeOf('function');
    expect(module_.createBridgePort).toBeTypeOf('function');
  });

  it('should resolve the middleware entry point', async () => {
    const module_ = await import('#middleware/runtime-middleware.js');
    expect(module_).toBeDefined();
    expect(module_.defineMiddleware).toBeTypeOf('function');
    expect(module_.createMiddlewareRuntime).toBeTypeOf('function');
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

    const opencascadeModule = await import('#kernels/opencascade/opencascade.kernel.js');
    expect(opencascadeModule.default).toBeDefined();

    const buerliModule = await import('#kernels/buerli/buerli.kernel.js');
    expect(buerliModule.default).toBeDefined();
  });

  it('should resolve the bundler module', async () => {
    const module_ = await import('#bundler/esbuild.bundler.js');
    expect(module_.default).toBeDefined();
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
    const module_ = await import('#testing/index.js');
    expect(module_).toBeDefined();
    expect(module_.createMockLogger).toBeTypeOf('function');
    expect(module_.createMockFileSystem).toBeTypeOf('function');
    expect(module_.createSuccessResult).toBeTypeOf('function');
    expect(module_.createErrorResult).toBeTypeOf('function');
  });
});
