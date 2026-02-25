/**
 * TSCircuit Kernel Module (experimental)
 *
 * Executes TSCircuit/TSX projects with @tscircuit/eval and converts the
 * resulting Circuit JSON into GLB/GLTF geometry for Tau viewers.
 */

import { convertCircuitJsonToGltf } from 'circuit-json-to-gltf';
import { z } from 'zod';
import { asBuffer } from '@taucad/utils/file';
import { createExportFile } from '@taucad/types/constants';
import type { KernelIssue } from '#types/kernel.types.js';
import { defineKernel } from '#types/kernel-worker.types.js';
import type { KernelRuntime } from '#types/kernel-worker.types.js';
import { createKernelError, createKernelSuccess } from '#framework/kernel-helpers.js';

type TscircuitNativeHandle = {
  circuitJson: unknown[];
  cachedGlb: Uint8Array<ArrayBuffer>;
};

const tscircuitOptionsSchema = z.object({
  includeModels: z.boolean().optional().default(false),
  partsEngineDisabled: z.boolean().optional().default(true),
});

type CircuitWorkerRuntime = {
  executeWithFsMap: (options: {
    entrypoint?: string;
    mainComponentPath?: string;
    fsMap: Record<string, string>;
  }) => Promise<void>;
  renderUntilSettled: () => Promise<void>;
  getCircuitJson: () => Promise<unknown[]>;
  kill: () => Promise<void>;
};

type EvalWorkerModule = {
  createCircuitWebWorker: (configuration: Record<string, unknown>) => Promise<CircuitWorkerRuntime>;
};

function resolveToRelative(absolutePath: string, basePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (absolutePath.startsWith(`${normalizedBase}/`)) {
    return absolutePath.slice(normalizedBase.length + 1);
  }

  return absolutePath;
}

function toFsMapPath(absolutePath: string, basePath: string): string {
  return resolveToRelative(absolutePath, basePath).replace(/^\/+/, '');
}

function toStrictUint8Array(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const arrayBufferSlice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Uint8Array(arrayBufferSlice);
}

function toBytes(data: unknown): Uint8Array<ArrayBuffer> {
  if (data instanceof Uint8Array) {
    return toStrictUint8Array(data as Uint8Array<ArrayBuffer>);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return toStrictUint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as Uint8Array<ArrayBuffer>);
  }

  if (typeof data === 'string') {
    return toStrictUint8Array(new TextEncoder().encode(data));
  }

  if (typeof data === 'object' && data !== null) {
    return toStrictUint8Array(new TextEncoder().encode(JSON.stringify(data)));
  }

  throw new Error(`Unsupported GLTF conversion output type: ${typeof data}`);
}

async function buildFsMap(input: {
  entryPath: string;
  basePath: string;
  runtime: KernelRuntime;
}): Promise<Record<string, string>> {
  const { entryPath, basePath, runtime } = input;
  const dependencyPaths = new Set<string>([entryPath]);

  try {
    const dependencies = await runtime.bundler.resolveDependencies(entryPath);
    for (const dependencyPath of dependencies) {
      dependencyPaths.add(dependencyPath);
    }
  } catch (error) {
    runtime.logger.debug('Dependency resolution fallback to entrypoint-only map', { data: error });
  }

  const tsConfigPath = `${basePath}/tsconfig.json`;
  if (await runtime.filesystem.exists(tsConfigPath)) {
    dependencyPaths.add(tsConfigPath);
  }

  const fsMap: Record<string, string> = {};
  const resolvedDependencies = await Promise.all(
    [...dependencyPaths].map(async (absolutePath) => {
      try {
        return {
          relativePath: toFsMapPath(absolutePath, basePath),
          content: await runtime.filesystem.readFile(absolutePath, 'utf8'),
        };
      } catch (error) {
        runtime.logger.debug('Skipping unreadable dependency in tscircuit fsMap', {
          data: { absolutePath, error },
        });
        return undefined;
      }
    }),
  );

  for (const dependency of resolvedDependencies) {
    if (!dependency) {
      continue;
    }

    fsMap[dependency.relativePath] = dependency.content;
  }

  const entrypoint = toFsMapPath(entryPath, basePath);
  fsMap[entrypoint] ??= await runtime.filesystem.readFile(entryPath, 'utf8');

  return fsMap;
}

async function convertCircuitJson(input: {
  circuitJson: unknown[];
  fileType: 'glb' | 'gltf';
  includeModels: boolean;
}): Promise<Uint8Array<ArrayBuffer>> {
  const result = await convertCircuitJsonToGltf(input.circuitJson as never, {
    boardTextureResolution: 512,
    includeModels: input.includeModels,
    showBoundingBoxes: false,
    format: input.fileType,
  });
  return toBytes(result);
}

export default defineKernel({
  name: 'TscircuitKernel',
  version: '1.0.0',
  optionsSchema: tscircuitOptionsSchema,

  async initialize(options) {
    const workerModuleSpecifier = '@tscircuit/eval/worker';
    const workerModule = (await import(workerModuleSpecifier)) as EvalWorkerModule;
    const circuitWorker = await workerModule.createCircuitWebWorker({
      verbose: false,
      enableFetchProxy: true,
      projectConfig: {
        partsEngineDisabled: options.partsEngineDisabled,
      },
    });

    return {
      circuitWorker,
      includeModels: options.includeModels,
    };
  },

  async canHandle({ filePath, extension }, { filesystem }) {
    if (!['ts', 'js', 'tsx', 'jsx'].includes(extension)) {
      return false;
    }

    const code = await filesystem.readFile(filePath, 'utf8');
    const hasCoreImport = /(?:import|export)\s+.*from\s+['"](?:@tscircuit\/core|tscircuit)['"]/.test(code);
    const hasTsciImport = /(?:import|export)\s+.*from\s+['"]@tsci\/[^'"]+['"]/.test(code);
    const hasRequireImport = /require\s*\(\s*['"](?:@tscircuit\/core|tscircuit|@tsci\/[^'"]+)['"]\s*\)/.test(code);
    const hasCircuitUsage = /\bcircuit\.add\s*\(/.test(code);

    return hasCoreImport || hasTsciImport || hasRequireImport || hasCircuitUsage;
  },

  async getDependencies({ filePath }, runtime) {
    return runtime.bundler.resolveDependencies(filePath);
  },

  async getParameters() {
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  },

  async createGeometry({ filePath, basePath }, runtime, context) {
    const relativeFilePath = resolveToRelative(filePath, basePath);

    try {
      const fsMap = await buildFsMap({ entryPath: filePath, basePath, runtime });
      const entrypoint = toFsMapPath(filePath, basePath);

      await context.circuitWorker.executeWithFsMap({
        fsMap,
        entrypoint,
      });
      await context.circuitWorker.renderUntilSettled();

      const circuitJson = await context.circuitWorker.getCircuitJson();
      const glbBytes = await convertCircuitJson({
        circuitJson,
        fileType: 'glb',
        includeModels: context.includeModels,
      });

      return {
        geometry: [{ format: 'gltf', content: glbBytes }],
        nativeHandle: {
          circuitJson,
          cachedGlb: glbBytes,
        } satisfies TscircuitNativeHandle,
      };
    } catch (error) {
      runtime.logger.error('Failed to render TSCircuit geometry', { data: error });
      const message = error instanceof Error ? error.message : 'Failed to render TSCircuit project';
      throw new TscircuitBuildError([
        {
          message,
          location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async exportGeometry({ fileType, nativeHandle }, _runtime, context) {
    if (fileType !== 'glb' && fileType !== 'gltf') {
      return createKernelError([
        {
          message: `Export format '${fileType}' is not supported by tscircuit. Use 'glb' or 'gltf'.`,
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    try {
      const bytes =
        fileType === 'glb'
          ? nativeHandle.cachedGlb
          : await convertCircuitJson({
              circuitJson: nativeHandle.circuitJson,
              fileType: 'gltf',
              includeModels: context.includeModels,
            });

      return createKernelSuccess([
        createExportFile(fileType, fileType === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(bytes)),
      ]);
    } catch (error) {
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Failed to export tscircuit geometry',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async cleanup(context) {
    await context.circuitWorker.kill();
  },
});

class TscircuitBuildError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
