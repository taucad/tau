import type { KernelServices } from '@taucad/runtime/kernel';
import { contentDigest } from '@taucad/cache-core';
import { bindDotnetKernel, createDotnetWorkspaceMirror } from '@taucad/dotnet-kernel-core';
import { withNativeDeployment } from '@taucad/native-process-core/adopter';
import { createComputeWorkerTransport } from '#compute-worker-transport.js';
import { createPicogkKernelDefinition } from '#picogk-kernel-definition.js';
import { PicogkSession } from '#picogk-session.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';
import { picogkNative } from '#native.js';

const picogkKernelDefinition = createPicogkKernelDefinition({
  optionsSchema: picogkOptionsSchema,
  version: '2.5.2+dotnet10.roslyn5.9.host22.protocol8.material2.mechanism2.compute1.meshing2',
  cancellation: 'cooperative',
  // The desktop worker collects the author's own STL and VDB files, as the browser worker does, so
  // both runtimes offer the same exports. A published layer built before it reports none, and this
  // kernel then offers none rather than an export it cannot serve.
  authoredOutputs: true,
  async initialize(options, services) {
    // Late binding: an explicit closure, else the sealed closure the host's resolver or the payload store gives. An
    // unprepared kernel throws KERNEL_NOT_PREPARED here, and the runtime retries on the next operation.
    const { options: bound } = await bindDotnetKernel({ adopter: picogkNative, options });
    const mirror = await createDotnetWorkspaceMirror({
      temporaryPrefix: 'tau-picogk-',
      displayName: 'PicoGK',
      excludedPaths: ['thumbnail.webp'],
    });
    const session = new PicogkSession({
      ...bound,
      ...mirror,
      logger: services.logger,
    });
    const computeTransport = createComputeWorkerTransport({
      producer: {
        id: 'picogk',
        version: 'operation-v1.codec2.layout1',
        implementationAssets: [bound.workerSha256, ...bound.resourceFiles.map(({ sha256 }) => sha256)]
          .sort()
          .map((hash) => contentDigest({ value: `sha256:${hash.toLowerCase()}` })),
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        endian: 'little',
        arithmetic: 'float32-ordered',
        archive: 'openvdb-8.1.0-seekless-uuid21',
        layout: 'tau-vertex-normals-v3.tau-surface-coordinates-v1',
      },
      maxEncodedBytes: 256 * 1024 * 1024,
      maxNativeBytes: 256 * 1024 * 1024,
      maxEntries: 4096,
    });
    return {
      mirror: {
        sync: async (current: KernelServices) =>
          mirror.sync(current.filesystem, current.fileContentCache, current.operationId),
        cleanup: async () => mirror.cleanup(),
      },
      session,
      computeTransport,
      artifactPath: mirror.artifactPath,
    };
  },
});

/**
 * The `picogk` kernel capability. Every registration carries `picogkNative`, so a host that lists the plugin in a runtime
 * definition prepares and binds the kernel from the definition alone.
 * @public
 */
export const picogkKernel = withNativeDeployment(picogkKernelDefinition, picogkNative);
