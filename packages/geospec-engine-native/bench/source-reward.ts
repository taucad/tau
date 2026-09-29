import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { sha256 } from '#bench/lib';
import type { Artifact, BroadWorkloadPlan } from '#bench/lib';

/** Frozen source-to-reward input using the existing C2 public Node runtime composition. @internal */
export type SourceRewardInput = {
  projectRoot: string;
  worker: Artifact;
  loader: Artifact;
  manifest: Artifact;
  files: Artifact[];
  /** Each fresh runtime uses its default in-memory compute store; no persistent source cache is claimed. */
  cacheState: 'fresh-runtime-memory';
};
/** Narrow consumed shape of the dynamically selected public C2 export API, as for other installed benchmark APIs. @internal */
export type SourceExporter = (options: {
  descriptor: { kind: 'tau-project'; manifestPath: string; manifest: unknown; format: 'step' };
  createRuntime: () => Promise<unknown>;
}) => Promise<{
  success: boolean;
  issues: unknown;
  data?: { bytes: Uint8Array<ArrayBuffer>; frame: unknown; source: unknown; export: unknown };
}>;

/** Export real finalized STEP bytes before engine admission through the public C2 adapter.
 * @internal
 * @returns Updated subject input plus raw source/export provenance and separate export timing.
 */
export const produceSourceReward = async ({
  input,
  output,
  workload,
  exportArtifact,
}: {
  input: SourceRewardInput;
  output: string;
  workload: BroadWorkloadPlan;
  exportArtifact?: SourceExporter;
}): Promise<{ workload: BroadWorkloadPlan; receipt: Record<string, unknown> }> => {
  const started = process.hrtime.bigint();
  class RuntimeWorker extends Worker {
    public constructor(url: string | URL) {
      super(url, { execArgv: ['--import', input.loader.path] });
    }
  }
  if (resolve(input.manifest.path) !== resolve(input.projectRoot, 'tau.json')) {
    throw new Error('Source-to-reward manifest must be the selected project tau.json.');
  }
  const requireProject = createRequire(new URL('../../geospec/package.json', import.meta.url));
  const { parseProjectManifestBytes } = (await import(requireProject.resolve('@taucad/project-core'))) as {
    parseProjectManifestBytes: (bytes: Uint8Array<ArrayBuffer>) => { success: boolean; data?: unknown };
  };
  const exportProject =
    exportArtifact ??
    ((await import(requireProject.resolve('geospec/config'))) as { exportTauProjectArtifact: SourceExporter })
      .exportTauProjectArtifact;
  if (workload.subject.format !== 'step') {
    throw new Error('Source-to-reward requires a declared fresh-memory STEP profile.');
  }
  await mkdir(output); // Exclusive per-invocation output; accepted bytes are never overwritten.
  const parsed = parseProjectManifestBytes(Uint8Array.from(await readFile(input.manifest.path)));
  if (!parsed.success) {
    throw new Error('Source-to-reward Tau manifest is invalid.');
  }
  let lifetimes = 0;
  const result = await exportProject({
    descriptor: { kind: 'tau-project', manifestPath: 'tau.json', manifest: parsed.data, format: 'step' },
    createRuntime: async () => {
      lifetimes += 1;
      const client = (await import(requireProject.resolve('@taucad/runtime/client'))) as {
        createRuntimeClient: (options: { transport: unknown }) => unknown;
      };
      const filesystem = (await import(requireProject.resolve('@taucad/runtime/filesystem/node'))) as {
        fromNodeFs: (root: string) => unknown;
      };
      const transport = (await import(requireProject.resolve('@taucad/runtime/transport/node'))) as {
        nodeWorkerTransport: (options: { url: URL; fileSystem: unknown; workerCtor: typeof RuntimeWorker }) => unknown;
      };
      return client.createRuntimeClient({
        transport: transport.nodeWorkerTransport({
          url: pathToFileURL(input.worker.path),
          fileSystem: filesystem.fromNodeFs(input.projectRoot),
          workerCtor: RuntimeWorker,
        }),
      });
    },
  });
  const exportNs = Number(process.hrtime.bigint() - started);
  if (!result.success || !result.data) {
    throw new Error(`Source-to-reward export failed: ${JSON.stringify(result.issues)}`);
  }
  const primary = {
    path: resolve(output, 'artifact.step'),
    sha256: sha256(result.data.bytes),
    bytes: result.data.bytes.byteLength,
  };
  await writeFile(primary.path, result.data.bytes, { flag: 'wx' });
  const receipt = {
    exportNs,
    lifetimes,
    artifact: primary,
    frame: result.data.frame,
    source: result.data.source,
    export: result.data.export,
    cacheState: input.cacheState,
    rawHeadersPreserved: true,
    moduleResolution: Object.fromEntries(
      [
        '@taucad/project-core',
        'geospec/config',
        '@taucad/runtime/client',
        '@taucad/runtime/filesystem/node',
        '@taucad/runtime/transport/node',
      ].map((specifier) => [specifier, requireProject.resolve(specifier)]),
    ),
  };
  await writeFile(resolve(output, 'export.json'), JSON.stringify(receipt), { flag: 'wx' });
  return { workload: { ...workload, subject: { ...workload.subject, primary, resources: [] } }, receipt };
};
