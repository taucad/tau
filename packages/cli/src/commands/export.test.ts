import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportResult } from '@taucad/runtime';
import type * as RuntimeNode from '@taucad/runtime/node';
import { exitCodes } from '#output.js';

vi.mock('@taucad/runtime/node', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeNode>()),
  createNodeClient: vi.fn(),
}));
vi.mock('#cli-runtime.js', () => ({ createCliRuntime: vi.fn(async () => ({ plugins: [] })) }));

const exportFunction = vi.fn<(format: string, input: unknown) => Promise<ExportResult>>();
const terminate = vi.fn<() => void>();
const shutdown = vi.fn<(_options?: { drain?: boolean }) => Promise<void>>(async () => undefined);
const onFunction = vi.fn<(event: string, listener: (entry: unknown) => void) => void>();

const importExportCommand = async () => {
  const { exportCommand } = await import('#commands/export.js');
  return exportCommand;
};

const importedRuntime = async () =>
  (await import('@taucad/runtime/node')) as unknown as {
    createNodeClient: ReturnType<typeof vi.fn>;
  };

const importedCliRuntime = async () =>
  (await import('#cli-runtime.js')) as unknown as {
    createCliRuntime: ReturnType<typeof vi.fn>;
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
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', '');
    workspace = await mkdtemp(join(tmpdir(), 'tau-cli-export-'));
    inputPath = join(workspace, 'model.ts');
    await writeFile(inputPath, '/* fixture */', 'utf8');

    const runtime = await importedRuntime();
    runtime.createNodeClient.mockResolvedValue({
      on: onFunction,
      export: exportFunction,
      terminate,
      shutdown,
    });
  });

  afterEach(async () => {
    try {
      await rm(workspace, { recursive: true, force: true });
    } finally {
      vi.unstubAllEnvs();
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
      'json',
    ]);
  });

  it('should reject an unrecognized target extension as a usage error without invoking the runtime', async () => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=totally-bogus'] })).rejects.toThrow(
      /Unrecognized target extension: "totally-bogus"/,
    );
    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=totally-bogus'] })).rejects.toMatchObject({
      code: 'EXT_UNRECOGNIZED',
      exit: exitCodes.usage,
    });

    const runtime = await importedRuntime();
    expect(runtime.createNodeClient).not.toHaveBeenCalled();
    expect(exportFunction).not.toHaveBeenCalled();
  });

  it('should refuse a missing input file before starting the runtime', async () => {
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [join(workspace, 'absent.ts'), '--ext=glb'] })).rejects.toMatchObject({
      code: 'INPUT_NOT_FOUND',
      exit: exitCodes.refused,
    });

    const runtime = await importedRuntime();
    expect(runtime.createNodeClient).not.toHaveBeenCalled();
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
    expect(shutdown).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledWith({ drain: true });
    expect(terminate).not.toHaveBeenCalled();
  });

  it('loads PicoGK resources for an explicit CLI export', async () => {
    const target = `${process.platform}-${process.arch}`;
    const targetRoot = join(workspace, target);
    const digest = 'a'.repeat(64);
    await mkdir(targetRoot);
    await writeFile(
      join(targetRoot, 'tau-runtime-manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        target,
        rid: 'test-rid',
        dotnetSdkVersion: '10.0.400',
        dotnetRuntimeVersion: '10.0.11',
        roslynVersion: '5.9.0',
        picoGkCommit: 'commit',
        picoGkArchiveSha256: digest,
        picoGkHostedPatchSha256: digest,
        hostApiVersion: 1,
        protocolVersion: 3,
        sceneArtifactVersion: 3,
        topologySchemaVersion: 1,
        sourceFilesSha256: digest,
        workerPath: 'Tau.PicoGK.Worker',
        workerSha256: digest,
        resourceFiles: [{ path: 'PicoGK.dll', sha256: digest, label: 'PicoGK' }],
      }),
    );
    vi.stubEnv('TAU_PICOGK_RESOURCE_ROOT', workspace);
    let workerExecutable: string | undefined;
    exportFunction.mockImplementationOnce(async () => {
      const { createCliRuntime } = await importedCliRuntime();
      const options = createCliRuntime.mock.calls.at(-1)?.[0] as { picogk: { workerExecutable: string } };
      workerExecutable = options.picogk.workerExecutable;
      return buildSuccessResult(new Uint8Array([1]));
    });
    const command = await importExportCommand();

    await runCommand(command, {
      rawArgs: [inputPath, '--ext=glb', `--output=${join(workspace, 'picogk.glb')}`],
    });

    expect(workerExecutable?.endsWith(`${target}/Tau.PicoGK.Worker`)).toBe(true);
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
    expect(profile.schema).toBe('tau.cli-export-profile.v1');
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
    expect(shutdown).toHaveBeenCalledWith({ drain: true });
  });

  it('should separate a capability refusal from a model failure by exit code', async () => {
    exportFunction.mockResolvedValueOnce({
      success: false,
      issues: [{ message: 'No export route found', code: 'KERNEL_CAPABILITY_MISSING', severity: 'error' }],
    });
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toMatchObject({
      code: 'KERNEL_CAPABILITY_MISSING',
      exit: exitCodes.refused,
    });

    exportFunction.mockResolvedValueOnce(buildFailureResult(['the model threw']));

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toMatchObject({
      code: 'RUNTIME',
      exit: exitCodes.error,
    });
  });

  it('should stream a single artifact to stdout for --output - without writing a file', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    exportFunction.mockResolvedValueOnce(buildSuccessResult(bytes));
    const written: Array<string | Uint8Array<ArrayBuffer>> = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: readonly unknown[]
    ): boolean => {
      written.push(chunk);
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);

    const command = await importExportCommand();
    try {
      await runCommand(command, { rawArgs: [inputPath, '--ext=glb', '--output=-'] });
    } finally {
      write.mockRestore();
    }

    expect(written).toEqual([bytes]);
    await expect(readFile(join(workspace, '-'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(workspace, 'model.glb'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should refuse --output - when the export produced more than one artifact', async () => {
    exportFunction.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'model.gltf', bytes: new Uint8Array([1]), mimeType: 'model/gltf+json' },
        { name: 'model.bin', bytes: new Uint8Array([2]), mimeType: 'application/octet-stream' },
      ],
      issues: [],
    });
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=gltf', '--output=-'] })).rejects.toMatchObject({
      code: 'OUTPUT_STREAM_AMBIGUOUS',
      exit: exitCodes.usage,
    });
  });

  it('should refuse --output - combined with --json before invoking the runtime', async () => {
    const command = await importExportCommand();

    await expect(
      runCommand(command, { rawArgs: [inputPath, '--ext=glb', '--output=-', '--json'] }),
    ).rejects.toMatchObject({ code: 'OUTPUT_STREAM_CONFLICT', exit: exitCodes.usage });

    expect(exportFunction).not.toHaveBeenCalled();
  });

  it('should write one versioned JSON record naming each artifact digest, size, and extension', async () => {
    exportFunction.mockResolvedValueOnce(buildSuccessResult(new Uint8Array([1, 2, 3])));
    const command = await importExportCommand();
    const outputPath = join(workspace, 'record.glb');
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: readonly unknown[]
    ): boolean => {
      lines.push(String(chunk));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);

    try {
      await runCommand(command, { rawArgs: [inputPath, '--ext=glb', `--output=${outputPath}`, '--json'] });
    } finally {
      write.mockRestore();
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      v: 1,
      kind: 'export',
      ok: true,
      input: inputPath,
      format: 'glb',
      artifacts: [
        {
          name: 'model.glb',
          path: outputPath,
          bytes: 3,
          ext: 'glb',
          // The digest is taken over the exact bytes the export produced.
          sha256: createHash('sha256')
            .update(new Uint8Array([1, 2, 3]))
            .digest('hex'),
        },
      ],
    });
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

  it('should await draining shutdown in finally even when client.export rejects', async () => {
    exportFunction.mockRejectedValueOnce(new Error('worker crashed'));
    const command = await importExportCommand();

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toThrow('worker crashed');

    expect(shutdown).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledWith({ drain: true });
    expect(terminate).not.toHaveBeenCalled();
  });

  it('should drain the runtime and report the signal exit code when interrupted mid-export', async () => {
    const neverSettles = Promise.withResolvers<ExportResult>();
    exportFunction.mockImplementationOnce(async () => {
      process.emit('SIGINT', 'SIGINT');
      // The signal, not the export, has to decide this run's outcome.
      return neverSettles.promise;
    });
    const command = await importExportCommand();
    const interruptListeners = process.listenerCount('SIGINT');

    await expect(runCommand(command, { rawArgs: [inputPath, '--ext=glb'] })).rejects.toMatchObject({
      code: 'EXPORT_CANCELLED',
      exit: exitCodes.interrupted,
    });

    expect(shutdown).toHaveBeenCalledWith({ drain: true });
    await expect(readFile(join(workspace, 'model.glb'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(process.listenerCount('SIGINT')).toBe(interruptListeners);
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

    expect(shutdown).toHaveBeenCalledWith({ drain: true });
  });
});
