/**
 * `tau export --out <dir>`: `tau export` as a GeoSpec subprocess protocol 1 server, so `geospec`'s
 * `commandExporter` (and Python's `command_loader`) can export a Tau project through the CLI.
 *
 * GeoSpec runs `tau export --file <path> --format <glb|step> --project <root> --out <dir>`, adding
 * `--parameters-json <json>`, `--mesh-linear-tolerance <n>`, `--mesh-angular-tolerance-degrees <n>` and
 * `--region-min <x,y,z> --region-max <x,y,z>` when the request carries them; `--plugin` and `--config` compose the
 * runtime as they do for `tau export`. The export goes through {@link tauExporter}, the route `tau test` takes, and
 * the command prints exactly one JSON document on stdout: on success (exit 0)
 * `{ protocol: 1, format, sourceUnit?, primary, resources, consumedSources }` with the files under `--out`, on failure
 * `{ protocol: 1, error: { code, message, suggestion? } }`, exiting 2 for an unusable request (a format the exporter does not declare among them), 3 for one the runtime
 * declined and 1 otherwise.
 *
 * @module
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { GeoSpecExportFormat, GeoSpecModelExportRequest } from 'geospec/model';

import { tauExporter } from '#geospec/tau-exporter.js';
import { cliError, exitCodeFor, exitCodes, sanitize, writeStdout } from '#output.js';

/** One protocol 1 document. */
type ProtocolDocument =
  | Readonly<{
      protocol: 1;
      format: GeoSpecExportFormat;
      sourceUnit?: string;
      primary: string;
      resources: ReadonlyArray<Readonly<{ name: string; path: string }>>;
      consumedSources: ReadonlyArray<Readonly<{ path: string; sha256: string }>>;
    }>
  | Readonly<{ protocol: 1; error: Readonly<{ code: string; message: string; suggestion?: string }> }>;

/** Diagnostic codes that mean the runtime declined a well-formed request. */
const declinedCodes = new Set([
  'KERNEL_CAPABILITY_MISSING',
  'TRANSCODER_CAPABILITY_MISSING',
  'KERNEL_NOT_PREPARED',
  'GEOSPEC_EXPORTER_UNSUPPORTED',
  'GEOSPEC_MODEL_REGION_UNSUPPORTED',
]);

const usage = (message: string): Error => cliError('ARG_INVALID', message, exitCodes.usage);

const finite = (flag: string, value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (value.trim() === '' || !Number.isFinite(number)) {
    throw usage(`${flag} must be a finite number.`);
  }
  return number;
};

const point = (flag: string, value: string): readonly [number, number, number] => {
  const parts = value.split(',');
  if (parts.length !== 3) {
    throw usage(`${flag} must be three comma-separated numbers.`);
  }
  const [x, y, z] = parts.map((part) => finite(flag, part)!);
  return [x!, y!, z!];
};

/** What one protocol call asks for. */
type ProtocolCall = Readonly<{
  request: GeoSpecModelExportRequest;
  out: string;
  plugins: readonly string[];
  config?: string;
}>;

const parametersOf = (json: string | undefined): Record<string, unknown> | undefined => {
  if (json === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw usage(`Invalid JSON in --parameters-json: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw usage('--parameters-json must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
};

const meshOf = (linear: string | undefined, angular: string | undefined): GeoSpecModelExportRequest['mesh'] => {
  const linearTolerance = finite('--mesh-linear-tolerance', linear);
  const angularToleranceDegrees = finite('--mesh-angular-tolerance-degrees', angular);
  return linearTolerance === undefined && angularToleranceDegrees === undefined
    ? undefined
    : {
        ...(linearTolerance === undefined ? {} : { linearTolerance }),
        ...(angularToleranceDegrees === undefined ? {} : { angularToleranceDegrees }),
      };
};

const regionOf = (min: string | undefined, max: string | undefined): GeoSpecModelExportRequest['region'] => {
  if (min === undefined && max === undefined) {
    return undefined;
  }
  if (min === undefined || max === undefined) {
    throw usage('--region-min and --region-max come together.');
  }
  return { min: point('--region-min', min), max: point('--region-max', max) };
};

const protocolOptions = {
  file: { type: 'string' },
  format: { type: 'string' },
  project: { type: 'string' },
  out: { type: 'string' },
  'parameters-json': { type: 'string' },
  'mesh-linear-tolerance': { type: 'string' },
  'mesh-angular-tolerance-degrees': { type: 'string' },
  'region-min': { type: 'string' },
  'region-max': { type: 'string' },
  plugin: { type: 'string', multiple: true },
  config: { type: 'string' },
  json: { type: 'boolean' },
} as const;

/**
 * Attach a region coordinate to its flag. `commandExporter` passes `--region-min -5,0,0` as two arguments, and strict
 * `parseArgs` refuses an option value that starts with a dash unless it is written `--region-min=-5,0,0`.
 *
 * @param argv - The arguments after `export`.
 * @returns The arguments with each region coordinate joined to its flag.
 */
const joinRegionValues = (argv: readonly string[]): string[] => {
  const joined: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = argv[index + 1];
    if ((argument === '--region-min' || argument === '--region-max') && value !== undefined) {
      joined.push(`${argument}=${value}`);
      index += 1;
    } else {
      joined.push(argument);
    }
  }
  return joined;
};

/**
 * Read GeoSpec's protocol 1 flags into an export request.
 *
 * @internal
 * @param argv - The arguments after `export`.
 * @returns The export request, the output directory and the runtime composition.
 * @throws {CliError} `ARG_INVALID` for a missing, unknown or malformed argument.
 */
export const parseProtocolArguments = (argv: readonly string[]): ProtocolCall => {
  let values: ReturnType<typeof parseArgs<{ args: string[]; strict: true; options: typeof protocolOptions }>>['values'];
  try {
    ({ values } = parseArgs({
      args: joinRegionValues(argv),
      strict: true,
      allowPositionals: false,
      options: protocolOptions,
    }));
  } catch (error) {
    throw usage((error as Error).message);
  }
  const { file, format, project, out } = values;
  if (file === undefined || format === undefined || project === undefined || out === undefined) {
    throw usage('Protocol 1 needs --file, --format, --project and --out.');
  }
  const parameters = parametersOf(values['parameters-json']);
  const mesh = meshOf(values['mesh-linear-tolerance'], values['mesh-angular-tolerance-degrees']);
  const region = regionOf(values['region-min'], values['region-max']);
  return {
    request: {
      file,
      /* The exporter's declared formats decide; `runExportProtocol` refuses any other before exporting. */
      format: format as GeoSpecModelExportRequest['format'],
      projectPath: resolve(project),
      ...(parameters === undefined ? {} : { parameters }),
      ...(mesh === undefined ? {} : { mesh }),
      ...(region === undefined ? {} : { region }),
    },
    out: resolve(out),
    plugins: values.plugin ?? [],
    ...(values.config === undefined ? {} : { config: values.config }),
  };
};

/**
 * Write one artifact file under `out`, refusing a name that leaves it.
 *
 * @param out - The output directory.
 * @param name - The artifact's relative name.
 * @param bytes - Its contents.
 * @returns The name, relative to `out`.
 */
const writeUnder = async (out: string, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const target = resolve(out, name);
  const inside = relative(out, target);
  if (inside === '' || inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) {
    throw cliError('EXPORT_FAILED', `The export named an artifact outside --out: ${name}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return inside.split(sep).join('/');
};

/**
 * The document for a failure: a GeoSpec diagnostic keeps its code and suggestion, and a CLI error its code and exit.
 *
 * @param error - What the export threw.
 * @returns The error document and its exit code.
 */
const failureOf = (error: unknown): { readonly document: ProtocolDocument; readonly exit: number } => {
  const { diagnostics, code: errorCode } = error as {
    readonly diagnostics?: ReadonlyArray<{ code: string; message: string; suggestion?: string }>;
    readonly code?: unknown;
  };
  const [diagnostic] = diagnostics ?? [];
  const code = diagnostic?.code ?? (typeof errorCode === 'string' ? errorCode : 'EXPORT_FAILED');
  const message = diagnostic?.message ?? (error instanceof Error ? error.message : String(error));
  return {
    document: {
      protocol: 1,
      error: {
        code,
        message: sanitize(message),
        ...(diagnostic?.suggestion === undefined ? {} : { suggestion: sanitize(diagnostic.suggestion) }),
      },
    },
    exit: diagnostic === undefined ? exitCodeFor(error) : declinedCodes.has(code) ? exitCodes.refused : exitCodes.error,
  };
};

/**
 * Serve one protocol 1 export.
 *
 * @param argv - The arguments after `export`.
 * @returns The exit code; the document is already on stdout.
 */
export const runExportProtocol = async (argv: readonly string[]): Promise<number> => {
  let document: ProtocolDocument;
  let exit: number = exitCodes.ok;
  try {
    const { request, out, plugins, config } = parseProtocolArguments(argv);
    const exporter = await tauExporter({
      projectPath: request.projectPath,
      plugins,
      ...(config === undefined ? {} : { config }),
    });
    try {
      if (!exporter.capabilities.formats.includes(request.format)) {
        throw usage(`--format must be ${exporter.capabilities.formats.join(' or ')}, not "${request.format}".`);
      }
      const artifact = await exporter.export(request);
      const primary = await writeUnder(out, `model.${artifact.format}`, artifact.bytes);
      const resources = [];
      for (const { name, bytes } of artifact.resources ?? []) {
        // oxlint-disable-next-line no-await-in-loop -- ordered writes keep the resources in the export's order.
        resources.push({ name, path: await writeUnder(out, name, bytes) });
      }
      document = {
        protocol: 1,
        format: artifact.format,
        ...(artifact.sourceUnit === undefined ? {} : { sourceUnit: artifact.sourceUnit }),
        primary,
        resources,
        consumedSources: artifact.consumedSources ?? [],
      };
    } finally {
      await exporter.close?.();
    }
  } catch (error) {
    ({ document, exit } = failureOf(error));
  }
  await writeStdout(`${JSON.stringify(document)}\n`);
  return exit;
};
