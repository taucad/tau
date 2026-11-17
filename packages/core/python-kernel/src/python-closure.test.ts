import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { NativeSandboxCommand, NativeSandboxCommandResult } from '@taucad/native-process-core';
import type { ClosureReceipt, InstalledFile, SealClosureInput } from '@taucad/runtime/preparation/node';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPythonSeal,
  pythonInterpreterPath,
  pythonLaunchSet,
  pythonOptionsFromClosure,
  shippedBytecodeExclusion,
} from '#python-closure.js';
import { pythonKernelOptionsSchema } from '#python-kernel.js';
import type { PythonKernelWorker } from '#python-kernel.js';

const worker: PythonKernelWorker = {
  kernelId: 'example',
  kernelName: 'Example',
  workerModules: ['example_worker.py', 'helpers.py'],
};

const hex = (digit: string): string => digit.repeat(64);
const row = (path: string, digit: string, mode = 0o644): InstalledFile => ({
  path,
  byteLength: 1,
  sha256: hex(digit),
  mode,
  dependencyFile: 'wheel',
});

const target = { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' } as const;

const receiptOf = (files: readonly InstalledFile[]): ClosureReceipt => ({
  package: '@taucad/example',
  dependency: 'engine',
  target,
  selection: {
    host: { os: 'linux', arch: 'x64', libc: 'glibc', translated: false, wasm: { threads: true } },
    candidates: [target],
    emulated: false,
  },
  root: '/store/closures/sha256/abc',
  closureIntegrity: 'sha256-AAAA',
  treeIntegrity: 'sha256-BBBB',
  files,
  dependencyFiles: [],
  preparedAt: '2026-10-15T00:00:00.000Z',
  tauVersion: '0.0.0',
});

const closureFiles = [
  row('python/bin/python3', 'a', 0o755),
  row('tau-worker/example_worker.py', 'b'),
  row('tau-worker/helpers.py', 'c'),
  row('tau-worker/tau_kernel/analyzer.py', 'd'),
  row('tau-worker/tau_kernel/glb.py', 'e'),
  row('tau-worker/tau_kernel/model.py', 'f'),
  row('tau-worker/tau_kernel/protocol.py', '1'),
];

const root = '/store/closures/sha256/abc';

describe('pythonOptionsFromClosure', () => {
  it('should map a sealed closure to options the kernel schema accepts', () => {
    const options = pythonOptionsFromClosure(worker)(receiptOf(closureFiles));

    expect(pythonKernelOptionsSchema({ supportModules: ['helpers.py'] }).parse({ closure: options })).toEqual({
      closure: {
        pythonExecutable: `${root}/python/bin/python3`,
        pythonSha256: hex('a'),
        workerPath: `${root}/tau-worker/example_worker.py`,
        workerSha256: hex('b'),
        supportFiles: [
          { path: `${root}/tau-worker/helpers.py`, sha256: hex('c') },
          { path: `${root}/tau-worker/tau_kernel/analyzer.py`, sha256: hex('d') },
          { path: `${root}/tau-worker/tau_kernel/glb.py`, sha256: hex('e') },
          { path: `${root}/tau-worker/tau_kernel/model.py`, sha256: hex('f') },
          { path: `${root}/tau-worker/tau_kernel/protocol.py`, sha256: hex('1') },
        ],
        runtimePath: root,
      },
      requestTimeout: 0,
      maxArtifactBytes: Number.MAX_SAFE_INTEGER,
    });
  });

  it('should name the interpreter and every worker module as its launch set, and map its launch index alike', () => {
    const full = receiptOf([...closureFiles, row('python/lib/python3.13/os.py', 'e')]);
    const launchSet = pythonLaunchSet(worker)();
    const index = { ...full, files: full.files.filter(({ path }) => launchSet.includes(path)) };

    expect(launchSet.toSorted()).toEqual(closureFiles.map(({ path }) => path).toSorted());
    expect(pythonOptionsFromClosure(worker)(index)).toEqual(pythonOptionsFromClosure(worker)(full));
  });

  it('should refuse a closure without a worker module, naming the prepare command', () => {
    expect(() => pythonOptionsFromClosure(worker)(receiptOf(closureFiles.slice(0, 3)))).toThrow(
      /has no tau-worker\/tau_kernel\/analyzer\.py.*tau prepare example --verify/u,
    );
  });
});

describe('createPythonSeal', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const directory of roots.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const shippedBytecode = 'python/lib/python3.13/encodings/__pycache__/aliases.cpython-313.pyc';

  const closure = (paths: readonly string[]): SealClosureInput => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'tau-python-seal-test-')));
    roots.push(directory);
    for (const path of paths) {
      const file = join(directory, ...path.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'x');
    }
    return {
      package: '@taucad/example',
      dependency: 'engine',
      target,
      root: directory,
      files: paths.map((path) => row(path, 'e')),
      signal: new AbortController().signal,
    };
  };

  const exited = (exitCode: number | undefined, stderr = '', signal?: NodeJS.Signals): NativeSandboxCommandResult => ({
    exitCode,
    signal,
    stdout: '',
    stderr,
  });

  type Step = (command: NativeSandboxCommand) => NativeSandboxCommandResult;

  const runner = (steps: readonly Step[]) => {
    const commands: NativeSandboxCommand[] = [];
    const run = async (command: NativeSandboxCommand): Promise<NativeSandboxCommandResult> => {
      commands.push(command);
      const step = steps[commands.length - 1];
      if (step === undefined) {
        throw new Error(`Unexpected command ${commands.length}`);
      }
      return step(command);
    };
    return { commands, run };
  };

  const compileInto =
    (directory: string, added: string): Step =>
    () => {
      const file = join(directory, ...added.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'bytecode');
      return exited(0);
    };

  const seal = (run: ReturnType<typeof runner>['run'], compileall?: boolean, platform: NodeJS.Platform = 'linux') =>
    createPythonSeal(
      { worker, selfTestImports: ['example', 'numpy'], ...(compileall === undefined ? {} : { compileall }) },
      run,
      platform,
    );

  it('should compile once in the sandbox, skip shipped bytecode and prove the closure imports', async () => {
    const input = closure(['python/bin/python3', 'python/lib/python3.13/encodings/aliases.py', shippedBytecode]);
    const { commands, run } = runner([
      compileInto(input.root, 'python/lib/python3.13/__pycache__/os.cpython-313.pyc'),
      () => exited(0),
    ]);

    await expect(seal(run)(input)).resolves.toBeUndefined();

    const [compile, selfTest] = commands;
    const python = join(input.root, 'python', 'bin', 'python3');
    expect(compile).toMatchObject({
      executablePath: python,
      executableSha256: hex('e'),
      readablePaths: [input.root],
      writablePath: input.root,
      workingDirectory: input.root,
      commandId: 'Example compileall#engine',
      signal: input.signal,
    });
    expect(compile!.arguments).toEqual([
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
      input.root,
      '-e',
      input.root,
      '-x',
      shippedBytecodeExclusion(input.root, ['python/lib/python3.13/encodings/aliases.py']),
      input.root,
    ]);
    expect(selfTest).toMatchObject({
      executablePath: python,
      executableSha256: hex('e'),
      arguments: ['-I', '-B', '-c', 'import example, numpy'],
      readablePaths: [input.root],
      commandId: 'Example self-test#engine',
    });
    expect(selfTest!.writablePath).not.toBe(input.root);
    expect(selfTest!.writablePath).toContain('tau-example-seal-');
    expect(selfTest!.workingDirectory).toBe(selfTest!.writablePath);
    expect(existsSync(selfTest!.writablePath)).toBe(false);
  });

  it('should compile on Windows with a staged copy of the interpreter outside the closure it writes', async () => {
    const input = closure([
      'python/python.exe',
      'python/python313.dll',
      'python/vcruntime140.dll',
      'python/Lib/os.py',
      'python/DLLs/_socket.pyd',
    ]);
    let staged: { readonly names: readonly string[]; readonly pth: string } | undefined;
    const { commands, run } = runner([
      (command) => {
        const directory = dirname(command.executablePath);
        staged = {
          names: readdirSync(directory).toSorted(),
          pth: readFileSync(join(directory, 'python._pth'), 'utf8'),
        };
        return compileInto(input.root, 'python/Lib/__pycache__/os.cpython-313.pyc')(command);
      },
      () => exited(0),
    ]);

    await expect(seal(run, undefined, 'win32')(input)).resolves.toBeUndefined();

    const [compile, selfTest] = commands;
    const compiler = dirname(compile!.executablePath);
    expect(compiler).toContain('tau-example-compile-');
    expect(compile).toMatchObject({
      executableSha256: hex('e'),
      readablePaths: [compiler],
      writablePath: input.root,
    });
    expect(compile!.arguments.at(-2)).toBe(shippedBytecodeExclusion(input.root, [], ['python/tcl']));
    expect(staged).toEqual({
      names: ['python._pth', 'python.exe', 'python313.dll', 'vcruntime140.dll'],
      pth: `${join(input.root, 'python', 'Lib')}\r\n${join(input.root, 'python', 'DLLs')}\r\n`,
    });
    expect(existsSync(compiler)).toBe(false);
    expect(selfTest).toMatchObject({
      executablePath: join(input.root, 'python', 'python.exe'),
      executableSha256: hex('e'),
      readablePaths: [input.root],
    });
  });

  it('should refuse a closure without its interpreter before running anything', async () => {
    const input = closure(['python/lib/python3.13/os.py']);
    const { commands, run } = runner([]);

    await expect(seal(run)(input)).rejects.toThrow(
      'The @taucad/example closure has no python/bin/python3, so it cannot be sealed. Nothing was sealed.',
    );
    expect(commands).toEqual([]);
  });

  it('should pass no exclusion when no dependency file ships bytecode', async () => {
    const input = closure(['python/bin/python3']);
    const { commands, run } = runner([() => exited(0), () => exited(0)]);

    await seal(run)(input);

    expect(commands[0]!.arguments).not.toContain('-x');
  });

  it('should only run the self-test when compilation is off', async () => {
    const input = closure(['python/bin/python3']);
    const { commands, run } = runner([() => exited(0)]);

    await expect(seal(run, false)(input)).resolves.toBeUndefined();

    expect(commands.map(({ commandId }) => commandId)).toEqual(['Example self-test#engine']);
  });

  it.each([
    ['an exit code', exited(1, 'SyntaxError: bad'), /exited 1: SyntaxError: bad/u],
    ['a signal', exited(undefined, '', 'SIGKILL'), /exited SIGKILL/u],
  ])('should refuse a closure whose compilation ends with %s', async (_name, result, message) => {
    const input = closure(['python/bin/python3']);
    const { run } = runner([() => result]);

    await expect(seal(run)(input)).rejects.toMatchObject({
      code: 'EXTRACTION_REFUSED',
      message: expect.stringMatching(message) as string,
    });
  });

  it('should refuse when compilation leaves a file that is not bytecode', async () => {
    const input = closure(['python/bin/python3']);
    const { run } = runner([compileInto(input.root, 'python/lib/stray.txt')]);

    await expect(seal(run)(input)).rejects.toMatchObject({
      code: 'EXTRACTION_REFUSED',
      message: expect.stringContaining('python/lib/stray.txt') as string,
    });
  });

  it('should refuse unexpected files added during the import self-test', async () => {
    const input = closure(['python/bin/python3']);
    const { commands, run } = runner([
      () => exited(0),
      compileInto(input.root, 'python/lib/python3.13/site-packages/.DS_Store'),
    ]);

    await expect(seal(run)(input)).rejects.toMatchObject({
      code: 'EXTRACTION_REFUSED',
      message: expect.stringContaining('python/lib/python3.13/site-packages/.DS_Store') as string,
    });
    expect(existsSync(commands[1]!.writablePath)).toBe(false);
  });

  it('should refuse with missing-system-library when the host lacks a library the closure links', async () => {
    const input = closure(['python/bin/python3']);
    const stderr = 'ImportError: libGL.so.1: cannot open shared object file: No such file or directory';
    const { run } = runner([() => exited(0), () => exited(1, stderr)]);

    await expect(seal(run)(input)).resolves.toEqual({
      reason: 'missing-system-library',
      message: expect.stringContaining('libGL.so.1') as string,
      detail: { library: 'libGL.so.1' },
    });
  });

  it.each([
    ['an exit code', exited(1, 'ModuleNotFoundError: example'), /exited 1\): ModuleNotFoundError: example/u],
    ['a signal', exited(undefined, '', 'SIGSEGV'), /exited SIGSEGV\)/u],
  ])('should refuse a closure that does not import, ending with %s', async (_name, result, message) => {
    const input = closure(['python/bin/python3']);
    const { run } = runner([() => exited(0), () => result]);

    await expect(seal(run)(input)).rejects.toMatchObject({
      code: 'EXTRACTION_REFUSED',
      message: expect.stringMatching(message) as string,
    });
  });
});

describe('pythonInterpreterPath', () => {
  it('should name python-build-standalone bin/python3 on macOS and Linux and python.exe at the prefix on Windows', () => {
    expect(pythonInterpreterPath('darwin')).toBe('python/bin/python3');
    expect(pythonInterpreterPath('linux')).toBe('python/bin/python3');
    expect(pythonInterpreterPath('win32')).toBe('python/python.exe');
  });
});

describe('shippedBytecodeExclusion', () => {
  // The compileall module searches each path it visits with `re.search`; these patterns use only syntax JavaScript reads alike.
  const matches = (pattern: string, path: string): boolean => new RegExp(pattern, 'u').test(path);

  it('should match exactly the shipped sources under the root, by either separator', () => {
    const pattern = shippedBytecodeExclusion(String.raw`C:\Users\RUNNER~1\store\c+1`, [
      'python/Lib/os.py',
      'python/Lib/encodings/aliases.py',
      'python/Lib/encodings/utf_8.py',
    ]);

    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\os.py`)).toBe(true);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\encodings\utf_8.py`)).toBe(true);
    expect(matches(pattern, 'C:/Users/RUNNER~1/store/c+1/python/Lib/encodings/aliases.py')).toBe(true);
    // Not shipped, a prefix of a shipped name, another directory, another root, or not the source itself.
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\encodings\idna.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\o.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\encodings\os.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c11\python\Lib\os.py`)).toBe(false);
    expect(matches(pattern, String.raw`D:\x\C:\Users\RUNNER~1\store\c+1\python\Lib\os.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\os.pyc`)).toBe(false);
  });

  it('should skip every file under a data tree, and only under it', () => {
    const root = String.raw`C:\Users\RUNNER~1\store\c+1`;
    const pattern = shippedBytecodeExclusion(root, ['python/Lib/os.py'], ['python/tcl']);

    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\tcl\tix8.4.3\pref\WmDefault.py`)).toBe(true);
    expect(matches(pattern, 'C:/Users/RUNNER~1/store/c+1/python/tcl/tix8.4.3/pref/WmDefault.py')).toBe(true);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\os.py`)).toBe(true);
    // A sibling whose name starts with the tree's, the tree's name deeper down, or the module beside the data.
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\tclx\a.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\tkinter\tcl\a.py`)).toBe(false);
    expect(matches(pattern, String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\tkinter\tix.py`)).toBe(false);
    expect(
      matches(
        shippedBytecodeExclusion(root, [], ['python/tcl']),
        String.raw`C:\Users\RUNNER~1\store\c+1\python\Lib\os.py`,
      ),
    ).toBe(false);
  });

  it("should stay far under Windows' 32,767-character command line for the interpreter's 566 shipped sources", () => {
    const sources = Array.from(
      { length: 566 },
      (_, index) => `python/Lib/site-packages/pip/_vendor/package_${String(index % 40)}/module_${String(index)}.py`,
    );
    const pattern = shippedBytecodeExclusion(String.raw`C:\Users\someone\AppData\Roaming\Tau\store\closure`, sources);

    expect(pattern.length).toBeLessThan(16_000);
    expect(
      matches(
        pattern,
        `${String.raw`C:\Users\someone\AppData\Roaming\Tau\store\closure`}\\${sources[7]!.replaceAll('/', '\\')}`,
      ),
    ).toBe(true);
  });
});
