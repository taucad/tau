/**
 * `commandExporter`: any command that speaks GeoSpec subprocess protocol 1 becomes a model exporter.
 *
 * Protocol 1: GeoSpec runs `<command…> --file <path> --format <glb|step> --project <root> --out <dir>`,
 * adding `--parameters-json <json>`, `--mesh-linear-tolerance <n>`, `--mesh-angular-tolerance-degrees <n>`
 * and `--region-min <x,y,z> --region-max <x,y,z>` when the request carries them. The command writes the
 * artifact under `--out` and prints one JSON document on stdout: on success (exit 0)
 * `{ protocol: 1, format, sourceUnit?, primary, resources?: [{ name, path }], consumedSources }`, on
 * failure (non-zero exit) `{ protocol: 1, error: { code, message, suggestion? } }`.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type {
  GeoSpecExporterCapabilities,
  GeoSpecModelArtifact,
  GeoSpecModelExporter,
  GeoSpecModelExportRequest,
} from '#model/types.js';

/**
 * Options for {@link commandExporter}.
 *
 * @public
 */
export type CommandExporterOptions = {
  readonly id: string;
  /** File extensions without the dot, or `'*'`. */
  readonly extensions: readonly string[];
  /** Executable and leading arguments, such as `['python', 'export.py']`. */
  readonly command: readonly string[];
  /** What the command can do. Protocol 1 carries no inline sources, so `inlineSources` must not be set. */
  readonly capabilities: GeoSpecExporterCapabilities;
  /** Working directory of the command; defaults to the request's project root. */
  readonly cwd?: string;
  /** Extra environment variables, merged over this process's. */
  readonly env?: Readonly<Record<string, string>>;
};

const protocolError = z.object({
  protocol: z.literal(1),
  error: z.object({ code: z.string().min(1), message: z.string(), suggestion: z.string().optional() }),
});

const protocolSuccess = z.object({
  protocol: z.literal(1),
  format: z.enum(['glb', 'step']),
  sourceUnit: z.string().optional(),
  primary: z.string().min(1),
  resources: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })).optional(),
  consumedSources: z.array(z.object({ path: z.string().min(1), sha256: z.string().min(1) })),
});

const stderrTailLength = 2000;

const failed = ({
  id,
  file,
  reason,
  details = {},
}: {
  readonly id: string;
  readonly file: string;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}): GeoSpecModelLoadError =>
  new GeoSpecModelLoadError([
    {
      code: 'GEOSPEC_EXPORTER_FAILED',
      severity: 'error',
      message: `Exporter '${id}' failed to export '${file}': ${reason}`,
      suggestion: 'Run the exporter command by hand with the same arguments and fix what it reports.',
      details: { exporter: id, file, ...details },
    },
  ]);

/**
 * Resolve a file the command named under its output directory, refusing one outside it.
 *
 * @param out - The output directory.
 * @param path - The path the command printed.
 * @returns The absolute path, or undefined when it escapes `out`.
 */
const underOut = (out: string, path: string): string | undefined => {
  const target = resolvePath(out, path);
  const inside = relative(out, target);
  return inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside) ? undefined : target;
};

const readBytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = await readFile(path);
  return new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
};

const protocolArguments = (request: GeoSpecModelExportRequest, project: string, out: string): string[] => [
  '--file',
  request.file,
  '--format',
  request.format,
  '--project',
  project,
  '--out',
  out,
  ...(request.parameters === undefined ? [] : ['--parameters-json', JSON.stringify(request.parameters)]),
  ...(request.mesh?.linearTolerance === undefined
    ? []
    : ['--mesh-linear-tolerance', String(request.mesh.linearTolerance)]),
  ...(request.mesh?.angularToleranceDegrees === undefined
    ? []
    : ['--mesh-angular-tolerance-degrees', String(request.mesh.angularToleranceDegrees)]),
  ...(request.region === undefined
    ? []
    : ['--region-min', request.region.min.join(','), '--region-max', request.region.max.join(',')]),
];

/** `exitCode` is undefined when a signal ended the command. */
const decodeText = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>): string => {
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
};

type CommandResult = { readonly exitCode: number | undefined; readonly stdout: string; readonly stderr: string };

const run = async (
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal | undefined },
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const stdout: Array<Uint8Array<ArrayBuffer>> = [];
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? undefined,
        stdout: decodeText(stdout),
        stderr: decodeText(stderr),
      });
    });
  });

/**
 * Create a model exporter that runs a command speaking GeoSpec subprocess protocol 1.
 *
 * @param options - The exporter's identity, command and declared capabilities.
 * @returns A {@link GeoSpecModelExporter}; each `export` call gets its own output directory.
 * @throws TypeError when the options are incomplete or declare `inlineSources`.
 * @public
 */
export const commandExporter = (options: CommandExporterOptions): GeoSpecModelExporter => {
  const [executable, ...leading] = options.command;
  if (options.id === '' || options.extensions.length === 0 || executable === undefined || executable === '') {
    throw new TypeError('commandExporter needs an id, at least one extension and a command.');
  }
  if (options.capabilities.formats.length === 0) {
    throw new TypeError(`commandExporter '${options.id}' must declare at least one format.`);
  }
  if (options.capabilities.inlineSources === true) {
    throw new TypeError(`commandExporter '${options.id}' cannot accept inline sources: protocol 1 passes files only.`);
  }
  const { id } = options;
  return {
    id,
    extensions: [...options.extensions],
    capabilities: { ...options.capabilities, formats: [...options.capabilities.formats] },
    async export(request): Promise<GeoSpecModelArtifact> {
      const project = request.projectPath ?? options.cwd ?? process.cwd();
      const out = await mkdtemp(join(tmpdir(), 'geospec-export-'));
      try {
        let result: CommandResult;
        try {
          result = await run(executable, [...leading, ...protocolArguments(request, project, out)], {
            cwd: options.cwd ?? project,
            env: { ...process.env, ...options.env },
            signal: request.signal,
          });
        } catch (error) {
          throw failed({
            id,
            file: request.file,
            reason: `the command could not run (${error instanceof Error ? error.message : String(error)}).`,
          });
        }
        const stderrTail = result.stderr.slice(-stderrTailLength);
        let document: unknown;
        try {
          document = JSON.parse(result.stdout);
        } catch {
          throw failed({
            id,
            file: request.file,
            reason: `it printed no protocol 1 JSON document (exit ${String(result.exitCode)}).`,
            details: { exitCode: result.exitCode, stderr: stderrTail },
          });
        }
        const refusal = protocolError.safeParse(document);
        if (refusal.success) {
          const { code, message, suggestion } = refusal.data.error;
          throw new GeoSpecModelLoadError([
            {
              code,
              severity: 'error',
              message,
              ...(suggestion === undefined ? {} : { suggestion }),
              details: { exporter: id, file: request.file },
            },
          ]);
        }
        const success = protocolSuccess.safeParse(document);
        if (result.exitCode !== 0 || !success.success) {
          throw failed({
            id,
            file: request.file,
            reason:
              result.exitCode === 0
                ? 'its JSON document is not a protocol 1 response.'
                : `it exited ${String(result.exitCode)} without a protocol 1 error.`,
            details: { exitCode: result.exitCode, stderr: stderrTail },
          });
        }
        const response = success.data;
        const primaryPath = underOut(out, response.primary);
        const resourcePaths = (response.resources ?? []).flatMap(({ name, path }) => {
          const target = underOut(out, path);
          return target === undefined ? [] : [{ name, path: target }];
        });
        if (primaryPath === undefined || resourcePaths.length !== (response.resources ?? []).length) {
          throw failed({ id, file: request.file, reason: 'it named an artifact outside its output directory.' });
        }
        const [bytes, resources] = await Promise.all([
          readBytes(primaryPath),
          Promise.all(resourcePaths.map(async ({ name, path }) => ({ name, bytes: await readBytes(path) }))),
        ]);
        return {
          bytes,
          format: response.format,
          ...(response.sourceUnit === undefined ? {} : { sourceUnit: response.sourceUnit }),
          ...(resources.length === 0 ? {} : { resources }),
          consumedSources: response.consumedSources,
        };
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    },
  };
};
