import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { defineJobProvider } from '@taucad/jobs';
import type { JobArtifactManifest, JobJsonObject, JobJsonValue, JobProvider, JobProviderRuntime } from '@taucad/jobs';

import { openFoamContainerImages, openFoamJobType } from '#openfoam-definition.js';
import type { OpenFoamJobOptions, OpenFoamJobPreset, OpenFoamSolverVersion } from '#openfoam-definition.js';
import {
  digestOpenFoamWorkspace,
  evaluateOpenFoamStage,
  openFoamContainerPolicy,
  openFoamExecutionProviderVersion,
  resolveOpenFoamContainerUser,
} from '#openfoam-stage-cache.js';
import type { OpenFoamContainerUser } from '#openfoam-stage-cache.js';
import { writeFileArtifact, writeJsonArtifact, writeTextArtifact } from '#solver-artifacts.js';
import {
  assertImmutableContainerImageReference,
  createSolverAttemptWorkspace,
  defaultSolverWorkspaceRoot,
  removeSolverAttemptWorkspace,
} from '#solver-host.js';
import type { SolverInputMaterializer, SolverProcessExecutor } from '#solver-host.js';

const solverProcessOutputLimit = 64 * 1024 * 1024;

/** Native host configuration for the OpenFOAM provider. @public */
export type OpenFoamJobProviderOptions = {
  readonly executor: SolverProcessExecutor;
  readonly inputMaterializer: SolverInputMaterializer;
  readonly workspaceRoot?: string;
  /** Milliseconds allowed for graceful process and container shutdown. */
  readonly terminationGrace?: number;
  readonly images?: Readonly<Partial<Record<OpenFoamSolverVersion, string>>>;
};

type OpenFoamStage = { readonly name: string; readonly command: string; readonly arguments: readonly string[] };

class OpenFoamStageCancelledError extends Error {}

class OpenFoamStageFailedError extends Error {
  public readonly stage: string;
  public readonly exitCode: number;

  public constructor(stage: string, exitCode: number) {
    super(`OpenFOAM stage ${stage} exited with code ${String(exitCode)}.`);
    this.stage = stage;
    this.exitCode = exitCode;
  }
}

const presetStages = (options: OpenFoamJobOptions): readonly OpenFoamStage[] => {
  const prefix: readonly OpenFoamStage[] =
    options.preset === 'snappy-simple-foam'
      ? [
          { name: 'block-mesh', command: 'blockMesh', arguments: [] },
          { name: 'surface-features', command: 'surfaceFeatures', arguments: [] },
          { name: 'snappy-hex-mesh', command: 'snappyHexMesh', arguments: ['-overwrite'] },
          { name: 'check-mesh', command: 'checkMesh', arguments: [] },
        ]
      : [
          { name: 'block-mesh', command: 'blockMesh', arguments: [] },
          { name: 'check-mesh', command: 'checkMesh', arguments: [] },
        ];
  const solver = options.preset === 'block-rho-central-foam' ? 'rhoCentralFoam' : 'simpleFoam';
  if (options.ranks === 1) {
    return [...prefix, { name: 'solve', command: solver, arguments: [] }];
  }
  return [
    ...prefix,
    { name: 'decompose', command: 'decomposePar', arguments: ['-force'] },
    {
      name: 'solve-parallel',
      command: 'mpirun',
      arguments: ['-np', String(options.ranks), solver, '-parallel'],
    },
    { name: 'reconstruct', command: 'reconstructPar', arguments: [] },
  ];
};

const dockerUserArguments = (user: OpenFoamContainerUser): readonly string[] => {
  if (user.mode === 'container-default') {
    return [];
  }
  return ['--user', `${String(user.uid)}:${String(user.gid)}`];
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const executeStage = async (input: {
  readonly stage: OpenFoamStage;
  readonly image: string;
  readonly casePath: string;
  readonly logPath: string;
  readonly executor: SolverProcessExecutor;
  readonly signal: AbortSignal;
  readonly terminationGrace: number;
  readonly cpus: number;
  readonly containerUser: OpenFoamContainerUser;
}): Promise<{ readonly status: 'cancelled' } | { readonly status: 'exited'; readonly exitCode: number }> => {
  const containerName = `tau-openfoam-${randomUUID()}`;
  await appendFile(input.logPath, `\n## ${input.stage.name}\n`, 'utf8');
  const result = await input.executor.execute({
    executable: openFoamContainerPolicy.executable,
    arguments: [
      'run',
      '--rm',
      '--name',
      containerName,
      '--network',
      openFoamContainerPolicy.network,
      '--cpus',
      String(input.cpus),
      '--memory',
      openFoamContainerPolicy.memory,
      '--pids-limit',
      String(openFoamContainerPolicy.processLimit),
      '--read-only',
      '--cap-drop',
      openFoamContainerPolicy.capabilitiesDrop[0],
      '--security-opt',
      openFoamContainerPolicy.securityOptions[0],
      '--tmpfs',
      openFoamContainerPolicy.temporaryFilesystems[0],
      '--volume',
      `${input.casePath}:${openFoamContainerPolicy.casePath}`,
      '--workdir',
      openFoamContainerPolicy.workdir,
      ...dockerUserArguments(input.containerUser),
      '--env',
      `HOME=${openFoamContainerPolicy.home}`,
      '--entrypoint',
      openFoamContainerPolicy.entrypoint,
      input.image,
      input.stage.command,
      ...input.stage.arguments,
      '-case',
      openFoamContainerPolicy.casePath,
    ],
    cwd: input.casePath,
    environment: {},
    signal: input.signal,
    terminationGrace: input.terminationGrace,
    outputLimit: solverProcessOutputLimit,
    container: { engine: 'docker', name: containerName },
    async onOutput(output) {
      await appendFile(input.logPath, `[${output.stream}] ${output.text}`, 'utf8');
    },
  });
  if (result.status === 'cancelled') {
    return { status: 'cancelled' };
  }
  return { status: 'exited', exitCode: result.exitCode };
};

const persistOpenFoamArtifacts = async (input: {
  readonly runtime: JobProviderRuntime;
  readonly casePath: string;
  readonly logPath: string;
  readonly execution: JobJsonObject;
  readonly summary: JobJsonObject;
  readonly report: {
    readonly image: string;
    readonly preset: OpenFoamJobPreset;
    readonly solverVersion: OpenFoamSolverVersion;
  };
}): Promise<readonly JobArtifactManifest[]> => {
  const artifacts: JobArtifactManifest[] = [];
  artifacts.push(
    await writeJsonArtifact(input.runtime, {
      role: 'raw',
      logicalPath: 'openfoam/execution.json',
      value: input.execution,
    }),
  );
  artifacts.push(
    await writeFileArtifact(input.runtime, {
      role: 'logs',
      logicalPath: 'openfoam/logs.txt',
      mediaType: 'text/plain',
      path: input.logPath,
    }),
  );
  artifacts.push(
    await writeJsonArtifact(input.runtime, {
      role: 'summary',
      logicalPath: 'openfoam/summary.json',
      value: input.summary,
    }),
  );
  artifacts.push(
    await writeTextArtifact(input.runtime, {
      role: 'report',
      logicalPath: 'openfoam/report.md',
      mediaType: 'text/markdown',
      text: `# OpenFOAM run\n\n- Release: ${input.report.solverVersion}\n- Image: \`${input.report.image}\`\n- Pipeline: ${input.report.preset}\n- Status: completed\n`,
    }),
  );
  const geometryCandidates = [
    join(input.casePath, 'geometry.glb'),
    join(input.casePath, 'postProcessing', 'geometry.glb'),
  ];
  const geometryMatches = await Promise.all(
    geometryCandidates.map(async (path) => ((await exists(path)) ? path : undefined)),
  );
  const geometryPath = geometryMatches.find((path) => path !== undefined);
  if (geometryPath === undefined) {
    artifacts.push(
      await writeJsonArtifact(input.runtime, {
        role: 'conversion',
        logicalPath: 'openfoam/conversion.json',
        value: {
          status: 'unavailable',
          reason: 'no-glb-produced',
          message: 'The selected case pipeline did not produce geometry.glb.',
        },
      }),
    );
  } else {
    artifacts.push(
      await writeFileArtifact(input.runtime, {
        role: 'geometry',
        logicalPath: 'openfoam/geometry.glb',
        mediaType: 'model/gltf-binary',
        path: geometryPath,
      }),
    );
  }
  return artifacts;
};

/**
 * Create the daemon-hosted OpenFOAM provider.
 *
 * @param options - Process executor, immutable input materializer, and host policy.
 * @returns Serializable provider metadata with a host-only execution implementation.
 * @public
 *
 * @example <caption>Register an OpenFOAM daemon provider</caption>
 * ```typescript
 * import {
 *   createDirectorySolverInputMaterializer,
 *   createNodeSolverProcessExecutor,
 *   createOpenFoamJobProvider,
 * } from '@taucad/jobs-solvers';
 *
 * const provider = createOpenFoamJobProvider({
 *   executor: createNodeSolverProcessExecutor(),
 *   inputMaterializer: createDirectorySolverInputMaterializer({
 *     resolve: async (snapshot) => `/srv/tau-cas/${snapshot.digest.slice(7)}`,
 *   }),
 * });
 * ```
 */
export const createOpenFoamJobProvider = (options: OpenFoamJobProviderOptions): JobProvider => {
  const workspaceRoot = options.workspaceRoot ?? defaultSolverWorkspaceRoot;
  const terminationGrace = options.terminationGrace ?? 10_000;
  const images = { ...openFoamContainerImages, ...options.images };
  for (const [solverVersion, image] of Object.entries(images)) {
    assertImmutableContainerImageReference(image, `OpenFOAM ${solverVersion} image`);
  }
  return defineJobProvider<OpenFoamJobOptions>({
    id: 'tau.openfoam.container',
    name: 'Tau OpenFOAM Container Provider',
    version: openFoamExecutionProviderVersion,
    types: [openFoamJobType],
    async execute({ lease }, runtime) {
      const { definition } = lease;
      const image = images[definition.options.solverVersion];
      if (image === undefined || image.trim() === '') {
        return {
          status: 'failed',
          failure: {
            code: 'OPENFOAM_IMAGE_NOT_CONFIGURED',
            message: `No image is configured for OpenFOAM ${definition.options.solverVersion}.`,
            retryable: false,
          },
        };
      }
      const workspace = await createSolverAttemptWorkspace(workspaceRoot);
      const casePath = join(workspace, 'case');
      const containerUser = resolveOpenFoamContainerUser();
      try {
        await runtime.emitProgress({
          phase: 'materialize',
          completed: 0,
          total: 1,
          message: 'Materializing case snapshot',
        });
        await options.inputMaterializer.materialize({
          snapshot: definition.input,
          destination: casePath,
          signal: runtime.signal,
        });
        const logPath = join(workspace, 'openfoam.log');
        await mkdir(join(workspace, 'metadata'), { recursive: true });
        const stages = presetStages(definition.options);
        const stageRecords: JobJsonValue[] = [];
        let priorContentDigest = await digestOpenFoamWorkspace(workspace);
        let priorActionDigest: Awaited<ReturnType<typeof evaluateOpenFoamStage>>['actionDigest'] | undefined;
        for (const [index, stage] of stages.entries()) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- OpenFOAM stages mutate one ordered case directory
          await runtime.emitProgress({
            phase: stage.name,
            completed: index,
            total: stages.length,
            message: `Running OpenFOAM stage ${stage.name}`,
          });
          try {
            // oxlint-disable-next-line eslint/no-await-in-loop -- each stage consumes the preceding stage's files
            const stageResult = await evaluateOpenFoamStage({
              compute: runtime.compute,
              signal: runtime.signal,
              workspace,
              inputSnapshot: definition.input,
              image,
              solverVersion: definition.options.solverVersion,
              cpus: definition.options.ranks,
              containerUser,
              stage,
              priorActionDigest,
              priorContentDigest,
              async execute() {
                const result = await executeStage({
                  stage,
                  image,
                  casePath,
                  logPath,
                  executor: options.executor,
                  signal: runtime.signal,
                  terminationGrace,
                  cpus: definition.options.ranks,
                  containerUser,
                });
                if (result.status === 'cancelled') {
                  throw new OpenFoamStageCancelledError();
                }
                if (result.exitCode !== 0) {
                  throw new OpenFoamStageFailedError(stage.name, result.exitCode);
                }
              },
            });
            priorActionDigest = stageResult.actionDigest;
            priorContentDigest = stageResult.contentDigest;
          } catch (error) {
            if (error instanceof OpenFoamStageCancelledError || runtime.signal.aborted) {
              return { status: 'cancelled', reason: String(runtime.signal.reason ?? 'cancelled') };
            }
            if (error instanceof OpenFoamStageFailedError) {
              return {
                status: 'failed',
                failure: {
                  code: 'OPENFOAM_STAGE_FAILED',
                  message: error.message,
                  retryable: false,
                },
              };
            }
            throw error;
          }
          stageRecords.push({
            name: stage.name,
            command: stage.command,
            arguments: stage.arguments,
            exitCode: 0,
          });
        }
        const summary: JobJsonObject = {
          status: 'completed',
          preset: definition.options.preset,
          solverVersion: definition.options.solverVersion,
          image,
          inputDigest: definition.input.digest,
          ranks: definition.options.ranks,
        };
        const execution: JobJsonObject = {
          provider: { id: 'tau.openfoam.container', version: openFoamExecutionProviderVersion },
          image: { reference: image, solver: 'openfoam', solverVersion: definition.options.solverVersion },
          input: { digest: definition.input.digest, storageKey: definition.input.storageKey },
          stages: stageRecords,
        };
        const artifacts = await persistOpenFoamArtifacts({
          runtime,
          casePath,
          logPath,
          execution,
          summary,
          report: {
            image,
            preset: definition.options.preset,
            solverVersion: definition.options.solverVersion,
          },
        });
        await runtime.emitProgress({
          phase: 'complete',
          completed: stages.length,
          total: stages.length,
          message: 'OpenFOAM artifacts persisted',
        });
        return { status: 'completed', artifacts, result: summary };
      } finally {
        await removeSolverAttemptWorkspace(workspaceRoot, workspace);
      }
    },
  });
};
