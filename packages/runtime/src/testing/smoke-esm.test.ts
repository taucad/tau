/**
 * ESM import smoke test.
 * Verifies that all public export paths resolve correctly.
 */

import { describe, it, expect } from 'vitest';

const expectNoDefaultExport = (module_: Record<string, unknown>): void => {
  expect(Object.hasOwn(module_, 'default')).toBe(false);
};

const expectNamedOnlyFactory = (module_: Record<string, unknown>, exportName: string): void => {
  expect(module_[exportName]).toEqual(expect.any(Function));
  expectNoDefaultExport(module_);
};

describe('ESM import smoke tests', () => {
  it('should resolve the main entry point', async () => {
    const module_ = await import('#index.js');
    expect(module_).toBeDefined();
    expect('presets' in module_).toBe(false);
    expect(module_.fromFsLike).toBeTypeOf('function');
    expect(module_.createKernelSuccess).toBeTypeOf('function');
    expect(module_.createKernelError).toBeTypeOf('function');
    expect(module_.defineKernel).toBeTypeOf('function');
    expect(module_.defineBundler).toBeTypeOf('function');
  });

  it('should resolve presets from the dedicated presets subpath', async () => {
    const module_ = await import('#plugins/presets.js');
    expect(module_.presets.all().kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining(['replicad', 'opencascade', 'jscad']),
    );
  });

  it('should resolve the filesystem subpath', async () => {
    const module_ = await import('#filesystem/index.js');
    expect(module_).toBeDefined();
    expect(module_.fromMemoryFs).toBeTypeOf('function');
    expect(module_.fromFsLike).toBeTypeOf('function');
    expect(module_.fromFileSystemBridge).toBeTypeOf('function');
    expect(module_.fromBrowserFs).toBeTypeOf('function');
    expect(module_.createRuntimeFileSystem).toBeTypeOf('function');
    expect(module_.isRuntimeFileSystem).toBeTypeOf('function');
  });

  it('should resolve the transport-internals subpath', async () => {
    const module_ = await import('#transport-internals.js');
    expect(module_).toBeDefined();
    expect(module_.wrapMessagePort).toBeTypeOf('function');
    expect(module_.extractInlineFileSystem).toBeTypeOf('function');
  });

  it('should resolve the middleware entry point', async () => {
    const module_ = await import('#middleware/runtime-middleware.js');
    expect(module_).toBeDefined();
    expect(module_.defineMiddleware).toBeTypeOf('function');
    expect(module_.createMiddlewareRuntime).toBeTypeOf('function');
  });

  it('should resolve individual kernel modules', async () => {
    const replicad = await import('#kernels/replicad/replicad.kernel.js');
    expect(replicad.replicad).toEqual(expect.any(Function));
    expectNoDefaultExport(replicad);

    const jscad = await import('#kernels/jscad/jscad.kernel.js');
    expect(jscad.jscad).toEqual(expect.any(Function));
    expectNoDefaultExport(jscad);

    const manifold = await import('#kernels/manifold/manifold.kernel.js');
    expect(manifold.manifold).toEqual(expect.any(Function));
    expectNoDefaultExport(manifold);

    const tau = await import('#kernels/tau/tau.kernel.js');
    expect(tau.tau).toEqual(expect.any(Function));
    expectNoDefaultExport(tau);

    const opencascadeModule = await import('#kernels/opencascade/opencascade.kernel.js');
    expect(opencascadeModule.opencascade).toEqual(expect.any(Function));
    expectNoDefaultExport(opencascadeModule);

    const zoo = await import('#kernels/zoo/zoo.kernel.js');
    expect(zoo.zoo).toEqual(expect.any(Function));
    expectNoDefaultExport(zoo);
  });

  it('should resolve the bundler module', async () => {
    const module_ = await import('#bundler/esbuild.bundler.js');
    expect(module_.esbuild).toEqual(expect.any(Function));
    expectNoDefaultExport(module_);
  });

  it('should resolve the transcoder module', async () => {
    const module_ = await import('#transcoders/converter/converter.transcoder.js');
    expect(module_.converterTranscoder).toEqual(expect.any(Function));
    expectNoDefaultExport(module_);
  });

  it('should resolve public plugin subpaths as named-only modules', async () => {
    const publicModules = [
      { module: await import('@taucad/runtime/kernels/replicad'), exportName: 'replicad' },
      { module: await import('@taucad/runtime/kernels/jscad'), exportName: 'jscad' },
      { module: await import('@taucad/runtime/kernels/manifold'), exportName: 'manifold' },
      { module: await import('@taucad/runtime/kernels/opencascade'), exportName: 'opencascade' },
      { module: await import('@taucad/runtime/kernels/tau'), exportName: 'tau' },
      { module: await import('@taucad/runtime/kernels/zoo'), exportName: 'zoo' },
      { module: await import('@taucad/runtime/bundler/esbuild'), exportName: 'esbuild' },
      { module: await import('@taucad/runtime/transcoder'), exportName: 'converterTranscoder' },
    ] as const;

    for (const { module, exportName } of publicModules) {
      expectNamedOnlyFactory(module, exportName);
    }
  });

  it('should resolve middleware modules', async () => {
    const parameterCache = await import('#middleware/parameter-cache.middleware.js');
    expect(parameterCache.parameterCache).toEqual(expect.any(Function));

    const geoCache = await import('#middleware/geometry-cache.middleware.js');
    expect(geoCache.geometryCache).toEqual(expect.any(Function));

    const coordTransform = await import('#middleware/gltf-coordinate-transform.middleware.js');
    expect(coordTransform.gltfCoordinateTransform).toEqual(expect.any(Function));

    const edgeDetection = await import('#middleware/gltf-edge-detection.middleware.js');
    expect(edgeDetection.gltfEdgeDetection).toEqual(expect.any(Function));
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
