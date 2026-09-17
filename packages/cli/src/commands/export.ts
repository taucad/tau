import { defineCommand } from 'citty';
import { resolve, basename, dirname, extname } from 'node:path';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileExtensionSet } from '@taucad/runtime/types';
import type { ExportResult } from '@taucad/runtime';
import type { FileExtension, TelemetryEntry } from '@taucad/runtime/types';
import { createNodeClient, isSafeRelativePath } from '@taucad/runtime/node';
import { ParameterAdmissionError, resolveParameterInputValues } from '@taucad/parameters';
import type { ParameterResolutionOptions } from '@taucad/parameters';
import type { PicogkKernelOptions } from '@taucad/picogk';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { loadCliRuntime } from '#runtime-options.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { buildExportProfile, createPhaseLedger } from '#commands/export-profile.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import type { CliProfilePhase } from '#commands/export-profile.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { cliError, createOutput, emit, exitCodes, sanitize, writeStdout } from '#output.js';

const parseJsonObject = (flag: string, input: string | undefined): Record<string, unknown> | undefined => {
  if (input === undefined) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw cliError('ARG_JSON_INVALID', `Invalid JSON in ${flag}: ${detail}`, exitCodes.usage);
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw cliError('ARG_JSON_INVALID', `${flag} must be a JSON object`, exitCodes.usage);
  }

  return value as Record<string, unknown>;
};

const parseResolutionMode = (input: string | undefined): NonNullable<ParameterResolutionOptions['mode']> => {
  if (input === undefined || input === 'default') {
    return 'default';
  }
  if (input === 'declared-only') {
    return input;
  }
  throw cliError(
    'ARG_PARAMETER_RESOLUTION_INVALID',
    '--resolution-mode must be "default" or "declared-only"',
    exitCodes.usage,
  );
};

const parameterInputFailure = (error: unknown): ReturnType<typeof cliError> => {
  const diagnostics = error instanceof ParameterAdmissionError ? error.diagnostics : undefined;
  const code =
    diagnostics?.[0]?.code ??
    (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'INVALID_SCHEMA');
  return cliError(code, error instanceof Error ? error.message : 'Parameter input is invalid.', {
    exit: exitCodes.refused,
    details: diagnostics === undefined ? undefined : { diagnostics },
  });
};

/*
 * A capability-missing result is the runtime declining a well-formed request, which the
 * caller distinguishes from a model or plugin failure by exit code alone.
 */
const capabilityMissingCodes = new Set(['KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING']);

/**
 * `tau export` command.
 *
 * Renders a CAD source file and exports geometry to the specified format.
 *
 * @example <caption>Export a model to GLB</caption>
 * ```bash
 * tau export model.ts --ext=glb
 * tau export bambu-plate.ts --ext=stl --output=plate.stl
 * tau export gear.ts --ext=step --params='{"teeth":24}'
 * tau export model.ts --ext=stl --export-options='{"binary":true}'
 * tau export model.ts --ext=webp --export-options='{"width":1024,"height":576}'
 * tau export model.ts --ext=glb --content='{"includeEdges":true}'
 * tau export model.ts --ext=glb --config=./tau.config.mjs
 * tau export model.ts --ext=glb --telemetry=./profile.json
 * tau export model.ts --ext=stl --json
 * tau export model.ts --ext=stl --output=- | wc -c
 * ```
 */
export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export a CAD file to a target format',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Input CAD file path (e.g. model.ts)',
      required: true,
    },
    ext: {
      type: 'string',
      description: 'Target extension; route availability depends on the input source (e.g. glb, stl, step)',
      required: true,
    },
    output: {
      type: 'string',
      description:
        'Output file path, or "-" to stream the single artifact to stdout (defaults to <input-basename>.<ext>)',
      required: false,
    },
    params: {
      type: 'string',
      description: 'JSON-encoded parameters for the model (e.g. \'{"width":100}\')',
      required: false,
    },
    resolutionMode: {
      type: 'string',
      description: 'Parameter semantic resolution: default or declared-only',
      required: false,
    },
    exportOptions: {
      type: 'string',
      description: 'JSON object of options for the source-selected export route',
      required: false,
    },
    content: {
      type: 'string',
      description: 'JSON object of semantic content requested from the source-selected export route',
      required: false,
    },
    plugin: {
      type: 'string',
      description: 'Default-invoked plugin package or path installed in the invoking project (repeatable)',
      required: false,
      multiple: true,
    },
    config: {
      type: 'string',
      description: 'Configuration module exporting an invoked "plugins" array',
      required: false,
    },
    telemetry: {
      type: 'string',
      description: 'Write a process-relative CLI phase ledger and runtime span profile to a JSON file',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON result record to stdout instead of nothing',
      required: false,
    },
  },
  async run({ args }) {
    const output = await createOutput();
    const profileLedger = args.telemetry ? createPhaseLedger() : undefined;
    profileLedger?.checkpoint('process.startup');
    const format = args.ext as FileExtension;

    if (!fileExtensionSet.has(format)) {
      throw cliError('EXT_UNRECOGNIZED', `Unrecognized target extension: "${args.ext}"`, exitCodes.usage);
    }

    const inputPath = resolve(args.file);
    const inputDirectory = dirname(inputPath);
    const inputBasename = basename(inputPath, extname(inputPath));
    const inputFilename = basename(inputPath);
    const streamToStdout = args.output === '-';
    const outputPath = streamToStdout
      ? '-'
      : args.output
        ? resolve(args.output)
        : resolve(inputDirectory, `${inputBasename}.${format}`);
    const telemetryPath = args.telemetry ? resolve(args.telemetry) : undefined;

    if (streamToStdout && args.json) {
      throw cliError(
        'OUTPUT_STREAM_CONFLICT',
        '--output - streams raw bytes to stdout and cannot be combined with --json. Pass a file path to get both.',
        exitCodes.usage,
      );
    }

    const suppliedParameters = parseJsonObject('--params', args.params) ?? {};
    const resolutionMode = parseResolutionMode(args.resolutionMode);
    const exportOptions = parseJsonObject('--export-options', args.exportOptions);
    const content = parseJsonObject('--content', args.content);

    try {
      await stat(inputPath);
    } catch {
      throw cliError(
        'INPUT_NOT_FOUND',
        `Input file not found: ${inputPath}. Check the path, or run the command from the project that contains it.`,
        exitCodes.refused,
      );
    }

    output.start(`Exporting ${inputFilename} → ${streamToStdout ? 'stdout' : basename(outputPath)}`);
    profileLedger?.checkpoint('cli.prepare');

    const projectRoot = process.cwd();
    const picogkResourceRoot = process.env['TAU_PICOGK_RESOURCE_ROOT'];
    let picogk: PicogkKernelOptions | undefined;
    if (picogkResourceRoot) {
      const { loadPicogkKernelOptions } = await import('@taucad/picogk');
      picogk = loadPicogkKernelOptions({
        resourceRoot: resolve(picogkResourceRoot),
      });
    }
    const runtime = await loadCliRuntime({
      projectRoot,
      plugin: args.plugin,
      config: args.config,
      ...(picogk ? { picogk } : {}),
    });
    profileLedger?.checkpoint('cli.load-configured-plugins');
    profileLedger?.checkpoint('cli.create-runtime');
    const client = await createNodeClient({
      runtime,
      projectPath: inputDirectory,
    });
    profileLedger?.checkpoint('runtime.create-client');
    const telemetryEntries: TelemetryEntry[] = [];

    client.on('log', (entry) => {
      const level = entry.level as 'info' | 'warn' | 'error' | 'debug';
      if (level in output) {
        output[level](sanitize(entry.message));
      }
    });
    if (telemetryPath) {
      client.on('telemetry', (batch) => telemetryEntries.push(...batch.entries));
    }

    let runtimeExportPhase: CliProfilePhase | undefined;
    let profileArtifacts: Array<{ name: string; path: string; bytes: number }> = [];
    /*
     * Without these handlers the default signal disposition kills the process before
     * the worker is drained, so an interrupted export leaks its in-process runtime.
     */
    const stopped = Promise.withResolvers<NodeJS.Signals>();
    const onSignal = (signal: NodeJS.Signals): void => {
      stopped.resolve(signal);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
      const parameterResult = await client.resolveParameters({
        source: { path: inputFilename },
        resolution: { mode: resolutionMode },
      });
      if (!parameterResult.success) {
        const issue = parameterResult.issues[0];
        throw cliError(issue?.code ?? 'RUNTIME', issue?.message ?? 'Parameter manifest resolution failed.', {
          exit: exitCodes.refused,
          details: {
            diagnostics: issue?.details ?? parameterResult.issues,
          },
        });
      }
      let parameters: Readonly<Record<string, unknown>>;
      try {
        parameters = resolveParameterInputValues(parameterResult.data, suppliedParameters);
      } catch (error) {
        throw parameterInputFailure(error);
      }
      const exportOutcome = async (): Promise<{
        readonly type: 'result';
        readonly value: ExportResult;
      }> => ({
        type: 'result',
        value: await client.export(format, {
          source: { path: inputFilename },
          parameters,
          ...(exportOptions === undefined ? {} : { exportOptions }),
          ...(content === undefined ? {} : { content }),
        }),
      });
      const signalOutcome = async (): Promise<{
        readonly type: 'signal';
        readonly signal: NodeJS.Signals;
      }> => ({
        type: 'signal',
        signal: await stopped.promise,
      });
      // Promise.race subscribes to both, so a late export failure is never unhandled.
      const outcome = await Promise.race([exportOutcome(), signalOutcome()]);
      if (outcome.type === 'signal') {
        throw cliError(
          'EXPORT_CANCELLED',
          `Export cancelled by ${outcome.signal}; no artifact written`,
          outcome.signal === 'SIGINT' ? exitCodes.interrupted : exitCodes.terminated,
        );
      }
      const result = outcome.value;
      runtimeExportPhase = profileLedger?.checkpoint('runtime.export');

      if (!result.success) {
        const messages = result.issues
          .map((issue) =>
            issue.code === 'KERNEL_CAPABILITY_MISSING'
              ? `${issue.message} — or rerun with --plugin <package>`
              : issue.message,
          )
          .join('\n  ');
        throw cliError(
          result.issues.find((issue) => issue.severity === 'error')?.code ?? 'EXPORT_FAILED',
          `Export failed:\n  ${sanitize(messages)}`,
          result.issues.some((issue) => capabilityMissingCodes.has(issue.code)) ? exitCodes.refused : exitCodes.error,
        );
      }

      for (const issue of result.issues) {
        if (issue.severity === 'warning') {
          output.warn(sanitize(issue.message));
        }
      }

      if (streamToStdout && result.data.length !== 1) {
        throw cliError(
          'OUTPUT_STREAM_AMBIGUOUS',
          `--output - streams one artifact, but this export produced ${result.data.length}. Pass a file path instead.`,
          exitCodes.usage,
        );
      }

      const outputDirectory = dirname(outputPath);
      const targetPaths = streamToStdout
        ? ['-']
        : result.data.map((file, index) => {
            if (!isSafeRelativePath(file.name)) {
              throw new Error(`Export returned an unsafe relative artifact path: ${file.name}`);
            }
            return index === 0 ? outputPath : resolve(outputDirectory, file.name);
          });
      if (!streamToStdout) {
        if (new Set(targetPaths).size !== targetPaths.length) {
          throw new Error(`Export artifact paths collide under ${outputDirectory}`);
        }
        if (telemetryPath && targetPaths.includes(telemetryPath)) {
          throw new Error(`Telemetry output path collides with an export artifact: ${telemetryPath}`);
        }
      }
      profileArtifacts = result.data.map((file, index) => ({
        name: file.name,
        path: targetPaths[index]!,
        bytes: file.bytes.byteLength,
      }));
      profileLedger?.checkpoint('cli.validate-artifacts');

      if (streamToStdout) {
        const [file] = result.data;
        await writeStdout(file!.bytes);
        output.success(`Wrote ${file!.bytes.byteLength} bytes → stdout`);
      } else {
        for (const [index, file] of result.data.entries()) {
          const targetPath = targetPaths[index]!;
          // oxlint-disable-next-line no-await-in-loop -- Preflight completes before ordered filesystem writes begin.
          await mkdir(dirname(targetPath), { recursive: true });
          // oxlint-disable-next-line no-await-in-loop -- Ordered writes preserve producer artifact order in logs.
          await writeFile(targetPath, file.bytes);
          output.success(`Wrote ${file.bytes.byteLength} bytes → ${targetPath}`);
        }
      }
      profileLedger?.checkpoint('cli.write-artifacts');

      if (args.json) {
        await emit({
          kind: 'export',
          ok: true,
          input: inputPath,
          format,
          artifacts: result.data.map((file, index) => ({
            name: file.name,
            path: targetPaths[index]!,
            bytes: file.bytes.byteLength,
            ext: extname(file.name).slice(1) || format,
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
          })),
        });
      }
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      await client.shutdown({ drain: true });
      profileLedger?.checkpoint('runtime.shutdown');
    }

    if (telemetryPath && profileLedger && runtimeExportPhase) {
      const profile = buildExportProfile({
        phases: profileLedger.phases,
        telemetry: telemetryEntries,
        runtimeExportPhase,
        workload: {
          inputPath,
          outputPath,
          format,
          artifacts: profileArtifacts,
        },
      });
      await mkdir(dirname(telemetryPath), { recursive: true });
      await writeFile(telemetryPath, `${JSON.stringify(profile, undefined, 2)}\n`, 'utf8');
      output.info(`Wrote telemetry profile → ${telemetryPath}`);
    }
  },
});
