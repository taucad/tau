import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportResult, GetParametersResult } from '@taucad/runtime';
import type * as RuntimeNode from '@taucad/runtime/node';
import type * as RuntimeParameter from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import { exitCodes } from '#output.js';

vi.mock('@taucad/runtime/node', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeNode>()),
  createNodeClient: vi.fn(),
}));
vi.mock('@taucad/parameters', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeParameter>()),
  resolveParameterInputValues: vi.fn((_manifest: unknown, values: Record<string, unknown>) => values),
}));
vi.mock('#cli-runtime.js', () => ({
  createCliRuntime: vi.fn(async () => ({ plugins: [] })),
}));

const exportFunction = vi.fn<(format: string, input: unknown) => Promise<ExportResult>>();
const resolveParametersFunction = vi.fn<() => Promise<GetParametersResult>>(async () => ({
  success: true,
  data: { fixture: true } as unknown as ParameterManifest,
  issues: [],
}));
const shutdown = vi.fn<(_options?: { drain?: boolean }) => Promise<void>>(async () => undefined);

const importViewCommand = async () => {
  const { viewCommand } = await import('#commands/view.js');
  return viewCommand;
};

const buildPreview = (bytes: Uint8Array<ArrayBuffer>): ExportResult => ({
  success: true,
  data: [{ name: 'model.webp', bytes, mimeType: 'image/webp' }],
  issues: [],
});

describe('viewCommand', () => {
  let workspace: string;
  let inputPath: string;
  let previewPath: string;
  let stdout: string[];
  let stderr: string[];
  const interactive = process.stdout.isTTY;

  const captureStream = (stream: NodeJS.WriteStream, sink: string[]): void => {
    vi.spyOn(stream, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: readonly unknown[]
    ): boolean => {
      sink.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof stream.write);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', '');
    workspace = await mkdtemp(join(tmpdir(), 'tau-cli-view-'));
    inputPath = join(workspace, 'model.ts');
    previewPath = join(workspace, 'model.webp');
    await writeFile(inputPath, '/* fixture */', 'utf8');
    stdout = [];
    stderr = [];

    const runtime = (await import('@taucad/runtime/node')) as unknown as {
      createNodeClient: ReturnType<typeof vi.fn>;
    };
    runtime.createNodeClient.mockResolvedValue({
      on: vi.fn(),
      export: exportFunction,
      resolveParameters: resolveParametersFunction,
      terminate: vi.fn(),
      shutdown,
    });
  });

  afterEach(async () => {
    try {
      await rm(workspace, { recursive: true, force: true });
    } finally {
      process.stdout.isTTY = interactive;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['piped', false],
    ['interactive', true],
  ])(
    'should write a lossy webp preview beside the input and print only its path on %s stdout',
    async (_kind, isTty) => {
      const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      exportFunction.mockResolvedValueOnce(buildPreview(bytes));
      const command = await importViewCommand();
      process.stdout.isTTY = isTty;
      captureStream(process.stdout, stdout);

      await runCommand(command, { rawArgs: [inputPath] });

      expect(exportFunction).toHaveBeenCalledWith('webp', {
        source: { path: 'model.ts' },
        parameters: {},
        exportOptions: { quality: 0.8 },
      });
      await expect(readFile(previewPath)).resolves.toEqual(Buffer.from(bytes));
      expect(stdout).toEqual([`${previewPath}\n`]);
      // A terminal preview that cannot be drawn must not smuggle an escape onto stdout.
      expect(stdout.join('')).not.toContain('\u001B');
      expect(bytes.byteLength).toBeLessThan(1024 * 1024);
      expect(shutdown).toHaveBeenCalledWith({ drain: true });
    },
  );

  it('should forward an explicit frame and model parameters to the export route', async () => {
    exportFunction.mockResolvedValueOnce(buildPreview(new Uint8Array([1])));
    const command = await importViewCommand();
    captureStream(process.stdout, stdout);

    await runCommand(command, {
      rawArgs: [inputPath, '--width=1024', '--height=576', '--params={"teeth":24}', '--resolution-mode=declared-only'],
    });

    expect(exportFunction).toHaveBeenCalledWith('webp', {
      source: { path: 'model.ts' },
      parameters: { teeth: 24 },
      exportOptions: { quality: 0.8, width: 1024, height: 576 },
    });
    expect(resolveParametersFunction).toHaveBeenCalledWith({
      source: { path: 'model.ts' },
      resolution: { mode: 'declared-only' },
    });
  });

  it('should report a preview above the terminal ceiling without discarding it', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 1);
    exportFunction.mockResolvedValueOnce(buildPreview(bytes));
    const command = await importViewCommand();
    captureStream(process.stdout, stdout);
    captureStream(process.stderr, stderr);

    await runCommand(command, { rawArgs: [inputPath] });

    expect(stderr.join('')).toContain('above the 1048576-byte terminal preview ceiling');
    await expect(readFile(previewPath)).resolves.toHaveLength(bytes.byteLength);
    expect(stdout).toEqual([`${previewPath}\n`]);
  });

  it.each(['--width=0', '--height=720.5', '--width=wide'])(
    'should reject %s as a usage error before starting the runtime',
    async (flag) => {
      const command = await importViewCommand();

      await expect(runCommand(command, { rawArgs: [inputPath, flag] })).rejects.toMatchObject({
        code: 'ARG_DIMENSION_INVALID',
        exit: exitCodes.usage,
      });
      expect(exportFunction).not.toHaveBeenCalled();
    },
  );

  it('should refuse streaming a preview to stdout and name the export route instead', async () => {
    const command = await importViewCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--output=-'] })).rejects.toMatchObject({
      code: 'OUTPUT_STREAM_UNSUPPORTED',
      exit: exitCodes.usage,
    });
    expect(exportFunction).not.toHaveBeenCalled();
  });
});
