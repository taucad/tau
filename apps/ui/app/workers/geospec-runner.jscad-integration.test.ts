// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname as nodeDirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { FileStat } from '@taucad/types';
import { fileStatFromBytes } from '@taucad/filesystem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type ProjectFileSystemBridge = {
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  dispose(): void;
};

const workerMocks = vi.hoisted(() => ({
  createRuntimeClient: vi.fn(),
  createFileSystemBridgeProxy: vi.fn(),
  createDefaultKernelOptions: vi.fn(),
}));

vi.mock('@taucad/runtime', () => ({
  createRuntimeClient: workerMocks.createRuntimeClient,
}));

vi.mock('@taucad/fs-bridge', () => ({
  createFileSystemBridgeProxy: workerMocks.createFileSystemBridgeProxy,
}));

vi.mock('#constants/kernel-worker.constants.js', () => ({
  createDefaultKernelOptions: workerMocks.createDefaultKernelOptions,
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const execFileAsync = promisify(execFile);
const repoRootPath = fileURLToPath(new URL('../../../../', import.meta.url));
const runtimeNodeModuleUrl = pathToFileURL(join(repoRootPath, 'packages/runtime/src/node.ts')).href;

const normalizePath = (path: string): string => {
  const normalized = path.replaceAll('\\', '/').replaceAll(/\/+/gu, '/');
  return normalized === '/' ? normalized : normalized.replace(/\/$/u, '');
};

const dirname = (path: string): string => {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return '/';
  }
  return normalized.slice(0, index);
};

const basename = (path: string): string => {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
};

const cloneBytes = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
};

const createInMemoryProjectFileSystem = (files: Record<string, string>): ProjectFileSystemBridge => {
  const storedFiles = new Map<string, Uint8Array<ArrayBuffer>>();
  const directories = new Set<string>(['/']);

  const ensureDirectory = (path: string): void => {
    const normalized = normalizePath(path);
    if (directories.has(normalized)) {
      return;
    }
    const parent = dirname(normalized);
    if (parent !== normalized) {
      ensureDirectory(parent);
    }
    directories.add(normalized);
  };

  const ensureFileParent = (path: string): void => {
    ensureDirectory(dirname(path));
  };

  for (const [path, content] of Object.entries(files)) {
    const normalized = normalizePath(path);
    ensureFileParent(normalized);
    storedFiles.set(normalized, cloneBytes(encoder.encode(content)));
  }

  async function readProjectFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readProjectFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readProjectFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const bytes = storedFiles.get(normalizePath(path));
    if (!bytes) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return encoding === 'utf8' ? decoder.decode(bytes) : cloneBytes(bytes);
  }

  const stat = async (path: string): Promise<FileStat> => {
    const normalized = normalizePath(path);
    if (directories.has(normalized)) {
      return { type: 'dir', size: 0, mtimeMs: 1 };
    }
    const bytes = storedFiles.get(normalized);
    if (bytes) {
      return fileStatFromBytes(bytes, 1);
    }
    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  };

  return {
    readFile: readProjectFile,
    async writeFile(path, data) {
      const normalized = normalizePath(path);
      ensureFileParent(normalized);
      storedFiles.set(normalized, typeof data === 'string' ? cloneBytes(encoder.encode(data)) : cloneBytes(data));
    },
    async readdir(path) {
      const normalized = normalizePath(path);
      if (!directories.has(normalized)) {
        throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
      }
      const entries = new Set<string>();
      for (const directory of directories) {
        if (directory !== normalized && dirname(directory) === normalized) {
          entries.add(basename(directory));
        }
      }
      for (const file of storedFiles.keys()) {
        if (dirname(file) === normalized) {
          entries.add(basename(file));
        }
      }
      return [...entries].sort((left, right) => left.localeCompare(right));
    },
    stat,
    lstat: stat,
    async mkdir(path, options) {
      const normalized = normalizePath(path);
      if (options?.recursive) {
        ensureDirectory(normalized);
        return;
      }
      const parent = dirname(normalized);
      if (!directories.has(parent)) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }
      directories.add(normalized);
    },
    async unlink(path) {
      storedFiles.delete(normalizePath(path));
    },
    async rmdir(path) {
      const normalized = normalizePath(path);
      for (const candidate of [...directories, ...storedFiles.keys()]) {
        if (candidate !== normalized && dirname(candidate) === normalized) {
          throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
        }
      }
      directories.delete(normalized);
    },
    async rename(oldPath, newPath) {
      const oldNormalized = normalizePath(oldPath);
      const bytes = storedFiles.get(oldNormalized);
      if (!bytes) {
        throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
      }
      const newNormalized = normalizePath(newPath);
      ensureFileParent(newNormalized);
      storedFiles.set(newNormalized, cloneBytes(bytes));
      storedFiles.delete(oldNormalized);
    },
    async exists(path) {
      const normalized = normalizePath(path);
      return directories.has(normalized) || storedFiles.has(normalized);
    },
    dispose: vi.fn(),
  };
};

const jscadCubeCutoutSource = `
import { primitives, booleans } from '@jscad/modeling';

export const defaultParams = {
  cubeSize: 50,
  cylinderRadius: 10,
  cylinderHeight: 60,
};

export default function main(p = defaultParams) {
  const params = { ...defaultParams, ...p };
  const cube = primitives.cuboid({
    size: [params.cubeSize, params.cubeSize, params.cubeSize],
    center: [0, 0, params.cubeSize / 2],
  });
  const cylinder = primitives.cylinder({
    radius: params.cylinderRadius,
    height: params.cylinderHeight,
    center: [0, 0, params.cubeSize / 2],
    segments: 64,
  });
  return booleans.subtract(cube, cylinder);
}
`;

const geospecSource = `
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('cube with cylinder cutout', () => {
  it('should have cube outer bounds', async () => {
    const subject = await loadModel({ file: 'main.ts' });
    expectGeo(subject).toHaveBoundingBox({
      size: { x: 50, y: 50, z: 50 },
      tolerance: 0.5,
    });
  });

  it('should use explicit parameters for alternate bounds', async () => {
    const subject = await loadModel({
      file: 'main.ts',
      parameters: { cubeSize: 80, cylinderRadius: 10, cylinderHeight: 90 },
    });
    expectGeo(subject).toHaveBoundingBox({
      size: { x: 80, y: 80, z: 80 },
      center: { x: 0, y: 0, z: 40 },
      tolerance: 0.5,
    });
  });

  it('should be watertight', async () => {
    const subject = await loadModel({ file: 'main.ts' });
    expectGeo(subject).toBeWatertight();
  });

  it('should be one connected component', async () => {
    const subject = await loadModel({ file: 'main.ts' });
    expectGeo(subject).toHaveConnectedComponents({ count: 1 });
  });
});
`;

const defaultRuntimeConfig = {
  tauApiUrl: 'https://api.tau.test',
  tauWebSocketUrl: 'wss://api.tau.test',
};

const installWorkerScope = (): {
  listener: () => ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
  postMessage: ReturnType<typeof vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>>;
} => {
  let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
  vi.stubGlobal(
    'addEventListener',
    vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
      if (type === 'message') {
        messageListener = listener;
      }
    }),
  );
  const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
  vi.stubGlobal('postMessage', postMessage);
  vi.stubGlobal('close', vi.fn());
  return {
    listener: () => messageListener,
    postMessage,
  };
};

const sendWorkerMessage = (
  listener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined,
  data: GeoSpecRunnerWorkerRequest,
): void => {
  listener?.({ data } as MessageEvent<GeoSpecRunnerWorkerRequest>);
};

const writeProjectFiles = async (options: {
  projectPath: string;
  localRootPath: string;
  files: Record<string, string>;
}): Promise<void> => {
  for (const [path, content] of Object.entries(options.files)) {
    const relativePath = relative(options.localRootPath, path);
    const targetPath = join(options.projectPath, relativePath);
    // oxlint-disable-next-line no-await-in-loop -- writes are tiny fixture files and ordering keeps diagnostics simple.
    await mkdir(nodeDirname(targetPath), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- writes are tiny fixture files and ordering keeps diagnostics simple.
    await writeFile(targetPath, content);
  }
};

type NodeRuntimeExportResult =
  | {
      readonly success: true;
      readonly data: readonly [
        {
          readonly bytes: Uint8Array<ArrayBuffer>;
          readonly name: string;
          readonly mimeType: string;
        },
      ];
      readonly issues: readonly never[];
    }
  | { readonly success: false; readonly issues: readonly unknown[] };

const exportProjectWithNodeRuntime = async (options: {
  format: string;
  input: unknown;
  localRootPath: string;
  files: Record<string, string>;
}): Promise<NodeRuntimeExportResult> => {
  const projectPath = await mkdtemp(join(tmpdir(), 'tau-ui-geospec-jscad-runtime-'));
  try {
    await writeProjectFiles({
      projectPath,
      localRootPath: options.localRootPath,
      files: options.files,
    });

    const input =
      typeof options.input === 'object' && options.input !== null
        ? (options.input as { source?: { path?: unknown }; parameters?: Record<string, unknown> })
        : {};
    const sourcePath = typeof input.source?.path === 'string' ? input.source.path : 'main.ts';
    const file = sourcePath.startsWith(options.localRootPath)
      ? relative(options.localRootPath, sourcePath)
      : sourcePath;
    const script = `
      import { createNodeClient } from ${JSON.stringify(runtimeNodeModuleUrl)};
      const client = await createNodeClient(${JSON.stringify(projectPath)});
      const result = await client.export(${JSON.stringify(options.format)}, {
        source: {
          path: ${JSON.stringify(file)},
        },
        parameters: ${JSON.stringify(input.parameters)},
        exportOptions: {
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
      });
      client.terminate();
      if (!result.success) {
        console.log(JSON.stringify({ success: false, issues: result.issues }));
      } else {
        if (result.data.length !== 1) {
          throw new Error('Expected exactly one runtime export artifact, received ' + result.data.length);
        }
        const file = result.data[0];
        console.log(JSON.stringify({
          success: true,
          name: file.name,
          mimeType: file.mimeType,
          bytes: Buffer.from(file.bytes).toString('base64'),
        }));
      }
    `;
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script],
      {
        cwd: repoRootPath,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const payload = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      success: boolean;
      bytes?: string;
      name?: string;
      mimeType?: string;
      issues?: unknown[];
    };
    if (!payload.success) {
      return { success: false, issues: payload.issues ?? [] };
    }
    const bytes = Uint8Array.from(Buffer.from(payload.bytes ?? '', 'base64'));
    return {
      success: true,
      data: [
        {
          bytes,
          name: payload.name ?? 'model.glb',
          mimeType: payload.mimeType ?? 'model/gltf-binary',
        },
      ],
      issues: [],
    };
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
};

describe('geospec-runner.worker JSCAD integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    workerMocks.createRuntimeClient.mockReset();
    workerMocks.createFileSystemBridgeProxy.mockReset();
    workerMocks.createDefaultKernelOptions.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should run JSCAD GeoSpec tests through the worker with real loadModel and request-scoped runtime export', async () => {
    const localRootPath = '/';
    /* eslint-disable @typescript-eslint/naming-convention -- fixture keys are absolute filesystem paths. */
    const projectFiles = {
      '/main.ts': jscadCubeCutoutSource,
      '/main.geospec.ts': geospecSource,
      '/package.json': '{"type":"module"}\n',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- fixture keys are absolute filesystem paths. */
    const projectFileSystem = createInMemoryProjectFileSystem(projectFiles);
    const exportCalls: Array<{ format: string; input: unknown; bytes: number }> = [];
    workerMocks.createFileSystemBridgeProxy.mockReturnValue(projectFileSystem);
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      async export(format: string, input: unknown) {
        const exported = await exportProjectWithNodeRuntime({
          format,
          input,
          localRootPath,
          files: projectFiles,
        });
        exportCalls.push({
          format,
          input,
          bytes: exported.success ? exported.data[0].bytes.byteLength : 0,
        });
        return exported;
      },
      terminate: vi.fn(),
    });
    const scope = installWorkerScope();

    await import('#workers/geospec-runner.worker.js');
    sendWorkerMessage(scope.listener(), {
      type: 'initialize',
      requestId: 'initialize-jscad',
      sessionId: 'session-jscad',
      runtimeConfig: defaultRuntimeConfig,
      fileSystemPort: new MessageChannel().port1,
    });
    await vi.waitFor(
      () => {
        expect(scope.postMessage).toHaveBeenCalledWith({
          type: 'initialized',
          requestId: 'initialize-jscad',
          sessionId: 'session-jscad',
        });
      },
      { timeout: 20_000 },
    );
    scope.postMessage.mockClear();

    sendWorkerMessage(scope.listener(), {
      type: 'run',
      requestId: 'run-jscad',
      sessionId: 'session-jscad',
      args: {},
    });

    await vi.waitFor(
      () => {
        expect(scope.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'result',
            requestId: 'run-jscad',
          }),
        );
      },
      { timeout: 60_000 },
    );
    const resultMessage = scope.postMessage.mock.calls.find(([message]) => message.type === 'result')?.[0];
    expect(resultMessage?.type).toBe('result');
    if (resultMessage?.type !== 'result') {
      throw new Error('Expected GeoSpec worker result message.');
    }
    expect(resultMessage.result.success).toBe(true);
    if (!resultMessage.result.success) {
      throw new Error('Expected successful GeoSpec worker RPC result.');
    }

    expect(resultMessage.result.failures).toEqual([]);
    expect(resultMessage.result.passed).toBe(4);
    expect(resultMessage.result.total).toBe(4);
    expect(resultMessage.result.passes.map((pass) => pass.requirement)).toEqual([
      'cube with cylinder cutout > should have cube outer bounds',
      'cube with cylinder cutout > should use explicit parameters for alternate bounds',
      'cube with cylinder cutout > should be watertight',
      'cube with cylinder cutout > should be one connected component',
    ]);
    expect(resultMessage.result.passes.every((pass) => pass.targetFile === 'main.geospec.ts')).toBe(true);
    expect(exportCalls).toHaveLength(2);
    const [defaultExport, parameterizedExport] = exportCalls;
    if (!defaultExport || !parameterizedExport) {
      throw new Error('Expected default and parameterized runtime exports.');
    }
    expect(defaultExport.format).toBe('glb');
    expect(defaultExport.input).toMatchObject({
      source: { path: '/main.ts' },
    });
    expect((defaultExport.input as { parameters?: unknown }).parameters).toBeUndefined();
    expect(parameterizedExport.input).toMatchObject({
      source: { path: '/main.ts' },
      parameters: { cubeSize: 80, cylinderRadius: 10, cylinderHeight: 90 },
    });
    expect(defaultExport.bytes).toBeGreaterThan(1000);
    expect(parameterizedExport.bytes).toBeGreaterThan(1000);
    expect(JSON.stringify(resultMessage.result)).not.toContain('MODEL_EXPORT_FAILED');
    expect(JSON.stringify(resultMessage.result)).not.toContain('Tau runtime did not produce geometry bytes');
  }, 90_000);

  it('should keep the JSCAD browser regression on the real GeoSpec model loader', async () => {
    const source = await readFile(fileURLToPath(import.meta.url), 'utf8');
    const forbiddenGeoSpecModelMock = ['vi.mock(', "'geospec/model'"].join('');
    const forbiddenLoadModelStub = ['loadModel', 'mockResolvedValue'].join('.');

    expect(source).not.toContain(forbiddenGeoSpecModelMock);
    expect(source).not.toContain(forbiddenLoadModelStub);
  });
});
