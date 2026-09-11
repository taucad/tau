import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineJobProvider } from '@taucad/jobs';
import type { JobArtifactManifest, JobJsonObject, JobProvider, JobProviderRuntime } from '@taucad/jobs';

import { calculixCantileverJobType, calculixSolverVersion } from '#calculix-definition.js';
import type {
  CalculixCantileverJobOptions,
  CalculixContainerImage,
  CalculixValidationResult,
} from '#calculix-definition.js';
import { createCalculixCantileverInputGlb } from '#calculix-input-glb.js';
import { writeFileArtifact, writeJsonArtifact, writeTextArtifact } from '#solver-artifacts.js';
import {
  assertImmutableContainerImageReference,
  createSolverAttemptWorkspace,
  defaultSolverWorkspaceRoot,
  removeSolverAttemptWorkspace,
} from '#solver-host.js';
import type { SolverInputMaterializer, SolverProcessExecutor } from '#solver-host.js';

/** Native host configuration for the CalculiX provider. @public */
export type CalculixJobProviderOptions = {
  readonly executor: SolverProcessExecutor;
  readonly inputMaterializer: SolverInputMaterializer;
  readonly image: CalculixContainerImage;
  readonly workspaceRoot?: string;
  /** Milliseconds allowed for graceful process and container shutdown. */
  readonly terminationGrace?: number;
};

const nodeId = (input: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
}): number => input.z * (input.nx + 1) * (input.ny + 1) + input.y * (input.nx + 1) + input.x + 1;

const buildCantileverDeck = (options: CalculixCantileverJobOptions, nx: number): string => {
  const ny = options.elementsAcrossWidth;
  const nz = options.elementsAcrossHeight;
  const nodes: string[] = [];
  const fixedNodes: number[] = [];
  const tipNodes: number[] = [];
  for (let z = 0; z <= nz; z += 1) {
    for (let y = 0; y <= ny; y += 1) {
      for (let x = 0; x <= nx; x += 1) {
        const id = nodeId({ x, y, z, nx, ny });
        nodes.push(
          `${String(id)}, ${(options.length * x) / nx}, ${(options.width * y) / ny}, ${(options.height * z) / nz}`,
        );
        if (x === 0) {
          fixedNodes.push(id);
        }
        if (x === nx) {
          tipNodes.push(id);
        }
      }
    }
  }
  const elements: string[] = [];
  let elementId = 1;
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const ids = [
          nodeId({ x, y, z, nx, ny }),
          nodeId({ x: x + 1, y, z, nx, ny }),
          nodeId({ x: x + 1, y: y + 1, z, nx, ny }),
          nodeId({ x, y: y + 1, z, nx, ny }),
          nodeId({ x, y, z: z + 1, nx, ny }),
          nodeId({ x: x + 1, y, z: z + 1, nx, ny }),
          nodeId({ x: x + 1, y: y + 1, z: z + 1, nx, ny }),
          nodeId({ x, y: y + 1, z: z + 1, nx, ny }),
        ];
        elements.push(`${String(elementId)}, ${ids.join(', ')}`);
        elementId += 1;
      }
    }
  }
  const loadPerNode = options.tipLoad / tipNodes.length;
  return [
    '*HEADING',
    'Tau CalculiX cantilever convergence fixture',
    '*NODE',
    ...nodes,
    '*ELEMENT, TYPE=C3D8, ELSET=SOLID',
    ...elements,
    '*NSET, NSET=FIXED',
    fixedNodes.join(', '),
    '*NSET, NSET=TIP',
    tipNodes.join(', '),
    '*MATERIAL, NAME=ISOTROPIC',
    '*ELASTIC',
    `${options.elasticModulus}, ${options.poissonRatio}`,
    '*SOLID SECTION, ELSET=SOLID, MATERIAL=ISOTROPIC',
    '*STEP',
    '*STATIC',
    '*BOUNDARY',
    'FIXED, 1, 3',
    '*CLOAD',
    ...tipNodes.map((id) => `${String(id)}, 3, ${String(loadPerNode)}`),
    '*NODE FILE',
    'U',
    '*EL FILE',
    'S',
    '*NODE PRINT, NSET=TIP',
    'U',
    '*NODE PRINT, NSET=FIXED, TOTALS=YES',
    'RF',
    '*END STEP',
    '',
  ].join('\n');
};

type ParsedCalculixResult = { readonly displacement: number; readonly reaction: number };

const numericRow = (line: string): readonly number[] | undefined => {
  const values = line.trim().split(/\s+/).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  return values;
};

const parseCalculixData = (data: string): ParsedCalculixResult => {
  let section: 'displacement' | 'reaction' | undefined;
  let displacement = 0;
  let reaction = 0;
  let displacementRows = 0;
  let reactionRows = 0;
  for (const line of data.split(/\r?\n/)) {
    const normalized = line.toLowerCase();
    if (normalized.includes('displacements') && normalized.includes('tip')) {
      section = 'displacement';
      continue;
    }
    if ((normalized.includes('forces') || normalized.includes('reaction')) && normalized.includes('fixed')) {
      section = 'reaction';
      continue;
    }
    const values = numericRow(line);
    if (!values || section === undefined) {
      continue;
    }
    const zValue = values[3] ?? 0;
    if (section === 'displacement') {
      displacement = Math.max(displacement, Math.abs(zValue));
      displacementRows += 1;
    } else {
      reaction += zValue;
      reactionRows += 1;
    }
  }
  if (displacementRows === 0 || reactionRows === 0) {
    throw new Error('CalculiX .dat did not contain TIP displacement and FIXED reaction tables.');
  }
  return { displacement, reaction: Math.abs(reaction) };
};

const relativeError = (observed: number, expected: number): number =>
  Math.abs(observed - expected) / Math.abs(expected);

const validateCantilever = (
  options: CalculixCantileverJobOptions,
  coarse: ParsedCalculixResult,
  refined: ParsedCalculixResult,
): CalculixValidationResult => {
  const inertia = (options.width * options.height ** 3) / 12;
  const analyticalDisplacement = Math.abs(
    (options.tipLoad * options.length ** 3) / (3 * options.elasticModulus * inertia),
  );
  const coarseDisplacementRelativeError = relativeError(coarse.displacement, analyticalDisplacement);
  const refinedDisplacementRelativeError = relativeError(refined.displacement, analyticalDisplacement);
  const reactionRelativeError = relativeError(refined.reaction, Math.abs(options.tipLoad));
  const reasons: string[] = [];
  if (refinedDisplacementRelativeError > options.displacementRelativeTolerance) {
    reasons.push('Refined displacement is outside the configured analytical tolerance.');
  }
  if (reactionRelativeError > options.reactionRelativeTolerance) {
    reasons.push('Refined support reaction does not balance the applied load.');
  }
  if (refinedDisplacementRelativeError > coarseDisplacementRelativeError) {
    reasons.push('Refinement increased displacement error instead of reducing it.');
  }
  const evidence = {
    analyticalDisplacement,
    coarseDisplacement: coarse.displacement,
    refinedDisplacement: refined.displacement,
    coarseDisplacementRelativeError,
    refinedDisplacementRelativeError,
    refinedReaction: refined.reaction,
    reactionRelativeError,
  };
  return reasons.length === 0
    ? { status: 'passed', ...evidence, reasons: [] }
    : { status: 'failed', ...evidence, reasons };
};

const dockerUserArguments = (): readonly string[] => {
  if (process.getuid === undefined || process.getgid === undefined) {
    return [];
  }
  return ['--user', `${String(process.getuid())}:${String(process.getgid())}`];
};

const solverProcessOutputLimit = 64 * 1024 * 1024;

const executeCalculix = async (input: {
  readonly runPath: string;
  readonly logPath: string;
  readonly image: string;
  readonly executor: SolverProcessExecutor;
  readonly signal: AbortSignal;
  readonly terminationGrace: number;
}): Promise<{ readonly status: 'cancelled' } | { readonly status: 'exited'; readonly exitCode: number }> => {
  const containerName = `tau-calculix-${randomUUID()}`;
  await appendFile(input.logPath, '## ccx -i cantilever\n', 'utf8');
  const execution = await input.executor.execute({
    executable: 'docker',
    arguments: [
      'run',
      '--rm',
      '--name',
      containerName,
      '--network',
      'none',
      '--cpus',
      '1',
      '--memory',
      '4g',
      '--pids-limit',
      '256',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=256m',
      '--volume',
      `${input.runPath}:/case`,
      '--workdir',
      '/case',
      ...dockerUserArguments(),
      input.image,
      'ccx',
      '-i',
      'cantilever',
    ],
    cwd: input.runPath,
    environment: {},
    signal: input.signal,
    terminationGrace: input.terminationGrace,
    outputLimit: solverProcessOutputLimit,
    container: { engine: 'docker', name: containerName },
    async onOutput(output) {
      await appendFile(input.logPath, `[${output.stream}] ${output.text}`, 'utf8');
    },
  });
  if (execution.status === 'cancelled') {
    return { status: 'cancelled' };
  }
  return { status: 'exited', exitCode: execution.exitCode };
};

const rawArtifacts = async (
  runtime: JobProviderRuntime,
  workspace: string,
): Promise<readonly JobArtifactManifest[]> => {
  const artifactWrites: Array<Promise<JobArtifactManifest>> = [];
  for (const refinement of ['coarse', 'refined'] as const) {
    for (const extension of ['inp', 'dat', 'frd'] as const) {
      artifactWrites.push(
        writeFileArtifact(runtime, {
          role: 'raw',
          logicalPath: `calculix/${refinement}/cantilever.${extension}`,
          mediaType: 'text/plain',
          path: join(workspace, refinement, `cantilever.${extension}`),
        }),
      );
    }
    artifactWrites.push(
      writeFileArtifact(runtime, {
        role: 'logs',
        logicalPath: `calculix/${refinement}.log`,
        mediaType: 'text/plain',
        path: join(workspace, `${refinement}.log`),
      }),
    );
  }
  return Promise.all(artifactWrites);
};

const persistCalculixArtifacts = async (input: {
  readonly runtime: JobProviderRuntime;
  readonly workspace: string;
  readonly summary: JobJsonObject;
  readonly validation: CalculixValidationResult;
  readonly image: string;
  readonly options: CalculixCantileverJobOptions;
}): Promise<readonly JobArtifactManifest[]> => {
  const artifacts = [...(await rawArtifacts(input.runtime, input.workspace))];
  artifacts.push(
    await writeJsonArtifact(input.runtime, {
      role: 'summary',
      logicalPath: 'calculix/summary.json',
      value: input.summary,
    }),
  );
  artifacts.push(
    await input.runtime.writeArtifact({
      role: 'geometry-input',
      logicalPath: 'calculix/undeformed-input.glb',
      mediaType: 'model/gltf-binary',
      bytes: createCalculixCantileverInputGlb(input.options),
    }),
  );
  artifacts.push(
    await writeTextArtifact(input.runtime, {
      role: 'report',
      logicalPath: 'calculix/report.md',
      mediaType: 'text/markdown',
      text: [
        '# CalculiX cantilever verification',
        '',
        `- Validation: ${input.validation.status}`,
        `- CalculiX release: ${calculixSolverVersion}`,
        `- Image: \`${input.image}\``,
        `- Analytical tip displacement: ${String(input.validation.analyticalDisplacement)} m`,
        `- Coarse tip displacement: ${String(input.validation.coarseDisplacement)} m`,
        `- Refined tip displacement: ${String(input.validation.refinedDisplacement)} m`,
        `- Refined reaction: ${String(input.validation.refinedReaction)} N`,
        '- Viewer geometry: `calculix/undeformed-input.glb` is the undeformed input volume authored from job parameters.',
        '- Result deformation/stress fields: not converted; the raw refined FRD remains the solver result evidence.',
        ...(input.validation.reasons.length === 0
          ? []
          : ['', '## Validation findings', '', ...input.validation.reasons.map((reason) => `- ${reason}`)]),
        '',
      ].join('\n'),
    }),
  );
  artifacts.push(
    await writeJsonArtifact(input.runtime, {
      role: 'conversion',
      logicalPath: 'calculix/conversion.json',
      value: {
        status: 'unavailable',
        reason: 'converter-not-configured',
        source: 'calculix/refined/cantilever.frd',
        viewerGeometry: {
          logicalPath: 'calculix/undeformed-input.glb',
          geometryState: 'undeformed-input',
          source: 'job-parameters',
          deformationApplied: false,
        },
        message:
          'No reviewed FRD-to-GLB converter is configured. The viewer GLB is independently authored undeformed input geometry and contains no result deformation or stress field.',
      },
    }),
  );
  return artifacts;
};

/**
 * Create the daemon-hosted CalculiX 2.23 provider.
 *
 * The image is deliberately required because no authoritative, runnable CalculiX 2.23
 * image is assumed by this package. Deployments must supply and record their reviewed image.
 *
 * @param options - Process executor, immutable input materializer, and exact image provenance.
 * @returns Serializable provider metadata with a host-only execution implementation.
 * @public
 *
 * @example <caption>Register a reviewed CalculiX image</caption>
 * ```typescript
 * import {
 *   createCalculixJobProvider,
 *   createDirectorySolverInputMaterializer,
 *   createNodeSolverProcessExecutor,
 * } from '@taucad/jobs-solvers';
 *
 * const provider = createCalculixJobProvider({
 *   executor: createNodeSolverProcessExecutor(),
 *   inputMaterializer: createDirectorySolverInputMaterializer({
 *     resolve: async (snapshot) => `/srv/tau-cas/${snapshot.digest.slice(7)}`,
 *   }),
 *   image: { reference: 'registry.example/calculix@sha256:reviewed-digest', solverVersion: '2.23' },
 * });
 * ```
 */
export const createCalculixJobProvider = (options: CalculixJobProviderOptions): JobProvider => {
  if (!options.image.reference.trim()) {
    throw new TypeError('CalculiX image reference must be a non-empty string.');
  }
  const configuredSolverVersion: string = options.image.solverVersion;
  if (configuredSolverVersion !== calculixSolverVersion) {
    throw new TypeError('CalculiX provider requires solver version 2.23.');
  }
  assertImmutableContainerImageReference(options.image.reference, 'CalculiX image');
  const workspaceRoot = options.workspaceRoot ?? defaultSolverWorkspaceRoot;
  const terminationGrace = options.terminationGrace ?? 10_000;
  return defineJobProvider<CalculixCantileverJobOptions>({
    id: 'tau.calculix.container',
    name: 'Tau CalculiX Container Provider',
    version: '1.0.0',
    types: [calculixCantileverJobType],
    async execute({ lease }, runtime) {
      const { definition } = lease;
      const workspace = await createSolverAttemptWorkspace(workspaceRoot);
      try {
        await runtime.emitProgress({
          phase: 'materialize',
          completed: 0,
          total: 4,
          message: 'Materializing input snapshot',
        });
        await options.inputMaterializer.materialize({
          snapshot: definition.input,
          destination: join(workspace, 'input'),
          signal: runtime.signal,
        });
        const refinements = [
          { name: 'coarse', nx: definition.options.coarseElementsAlongLength },
          {
            name: 'refined',
            nx: definition.options.coarseElementsAlongLength * definition.options.refinementFactor,
          },
        ] as const;
        for (const [index, refinement] of refinements.entries()) {
          const runPath = join(workspace, refinement.name);
          // oxlint-disable-next-line eslint/no-await-in-loop -- refinements run in deterministic order
          await mkdir(runPath, { recursive: true });
          // oxlint-disable-next-line eslint/no-await-in-loop -- the deck must exist before its solver starts
          await writeFile(
            join(runPath, 'cantilever.inp'),
            buildCantileverDeck(definition.options, refinement.nx),
            'utf8',
          );
          // oxlint-disable-next-line eslint/no-await-in-loop -- progress follows the ordered refinement lifecycle
          await runtime.emitProgress({
            phase: refinement.name,
            completed: index + 1,
            total: 4,
            message: `Running ${refinement.name} CalculiX mesh`,
          });
          // oxlint-disable-next-line eslint/no-await-in-loop -- refined execution follows coarse execution
          const result = await executeCalculix({
            runPath,
            logPath: join(workspace, `${refinement.name}.log`),
            image: options.image.reference,
            executor: options.executor,
            signal: runtime.signal,
            terminationGrace,
          });
          if (result.status === 'cancelled') {
            return { status: 'cancelled', reason: String(runtime.signal.reason ?? 'cancelled') };
          }
          if (result.exitCode !== 0) {
            return {
              status: 'failed',
              failure: {
                code: 'CALCULIX_EXECUTION_FAILED',
                message: `${refinement.name} CalculiX mesh exited with code ${String(result.exitCode)}.`,
                retryable: false,
              },
            };
          }
        }
        await runtime.emitProgress({
          phase: 'validate',
          completed: 3,
          total: 4,
          message: 'Validating reactions and refinement',
        });
        const coarse = parseCalculixData(await readFile(join(workspace, 'coarse', 'cantilever.dat'), 'utf8'));
        const refined = parseCalculixData(await readFile(join(workspace, 'refined', 'cantilever.dat'), 'utf8'));
        const validation = validateCantilever(definition.options, coarse, refined);
        const summary: JobJsonObject = {
          status: 'completed',
          solverVersion: calculixSolverVersion,
          image: options.image.reference,
          provider: { id: 'tau.calculix.container', version: '1.0.0' },
          input: { digest: definition.input.digest, storageKey: definition.input.storageKey },
          mesh: {
            coarseElementsAlongLength: definition.options.coarseElementsAlongLength,
            refinedElementsAlongLength:
              definition.options.coarseElementsAlongLength * definition.options.refinementFactor,
            elementsAcrossWidth: definition.options.elementsAcrossWidth,
            elementsAcrossHeight: definition.options.elementsAcrossHeight,
          },
          geometry: {
            logicalPath: 'calculix/undeformed-input.glb',
            geometryState: 'undeformed-input',
            source: 'job-parameters',
            deformationApplied: false,
            resultFieldsIncluded: false,
          },
          validation,
        };
        const artifacts = await persistCalculixArtifacts({
          runtime,
          workspace,
          summary,
          validation,
          image: options.image.reference,
          options: definition.options,
        });
        await runtime.emitProgress({
          phase: 'complete',
          completed: 4,
          total: 4,
          message: 'CalculiX evidence persisted',
        });
        return { status: 'completed', artifacts, result: summary };
      } finally {
        await removeSolverAttemptWorkspace(workspaceRoot, workspace);
      }
    },
  });
};
