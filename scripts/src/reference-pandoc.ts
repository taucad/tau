import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import process from 'node:process';

const maximumOutputBytes = 20 * 1024 * 1024;
const maximumErrorBytes = 1024 * 1024;
const pandocEnvironment = Object.fromEntries([
  ['LANG', 'C.UTF-8'],
  ['LC_ALL', 'C.UTF-8'],
]);

export type ReferencePandocProfile = 'latex-to-gfm' | 'html-to-gfm';

type ProcessResult = { stdout: string; stderr: string };

const pandocArguments = (profile: ReferencePandocProfile): readonly string[] => [
  '+RTS',
  '-M512M',
  '-RTS',
  '--sandbox',
  '--fail-if-warnings',
  `--from=${profile === 'latex-to-gfm' ? 'latex' : 'html'}`,
  '--to=gfm-raw_html',
  '--wrap=none',
];

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
    child.stdin.end(options.input ?? '', 'utf8');
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
      // Try the next absolute PATH entry.
    }
  }
  throw new Error('Pandoc is required; install Pandoc 3.1.4 or newer');
};

const assertPandocVersion = async (pandoc: string, cwd: string): Promise<string> => {
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
  return match[0].slice('pandoc '.length);
};

export const convertWithReferencePandoc = async (options: {
  profile: ReferencePandocProfile;
  input: string;
}): Promise<{ markdown: string; version: string }> => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tau-pandoc-'));
  try {
    const pandoc = resolvePandoc();
    const version = await assertPandocVersion(pandoc, temporaryDirectory);
    const { stdout, stderr } = await runProcess({
      executable: pandoc,
      args: pandocArguments(options.profile),
      input: options.input,
      cwd: temporaryDirectory,
    });
    if (stderr !== '') {
      throw new Error(`Pandoc emitted an unexpected diagnostic: ${stderr}`);
    }
    if (stdout.trim() === '') {
      throw new Error('Pandoc produced no Markdown');
    }
    return { markdown: stdout, version };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};
