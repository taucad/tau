import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportResult } from '@taucad/runtime';
import type * as RuntimeNode from '@taucad/runtime/node';

vi.mock('@taucad/runtime/node', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeNode>()),
  createNodeClient: vi.fn(),
}));
vi.mock('#cli-runtime.js', () => ({ createCliRuntime: vi.fn(async () => ({ plugins: [] })) }));

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
  data: [
    {
      name: 'model.glb',
      bytes,
      mimeType: 'model/gltf-binary',
    },
  ],
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

  it('should expose only structural arguments and opaque runtime envelopes', async () => {
    const command = await importExportCommand();

    expect(Object.keys(command.args ?? {})).toEqual([
      'file',
      'ext',
      'output',
      'params',
      'exportOptions',
      'content',
      'plugin',
      'config',
      'telemetry',
    ]);
  });

  it('should reject an unrecognized target extension without invoking the runtime', async () => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=totally-bogus'] })).rejects.toThrow(
      /Unrecognized target extension: "totally-bogus"/,
    );

    const runtime = await importedRuntime();
    expect(runtime.createNodeClient).not.toHaveBeenCalled();
    expect(exportFunction).not.toHaveBeenCalled();
  });

  it.each(['--params', '--export-options', '--content'])('should report malformed JSON for %s', async (flag) => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb', `${flag}=not-json{`] })).rejects.toThrow(
      new RegExp(`Invalid JSON in ${flag}:`),
    );
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"value"'],
    ['number', '42'],
    ['boolean', 'false'],
  ])('should reject a %s JSON root for every object envelope', async (_kind, value) => {
    const command = await importExportCommand();

    for (const flag of ['--params', '--export-options', '--content']) {
      // oxlint-disable-next-line no-await-in-loop -- Each assertion exercises the same command boundary independently.
      await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb', `${flag}=${value}`] })).rejects.toThrow(
        `${flag} must be a JSON object`,
      );
    }
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

  it('should write a gap-free CLI ledger and normalized runtime telemetry profile', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const telemetryPath = join(workspace, 'profile.json');
    exportFunction.mockImplementationOnce(async () => {
      const telemetryListener = onFunction.mock.calls.find(([event]) => event === 'telemetry')?.[1];
      telemetryListener?.([
        {
          name: 'kernel.export-model',
          startTime: performance.now(),
          duration: 0,
          workerTimeOrigin: performance.timeOrigin,
          detail: { spanId: 'root', format: 'glb' },
        },
      ]);
      return buildSuccessResult(bytes);
    });
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [inputPath, '--ext=glb', `--output=${join(workspace, 'profiled.glb')}`, `--telemetry=${telemetryPath}`],
    });

    const profile = JSON.parse(await readFile(telemetryPath, 'utf8')) as {
      schema: string;
      accounting: { profiledDuration: number; phaseDurationSum: number; unaccounted: number };
      runtime: { spans: Array<{ name: string; selfDuration: number }> };
    };
    expect(profile.schema).toBe('taucad.cli-export-profile.v1');
    expect(profile.accounting.phaseDurationSum).toBeCloseTo(profile.accounting.profiledDuration, 10);
    expect(profile.accounting.unaccounted).toBe(0);
    expect(profile.runtime.spans).toEqual([expect.objectContaining({ name: 'kernel.export-model', selfDuration: 0 })]);
    expect(onFunction).toHaveBeenCalledWith('telemetry', expect.any(Function));
  });

  it('loads an explicit named plugin from the invoking project', async () => {
    exportFunction.mockResolvedValueOnce(buildSuccessResult(new Uint8Array([1])));
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [inputPath, '--ext=webp', `--output=${join(workspace, 'out.webp')}`, '--plugin=@taucad/zoo'],
    });

    const runtime = await importedRuntime();
    expect(runtime.createNodeClient).toHaveBeenCalledOnce();
  });

  it('should preserve opaque parameters, export options, and content as separate JSON objects', async () => {
    exportFunction.mockResolvedValueOnce(buildSuccessResult(new Uint8Array([1])));
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [
        inputPath,
        '--ext=glb',
        `--output=${join(workspace, 'opaque.glb')}`,
        '--params={"count":0,"enabled":false,"label":"","nested":{"values":[1,"two",false]}}',
        '--export-options={"futurePluginOption":{"enabled":false,"values":[0,"",true]}}',
        '--content={"futureSemantic":{"required":false},"labels":["one","two"]}',
      ],
    });

    expect(exportFunction).toHaveBeenCalledWith('glb', {
      source: { path: 'model.ts' },
      parameters: {
        count: 0,
        enabled: false,
        label: '',
        nested: { values: [1, 'two', false] },
      },
      exportOptions: { futurePluginOption: { enabled: false, values: [0, '', true] } },
      content: { futureSemantic: { required: false }, labels: ['one', 'two'] },
    });
  });

  it('should preserve explicitly supplied empty envelopes', async () => {
    exportFunction.mockResolvedValueOnce(buildSuccessResult(new Uint8Array([1])));
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [
        inputPath,
        '--ext=glb',
        `--output=${join(workspace, 'empty-envelopes.glb')}`,
        '--export-options={}',
        '--content={}',
      ],
    });

    expect(exportFunction).toHaveBeenCalledWith('glb', {
      source: { path: 'model.ts' },
      parameters: {},
      exportOptions: {},
      content: {},
    });
  });

  it('should rename only the primary artifact and preserve nested companion paths', async () => {
    exportFunction.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'model.gltf', bytes: new Uint8Array([1]), mimeType: 'model/gltf+json' },
        {
          name: 'buffers/model.bin',
          bytes: new Uint8Array([2, 3]),
          mimeType: 'application/octet-stream',
        },
      ],
      issues: [],
    });
    const command = await importExportCommand();
    const outputPath = join(workspace, 'renamed.gltf');

    await runCommand(command, { rawArgs: [inputPath, '--ext=gltf', `--output=${outputPath}`] });

    await expect(readFile(outputPath)).resolves.toEqual(Buffer.from([1]));
    await expect(readFile(join(workspace, 'buffers/model.bin'))).resolves.toEqual(Buffer.from([2, 3]));
  });

  it('should reject unsafe companion paths before writing the primary artifact', async () => {
    exportFunction.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'model.gltf', bytes: new Uint8Array([1]), mimeType: 'model/gltf+json' },
        { name: '../model.bin', bytes: new Uint8Array([2]), mimeType: 'application/octet-stream' },
      ],
      issues: [],
    });
    const command = await importExportCommand();
    const outputPath = join(workspace, 'safe.gltf');

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=gltf', `--output=${outputPath}`] })).rejects.toThrow(
      'Export returned an unsafe relative artifact path: ../model.bin',
    );
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should reject resolved path collisions before writing any artifact', async () => {
    exportFunction.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'model.gltf', bytes: new Uint8Array([1]), mimeType: 'model/gltf+json' },
        { name: 'model.bin', bytes: new Uint8Array([2]), mimeType: 'application/octet-stream' },
      ],
      issues: [],
    });
    const command = await importExportCommand();
    const outputPath = join(workspace, 'model.bin');

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=gltf', `--output=${outputPath}`] })).rejects.toThrow(
      `Export artifact paths collide under ${workspace}`,
    );
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should aggregate every issue message when the export result is a failure', async () => {
    exportFunction.mockResolvedValueOnce(buildFailureResult(['boom', 'kaboom']));
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toThrow(
      /Export failed:\n {2}boom\n {2}kaboom/,
    );

    expect(terminate).toHaveBeenCalledOnce();
  });

  it('should leave recognized but unroutable targets to the runtime', async () => {
    exportFunction.mockResolvedValueOnce(buildFailureResult(['No export route found for format "usda"']));
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=usda'] })).rejects.toThrow(
      'No export route found for format "usda"',
    );
    expect(exportFunction).toHaveBeenCalledWith('usda', {
      source: { path: 'model.ts' },
      parameters: {},
    });
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
      data: [
        {
          name: 'warn.glb',
          bytes: new Uint8Array([0]),
          mimeType: 'model/gltf-binary',
        },
      ],
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
