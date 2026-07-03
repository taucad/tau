import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportResult } from '@taucad/runtime';

vi.mock('@taucad/runtime/node', () => ({
  createNodeClient: vi.fn(),
}));

const exportFunction = vi.fn<(format: string, input: unknown) => Promise<ExportResult>>();
const terminate = vi.fn<() => void>();
const onFunction = vi.fn<(event: string, listener: (entry: unknown) => void) => void>();

const importExportCommand = async () => {
  const { exportCommand } = await import('#commands/export.js');
  return exportCommand;
};

const importedRuntime = async () =>
  (await import('@taucad/runtime/node')) as unknown as {
    createNodeClient: ReturnType<typeof vi.fn>;
  };

const buildSuccessResult = (bytes: Uint8Array<ArrayBuffer>): ExportResult => ({
  success: true,
  data: {
    name: 'model.glb',
    bytes,
    mimeType: 'model/gltf-binary',
  },
  issues: [],
});

const buildFailureResult = (messages: readonly string[]): ExportResult => ({
  success: false,
  issues: messages.map((message) => ({ message, code: 'RUNTIME', severity: 'error' })),
});

describe('exportCommand', () => {
  let workspace: string;
  let inputPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    workspace = await mkdtemp(join(tmpdir(), 'taucad-cli-export-'));
    inputPath = join(workspace, 'model.ts');
    await writeFile(inputPath, '/* fixture */', 'utf8');

    const runtime = await importedRuntime();
    runtime.createNodeClient.mockResolvedValue({
      on: onFunction,
      export: exportFunction,
      terminate,
    });
  });

  afterEach(async () => {
    try {
      await rm(workspace, { recursive: true, force: true });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('should throw when --ext is not a supported format and not invoke the runtime', async () => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=totally-bogus'] })).rejects.toThrow(
      /Unsupported format: "totally-bogus"/,
    );

    const runtime = await importedRuntime();
    expect(runtime.createNodeClient).not.toHaveBeenCalled();
    expect(exportFunction).not.toHaveBeenCalled();
  });

  it('should throw with the offending payload when --params is not valid JSON', async () => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb', '--params=not-json{'] })).rejects.toThrow(
      /Invalid JSON in --params: not-json{/,
    );
  });

  it('should write exported bytes to disk on success and propagate parsed parameters', async () => {
    const bytes = new Uint8Array(new ArrayBuffer(8));
    bytes.set([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    exportFunction.mockResolvedValueOnce(buildSuccessResult(bytes));
    const command = await importExportCommand();

    const outputPath = join(workspace, 'out.glb');
    await runCommand(command, {
      rawArgs: [inputPath, '--ext=glb', `--output=${outputPath}`, '--params={"width":150}'],
    });

    expect(exportFunction).toHaveBeenCalledWith('glb', { source: { path: 'model.ts' }, parameters: { width: 150 } });
    const written = await readFile(outputPath);
    expect(new Uint8Array(written)).toEqual(bytes);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('should aggregate every issue message when the export result is a failure', async () => {
    exportFunction.mockResolvedValueOnce(buildFailureResult(['boom', 'kaboom']));
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toThrow(
      /Export failed:\n {2}boom\n {2}kaboom/,
    );

    expect(terminate).toHaveBeenCalledOnce();
  });

  it('should call terminate() in finally even when client.export rejects', async () => {
    exportFunction.mockRejectedValueOnce(new Error('worker crashed'));
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toThrow('worker crashed');

    expect(terminate).toHaveBeenCalledOnce();
  });

  it('should subscribe to the log event so client output streams through consola', async () => {
    exportFunction.mockResolvedValueOnce(buildSuccessResult(new Uint8Array(new ArrayBuffer(1))));
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [inputPath, '--ext=glb', `--output=${join(workspace, 'log.glb')}`],
    });

    expect(onFunction).toHaveBeenCalledWith('log', expect.any(Function));
  });

  it('should default the output path to <input-basename>.<ext> next to the source when --output is omitted', async () => {
    const bytes = new Uint8Array(new ArrayBuffer(3));
    bytes.set([1, 2, 3]);
    exportFunction.mockResolvedValueOnce(buildSuccessResult(bytes));
    const command = await importExportCommand();

    await runCommand(command, { rawArgs: [inputPath, '--ext=glb'] });

    const written = await readFile(join(workspace, 'model.glb'));
    expect(written.byteLength).toBe(3);
  });

  it('should warn through consola for every warning issue in a successful export', async () => {
    const result: ExportResult = {
      success: true,
      data: {
        name: 'warn.glb',
        bytes: new Uint8Array([0]),
        mimeType: 'model/gltf-binary',
      },
      issues: [{ severity: 'warning', message: 'mild concern', code: 'RUNTIME' }],
    };
    exportFunction.mockResolvedValueOnce(result);
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [inputPath, '--ext=glb', `--output=${join(workspace, 'warn.glb')}`],
    });

    expect(terminate).toHaveBeenCalledOnce();
  });
});
