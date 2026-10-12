import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Admission rules for evidence in the optional Tau Brain checkout (cloud software factory
 * blueprint, Component 2 and invariant I2): text documents and compact measurements are tracked,
 * binaries over 1 MiB go to LFS, nothing exceeds 100 MiB, and build products never enter
 * `research/artifacts/`. Only files present on disk are checked, so a sparse mount checks what an
 * agent can have touched and never downloads a blob to measure it.
 */

const mebibyte = 1024 * 1024;
const binaryLimit = mebibyte;
const fileLimit = 100 * mebibyte;
const textWarning = 10 * mebibyte;

/** Path patterns that are build products or dependency trees, never evidence. */
const buildProducts: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(^|\/)(node_modules|__pycache__|target\/(debug|release))\//, label: 'dependency or build tree' },
  { pattern: /\.(node|wasm|dylib|so|dll|whl|tgz|pyc)$/, label: 'build product' },
  { pattern: /(^|\/)pnpm-lock\.yaml$/, label: 'lockfile copy' },
];

export type EvidenceDiagnostic = { level: 'ERROR' | 'WARN'; path: string; message: string };

const git = (brainRoot: string, args: string[], input?: string): string =>
  execFileSync('git', ['-C', brainRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    input,
    stdio: ['pipe', 'pipe', 'ignore'],
  });

const isBinary = (path: string): boolean => {
  const buffer = Buffer.alloc(8000);
  const descriptor = openSync(path, 'r');
  try {
    return buffer.subarray(0, readSync(descriptor, buffer, 0, buffer.length, 0)).includes(0);
  } finally {
    closeSync(descriptor);
  }
};

/** Materialised tracked files and untracked candidates, relative to the Brain root. */
const candidatePaths = (brainRoot: string): string[] => {
  const tracked = git(brainRoot, ['ls-files', '-t', '-z'])
    .split('\0')
    .filter((entry) => entry.length > 2 && !entry.startsWith('S '))
    .map((entry) => entry.slice(2));
  const untracked = git(brainRoot, ['ls-files', '-z', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
};

/** Paths whose `filter` attribute is `lfs`, answered in one `git check-attr` batch. */
const lfsTracked = (brainRoot: string, paths: string[]): Set<string> => {
  if (paths.length === 0) {
    return new Set();
  }

  const fields = git(brainRoot, ['check-attr', '-z', '--stdin', 'filter'], `${paths.join('\0')}\0`).split('\0');
  const lfs = new Set<string>();
  for (let index = 0; index + 2 < fields.length; index += 3) {
    if (fields[index + 2] === 'lfs') {
      lfs.add(fields[index]!);
    }
  }

  return lfs;
};

/** Check every materialised Brain file against the admission rules. */
export const checkBrainEvidence = (brainRoot: string): EvidenceDiagnostic[] => {
  const diagnostics: EvidenceDiagnostic[] = [];
  const sized: Array<{ path: string; size: number }> = [];
  for (const path of candidatePaths(brainRoot)) {
    const absolute = join(brainRoot, path);
    if (!existsSync(absolute)) {
      continue;
    }

    const stats = statSync(absolute);
    if (!stats.isFile()) {
      continue;
    }

    if (path.startsWith('research/artifacts/')) {
      const product = buildProducts.find(({ pattern }) => pattern.test(path));
      if (product) {
        diagnostics.push({ level: 'ERROR', path, message: `${product.label}; keep it in out/research or drop it` });
      }
    }

    if (stats.size > binaryLimit) {
      sized.push({ path, size: stats.size });
    }
  }

  const lfs = lfsTracked(
    brainRoot,
    sized.map(({ path }) => path),
  );
  for (const { path, size } of sized) {
    const mib = (size / mebibyte).toFixed(1);
    if (size > fileLimit) {
      diagnostics.push({ level: 'ERROR', path, message: `${mib} MiB exceeds the 100 MiB file limit; bundle it (T2)` });
    } else if (lfs.has(path)) {
      continue;
    } else if (isBinary(join(brainRoot, path))) {
      diagnostics.push({ level: 'ERROR', path, message: `${mib} MiB binary outside LFS; add an LFS pattern (T1)` });
    } else if (size > textWarning) {
      diagnostics.push({ level: 'WARN', path, message: `${mib} MiB text file; prefer a summary or a T2 bundle` });
    }
  }

  return diagnostics.toSorted((a, b) => a.path.localeCompare(b.path));
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const brainRoot = resolve(import.meta.dirname, '../../repos/tau-brain');
  if (!existsSync(join(brainRoot, '.git'))) {
    console.log('Note: repos/tau-brain unavailable (private Tau Brain not mounted); skipping evidence admission.');
    process.exit(0);
  }

  const diagnostics = checkBrainEvidence(brainRoot);
  for (const { level, path, message } of diagnostics) {
    console.log(
      `${level === 'ERROR' ? '  \u001B[31mERROR\u001B[0m' : '  \u001B[33mWARN\u001B[0m '}  ${path}: ${message}`,
    );
  }

  const errors = diagnostics.filter(({ level }) => level === 'ERROR').length;
  console.log(`\nBrain evidence: ${errors} error${errors === 1 ? '' : 's'}, ${diagnostics.length - errors} warnings`);
  if (errors > 0) {
    process.exit(1);
  }
}
