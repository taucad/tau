import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { runInNativeSandbox } from '@taucad/native-process-core';
import type { NativeSandboxCommand, NativeSandboxCommandResult } from '@taucad/native-process-core';
import { PreparationError, systemLibraryRefusal } from '@taucad/runtime/preparation/node';
import type {
  ClosureLaunch,
  ReceiptFile,
  SealClosureInput,
  SealClosureRefusal,
} from '@taucad/runtime/preparation/node';

import { pythonSupportModules } from '#python-kernel.js';
import type { PythonClosure, PythonKernelWorker } from '#python-kernel.js';

/** Closure-relative POSIX path of the interpreter python-build-standalone ships. */
const pythonPath = 'python/bin/python3';
/** Closure-relative directory the worker, its support modules and `tau_kernel` unpack into. */
const workerDirectory = 'tau-worker';
const bytecodePattern = /(?:^|\/)__pycache__\/[^/]+\.cpython-\d+\.pyc$/u;
/** Characters of a failed command's standard error kept in the error message. */
const reportedOutput = 2000;

/**
 * The closure of a Python kernel the preparation host sealed: its root is always the runtime path.
 * @public
 */
export type PythonClosureOptions = PythonClosure & { readonly runtimePath: string };

const workerPaths = (worker: PythonKernelWorker): { readonly entry: string; readonly support: readonly string[] } => ({
  entry: `${workerDirectory}/${worker.workerModules[0]}`,
  support: pythonSupportModules(worker).map((module) => `${workerDirectory}/${module}`),
});

/**
 * A Python kernel's launch set: the interpreter, the worker entry and every support module, which each launch hashes.
 * The preparation host records their rows in the closure's launch index, so a launch never reads the full receipt;
 * the rest of the closure is re-verified when the worker exits before its handshake.
 *
 * @param worker - The kernel's worker.
 * @returns The launch set, as closure-relative paths.
 * @public
 */
export const pythonLaunchSet = (worker: PythonKernelWorker): (() => readonly string[]) => {
  const { entry, support } = workerPaths(worker);
  const paths = [pythonPath, entry, ...support];
  return () => paths;
};

/**
 * Map a sealed closure to a Python kernel's options: the interpreter, the worker and its support modules, each with
 * the digest the receipt recorded, and the closure root as the runtime path the sandbox may read. The session hashes
 * exactly these files at launch (D8), so the per-launch check stays O(1).
 *
 * @param worker - The kernel's worker.
 * @returns A mapping from the closure (its receipt, or the launch view a preparation host's `inspectLaunch` reads from
 *   its launch index) to options; it throws when the closure lacks the interpreter or a worker script.
 * @public
 */
export const pythonOptionsFromClosure = (
  worker: PythonKernelWorker,
): ((closure: ClosureLaunch) => PythonClosureOptions) => {
  const { entry, support } = workerPaths(worker);
  const rowOf = (closure: ClosureLaunch, path: string): ReceiptFile => {
    const row = closure.files.find((file) => file.path === path);
    if (row === undefined) {
      throw new Error(
        `The ${closure.package} closure at ${closure.root} has no ${path}; it was not prepared from this package's tau-plugin.json. Run tau prepare ${worker.kernelId} --verify.`,
      );
    }
    return row;
  };
  const absolute = (closure: ClosureLaunch, path: string): string => join(closure.root, ...path.split('/'));
  return (closure) => {
    const python = rowOf(closure, pythonPath);
    const workerRow = rowOf(closure, entry);
    const supportRows = support.map((path) => rowOf(closure, path));
    return {
      pythonExecutable: absolute(closure, python.path),
      pythonSha256: python.sha256,
      workerPath: absolute(closure, workerRow.path),
      workerSha256: workerRow.sha256,
      supportFiles: supportRows.map((row) => ({ path: absolute(closure, row.path), sha256: row.sha256 })),
      runtimePath: closure.root,
    };
  };
};

/**
 * Runs one command inside the fixed Tau sandbox.
 * @public
 */
export type PythonSandboxRunner = (command: NativeSandboxCommand) => Promise<NativeSandboxCommandResult>;

const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/**
 * The `.py` sources whose bytecode a payload already ships, as closure-relative POSIX paths.
 * @param files - The payload rows.
 * @returns The sources compileall must skip.
 */
const shippedBytecodeSources = (files: SealClosureInput['files']): string[] =>
  files.flatMap(({ path }) => {
    const match = /^(?<directory>(?:.*\/)?)__pycache__\/(?<module>[^/.]+)\.cpython-\d+\.pyc$/u.exec(path);
    return match === null ? [] : [`${match.groups!['directory']!}${match.groups!['module']!}.py`];
  });

const tailOf = (text: string): string => text.trim().slice(-reportedOutput);

/**
 * The files compileall may add are bytecode under `__pycache__`; anything else would make the tree depend on the run.
 * @param input - The closure being sealed, with its real root.
 */
const assertOnlyBytecodeAdded = async (input: SealClosureInput): Promise<void> => {
  const known = new Set(input.files.map(({ path }) => path));
  const entries = await readdir(input.root, { recursive: true, withFileTypes: true });
  const unexpected = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(input.root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((path) => !known.has(path) && !bytecodePattern.test(path));
  if (unexpected.length > 0) {
    throw new PreparationError(
      'EXTRACTION_REFUSED',
      `Compiling the ${input.package} closure left files that are not bytecode: ${unexpected.slice(0, 5).join(', ')}. Nothing was sealed.`,
    );
  }
};

/**
 * Create a Python kernel's seal step: it compiles the whole closure's bytecode inside the kernel sandbox (D22), then
 * proves the kernel's libraries import, refusing with `missing-system-library` when the host lacks a library the
 * closure links against.
 *
 * @param options - The kernel's worker, the modules its self-test imports and whether to compile bytecode (default
 *   `true`).
 * @param run - The sandboxed command runner; tests replace it.
 * @returns The seal step a preparation host runs; it throws `PreparationError` `EXTRACTION_REFUSED` when compilation
 *   fails or the closure does not import.
 * @public
 */
export const createPythonSeal =
  (
    options: {
      readonly worker: Pick<PythonKernelWorker, 'kernelId' | 'kernelName'>;
      readonly selfTestImports: readonly [string, ...string[]];
      readonly compileall?: boolean;
    },
    run: PythonSandboxRunner = runInNativeSandbox,
  ) =>
  async (input: SealClosureInput): Promise<SealClosureRefusal | undefined> => {
    const { kernelId, kernelName } = options.worker;
    const root = await realpath(input.root);
    const python = join(root, ...pythonPath.split('/'));
    if (options.compileall !== false) {
      // D22: compile once at seal, with source hashes the interpreter never re-checks, so the worker's `-B` launch
      // imports bytecode instead of compiling thousands of modules. For S26's byte-determinism: `-B` keeps the
      // compiling interpreter from writing timestamped bytecode for the modules it imports itself, `-s` strips the
      // staging root from the recorded file names, and `-x` leaves alone the sources whose bytecode a payload ships
      // (python-build-standalone's three `encodings` files), which a seal step may not rewrite.
      const shipped = shippedBytecodeSources(input.files);
      const compiled = await run({
        executablePath: python,
        arguments: [
          '-I',
          '-B',
          '-m',
          'compileall',
          '-q',
          '-f',
          '-j',
          '1',
          '-o',
          '0',
          '--invalidation-mode',
          'unchecked-hash',
          '-s',
          root,
          '-e',
          root,
          ...(shipped.length === 0
            ? []
            : ['-x', `(?:${shipped.map((path) => escapeRegExp(`${root}/${path}`)).join('|')})$`]),
          root,
        ],
        readablePaths: [root],
        writablePath: root,
        workingDirectory: root,
        commandId: `${kernelName} compileall#${input.dependency}`,
        signal: input.signal,
      });
      if (compiled.exitCode !== 0) {
        throw new PreparationError(
          'EXTRACTION_REFUSED',
          `Compiling the ${input.package} closure's bytecode exited ${String(compiled.exitCode ?? compiled.signal)}: ${tailOf(compiled.stdout + compiled.stderr)}`,
        );
      }
      await assertOnlyBytecodeAdded({ ...input, root });
    }

    // The closure must load on this host before it is sealed: a missing system library (OCP links libGL.so.1 and
    // libX11.so.6 on Linux) is a typed refusal that names it, never a crash at the first model (X6, X14).
    const statement = `import ${options.selfTestImports.join(', ')}`;
    const scratch = await mkdtemp(join(await realpath(tmpdir()), `tau-${kernelId}-seal-`));
    try {
      const imported = await run({
        executablePath: python,
        arguments: ['-I', '-B', '-c', statement],
        readablePaths: [root],
        writablePath: scratch,
        workingDirectory: scratch,
        commandId: `${kernelName} self-test#${input.dependency}`,
        signal: input.signal,
      });
      if (imported.exitCode === 0) {
        // Importing native modules takes long enough for an external metadata writer to alter the tree.
        // Check the final tree too, before the host inventories additions into the sealed receipt.
        await assertOnlyBytecodeAdded({ ...input, root });
        return undefined;
      }
      const blocked = systemLibraryRefusal({ package: input.package, output: imported.stderr, attemptId: '' });
      if (blocked !== undefined) {
        // The host adds the attempt; the refusal carries the reason, the message and `detail.library`.
        const { status: _status, attemptId: _attemptId, ...refusal } = blocked;
        return refusal;
      }
      throw new PreparationError(
        'EXTRACTION_REFUSED',
        `The ${input.package} closure does not import on this host (${statement} exited ${String(imported.exitCode ?? imported.signal)}): ${tailOf(imported.stderr)}`,
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  };
