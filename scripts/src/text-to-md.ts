import { spawn } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  closeSync,
  readFileSync,
  realpathSync,
  rmSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runReferenceCli } from '#reference-to-md.js';

const maximumLatexBytes = 5 * 1024 * 1024;
const maximumOutputBytes = 20 * 1024 * 1024;
const maximumErrorBytes = 1024 * 1024;
const pandocEnvironment = Object.fromEntries([
  ['LANG', 'C.UTF-8'],
  ['LC_ALL', 'C.UTF-8'],
]);
const pandocArguments = [
  '+RTS',
  '-M512M',
  '-RTS',
  '--sandbox',
  '--fail-if-warnings',
  '--from=latex',
  '--to=gfm-raw_html',
  '--wrap=none',
] as const;

type ProcessResult = { stdout: string; stderr: string };

const appendBounded = (options: {
  chunks: Array<Uint8Array<ArrayBuffer>>;
  chunk: Uint8Array<ArrayBuffer>;
  total: number;
  maximum: number;
  label: string;
}): number => {
  const next = options.total + options.chunk.length;
  if (next > options.maximum) {
    throw new Error(`${options.label} exceeds ${options.maximum} bytes`);
  }
  options.chunks.push(options.chunk);
  return next;
};

const runProcess = async (options: {
  executable: string;
  args: readonly string[];
  input?: string;
  cwd: string;
}): Promise<ProcessResult> =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], {
      cwd: options.cwd,
      env: pandocEnvironment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Array<Uint8Array<ArrayBuffer>> = [];
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finishError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      reject(error);
    };
    const timer = setTimeout(() => {
      finishError(new Error('Pandoc exceeded the 30 second timeout'));
    }, 30_000);

    child.stdout.on('data', (value: Uint8Array<ArrayBuffer>) => {
      try {
        stdoutBytes = appendBounded({
          chunks: stdout,
          chunk: Uint8Array.from(value),
          total: stdoutBytes,
          maximum: maximumOutputBytes,
          label: 'Pandoc output',
        });
      } catch (error) {
        finishError(error as Error);
      }
    });
    child.stderr.on('data', (value: Uint8Array<ArrayBuffer>) => {
      try {
        stderrBytes = appendBounded({
          chunks: stderr,
          chunk: Uint8Array.from(value),
          total: stderrBytes,
          maximum: maximumErrorBytes,
          label: 'Pandoc error output',
        });
      } catch (error) {
        finishError(error as Error);
      }
    });
    child.once('error', finishError);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }
      settled = true;
      const output = Buffer.concat(stdout).toString('utf8');
      const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(`Pandoc failed (${code ?? signal ?? 'unknown'}): ${errorOutput || 'no diagnostic'}`));
        return;
      }
      resolve({ stdout: output, stderr: errorOutput });
    });
    if (options.input === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(options.input, 'utf8');
    }
  });

const resolvePandoc = (): string => {
  for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) {
      continue;
    }
    const candidate = join(directory, process.platform === 'win32' ? 'pandoc.exe' : 'pandoc');
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Try the next PATH entry.
    }
  }
  throw new Error('Pandoc is required; install Pandoc 3.1.4 or newer');
};

const assertPandocVersion = async (pandoc: string, cwd: string): Promise<void> => {
  const { stdout } = await runProcess({ executable: pandoc, args: ['--version'], cwd });
  const match = /^pandoc (?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>\d+))?/u.exec(stdout);
  if (!match?.groups) {
    throw new Error('could not determine Pandoc version');
  }
  const version = [Number(match.groups['major']), Number(match.groups['minor']), Number(match.groups['patch'] ?? 0)];
  const [major, minor, patch] = version;
  const supported =
    major !== undefined &&
    minor !== undefined &&
    patch !== undefined &&
    (major > 3 || (major === 3 && (minor > 1 || (minor === 1 && patch >= 4))));
  if (!supported) {
    throw new Error(`Pandoc ${version.join('.')} is unsupported; install 3.1.4 or newer`);
  }
};

const startsWithBytes = (data: Uint8Array<ArrayBuffer>, prefix: readonly number[]): boolean =>
  prefix.every((value, index) => data[index] === value);

const compressedMagic = (data: Uint8Array<ArrayBuffer>): boolean =>
  startsWithBytes(data, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWithBytes(data, [0x1f, 0x8b]) ||
  startsWithBytes(data, [0x42, 0x5a, 0x68]) ||
  startsWithBytes(data, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
  startsWithBytes(data, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
  new TextDecoder('ascii').decode(data.subarray(257, 262)) === 'ustar';

export const readLatexArtifact = (path: string): string => {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    if (fstatSync(descriptor).size > maximumLatexBytes) {
      throw new Error(`LaTeX artifact exceeds ${maximumLatexBytes} bytes`);
    }
  } finally {
    closeSync(descriptor);
  }

  const data = Uint8Array.from(readFileSync(path));
  if (compressedMagic(data)) {
    throw new Error('LaTeX artifact must be a direct text file, not an archive');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new Error('LaTeX artifact must be valid UTF-8');
  }
  // oxlint-disable-next-line no-control-regex -- Direct LaTeX accepts tabs/newlines but no binary controls.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throw new Error('LaTeX artifact contains forbidden control characters');
  }
  return text;
};

export const validateLatexArtifact = async (path: string): Promise<void> => {
  readLatexArtifact(path);
};

export const convertLatexArtifact = async (path: string): Promise<{ markdown: string; detail: string }> => {
  const latex = readLatexArtifact(path);
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tau-pandoc-'));
  try {
    const pandoc = resolvePandoc();
    await assertPandocVersion(pandoc, temporaryDirectory);
    const { stdout, stderr } = await runProcess({
      executable: pandoc,
      args: pandocArguments,
      input: latex,
      cwd: temporaryDirectory,
    });
    if (stderr !== '') {
      throw new Error(`Pandoc emitted an unexpected diagnostic: ${stderr}`);
    }
    if (stdout.trim() === '') {
      throw new Error('Pandoc produced no Markdown');
    }
    return { markdown: stdout, detail: 'sandboxed Pandoc LaTeX conversion' };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  await runReferenceCli({
    format: 'latex',
    target: 'text-to-md',
    validateArtifact: validateLatexArtifact,
    convertArtifact: convertLatexArtifact,
  });
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolvePath(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    console.error(`text-to-md failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
