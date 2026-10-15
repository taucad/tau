import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { runInNativeSandbox } from '@taucad/native-process-core';
import type { NativeSandboxCommand, NativeSandboxCommandResult } from '@taucad/native-process-core';
import { PreparationError, systemLibraryRefusal } from '@taucad/runtime/preparation/node';
import type { ClosureReceipt, SealClosureInput, SealClosureRefusal } from '@taucad/runtime/preparation/node';
import type { z } from 'zod';

import type { build123dOptionsSchema } from '#build123d.schemas.js';

/** Closure-relative POSIX path of the interpreter python-build-standalone ships. */
const pythonPath = 'python/bin/python3';
/** Closure-relative directory the three worker scripts unpack into. */
const workerDirectory = 'tau-worker';
const bytecodePattern = /(?:^|\/)__pycache__\/[^/]+\.cpython-\d+\.pyc$/u;
/** Characters of a failed command's standard error kept in the error message. */
const reportedOutput = 2000;

/**
 * Build123d kernel options for a closure the preparation host sealed.
 * @public
 */
export type Build123dClosureOptions = z.input<typeof build123dOptionsSchema> & { readonly runtimePath: string };

const rowOf = (receipt: ClosureReceipt, path: string): ClosureReceipt['files'][number] => {
  const row = receipt.files.find((file) => file.path === path);
  if (row === undefined) {
    throw new Error(
      `The ${receipt.package} closure at ${receipt.root} has no ${path}; it was not prepared from this package's tau-plugin.json. Run tau prepare build123d --verify.`,
    );
  }
  return row;
};

const absolute = (receipt: ClosureReceipt, path: string): string => join(receipt.root, ...path.split('/'));

/**
 * Map a sealed `engine` closure to the options `build123dKernel` already takes: the interpreter, the worker and its
 * two support modules, each with the digest the receipt recorded, and the closure root as the runtime path the
 * sandbox may read. The session hashes exactly these files at launch (D8), so the per-launch check stays O(1).
 *
 * @param receipt - The receipt of the closure `tau prepare build123d` sealed.
 * @returns Options that `build123dOptionsSchema` accepts.
 * @throws {Error} When the receipt lacks the interpreter or a worker script.
 * @public
 * @example <caption>Compose the kernel from the prepared closure</caption>
 * ```typescript
 * const { state } = await host.inspect({ package: '@taucad/build123d' });
 * if (state.status === 'ready') {
 *   build123d({ kernels: { default: build123dOptionsFromClosure(state.receipts['engine']!) } });
 * }
 * ```
 */
export const build123dOptionsFromClosure = (receipt: ClosureReceipt): Build123dClosureOptions => {
  const python = rowOf(receipt, pythonPath);
  const [worker, analyzer, glb] = ['worker.py', 'analyzer.py', 'glb.py'].map((name) =>
    rowOf(receipt, `${workerDirectory}/${name}`),
  ) as [ClosureReceipt['files'][number], ClosureReceipt['files'][number], ClosureReceipt['files'][number]];
  return {
    pythonExecutable: absolute(receipt, python.path),
    pythonSha256: python.sha256,
    workerPath: absolute(receipt, worker.path),
    workerSha256: worker.sha256,
    supportFiles: [analyzer, glb].map((row) => ({ path: absolute(receipt, row.path), sha256: row.sha256 })),
    runtimePath: receipt.root,
  };
};

/** Runs one command inside the fixed Tau sandbox; tests replace it. */
type SandboxRunner = (command: NativeSandboxCommand) => Promise<NativeSandboxCommandResult>;

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
 * Create the Build123d seal step.
 * @internal
 * @param run - The sandboxed command runner.
 * @returns The seal step.
 */
export const createBuild123dSeal =
  (run: SandboxRunner = runInNativeSandbox) =>
  async (input: SealClosureInput): Promise<SealClosureRefusal | undefined> => {
    const root = await realpath(input.root);
    const python = join(root, ...pythonPath.split('/'));
    // D22: compile once at seal, with source hashes the interpreter never re-checks, so the worker's `-B` launch
    // imports bytecode instead of compiling 7,000 modules. For S26's byte-determinism: `-B` keeps the compiling
    // interpreter from writing timestamped bytecode for the modules it imports itself, `-s` strips the staging root
    // from the recorded file names, and `-x` leaves alone the sources whose bytecode a payload ships (python-build-
    // standalone's three `encodings` files), which a seal step may not rewrite.
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
      commandId: `Build123d compileall#${input.dependency}`,
      signal: input.signal,
    });
    if (compiled.exitCode !== 0) {
      throw new PreparationError(
        'EXTRACTION_REFUSED',
        `Compiling the ${input.package} closure's bytecode exited ${String(compiled.exitCode ?? compiled.signal)}: ${tailOf(compiled.stdout + compiled.stderr)}`,
      );
    }
    await assertOnlyBytecodeAdded({ ...input, root });

    // The closure must load on this host before it is sealed: a missing system library (OCP links libGL.so.1 and
    // libX11.so.6 on Linux) is a typed refusal that names it, never a crash at the first model (X6, X14).
    const scratch = await mkdtemp(join(await realpath(tmpdir()), 'tau-build123d-seal-'));
    try {
      const imported = await run({
        executablePath: python,
        arguments: ['-I', '-B', '-c', 'import OCP, build123d'],
        readablePaths: [root],
        writablePath: scratch,
        workingDirectory: scratch,
        commandId: `Build123d self-test#${input.dependency}`,
        signal: input.signal,
      });
      if (imported.exitCode === 0) {
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
        `The ${input.package} closure does not import on this host (import OCP, build123d exited ${String(imported.exitCode ?? imported.signal)}): ${tailOf(imported.stderr)}`,
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  };

/**
 * The seal step a host passes with `@taucad/build123d` to the preparation host: it compiles the whole closure's
 * bytecode inside the kernel sandbox (D22) and proves `import OCP, build123d` loads, refusing with
 * `missing-system-library` when the host lacks a library the closure links against.
 *
 * @param input - The unpacked closure the host is about to seal.
 * @returns A refusal, or `undefined` once the closure is compiled and loads.
 * @throws {PreparationError} `EXTRACTION_REFUSED` when compilation fails or the closure does not import.
 * @public
 */
export const sealBuild123dClosure: (input: SealClosureInput) => Promise<SealClosureRefusal | undefined> =
  createBuild123dSeal();
