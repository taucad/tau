/** Package the complete S12 client build and enforce the charter compressed-byte budget. */
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

class ServeUiLayerBudgetError extends Error {}

export const serveUiLayerLimitBytes = 150_000_000;

/** Enforce the charter's decimal 150 MB budget, including the boundary. */
export const requireServeUiLayerBudget = (bytes: number): void => {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > serveUiLayerLimitBytes) {
    throw new ServeUiLayerBudgetError(`S12 runtime layer exceeds ${serveUiLayerLimitBytes} bytes: ${bytes}`);
  }
};

/** Enumerate only ordinary files and directories; never traverse a link outside the build. */
const entries = (root: string, directory = 'client'): string[] => {
  const result = [directory];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...entries(root, name));
    } else if (entry.isFile()) {
      result.push(name);
    } else {
      throw new Error(`Unsupported UI layer entry: ${name}`);
    }
  }
  return result.sort();
};

/** Replace directory entries without following existing symlinks or changing hardlinked inputs. */
const writeOutput = (destination: string, contents: string): void => {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { flag: 'wx' });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
};

/** Create a deterministic archive from an explicit inventory, without copying or changing the build. */
const archive = (build: string, output: string, contents: { name: string; members: string[] }): string => {
  const { name, members } = contents;
  const listing = join(output, `${name}.members`);
  writeOutput(listing, members.length > 0 ? `${members.join('\0')}\0` : '');
  const destination = join(output, `${name}.tar.gz`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx');
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -o pipefail; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --no-recursion -C "$1" --null -T "$2" -cf - | gzip -9n',
        'pack-serve-ui-layer',
        build,
        listing,
      ],
      { stdio: ['ignore', descriptor, 'pipe'] },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Failed to pack ${name}: ${result.stderr.toString()}`);
    }
    renameSync(temporary, destination);
  } finally {
    closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
  return destination;
};

/** Retain every emitted client file; never infer runtime necessity from its extension or references. */
export const packServeUiLayer = (buildDirectory: string, outputDirectory: string): void => {
  const build = realpathSync(buildDirectory);
  if (!lstatSync(join(build, 'client')).isDirectory()) {
    throw new Error('Client build must be an ordinary directory.');
  }
  const output = resolve(outputDirectory);
  let existingParent = output;
  while (!existsSync(existingParent)) {
    existingParent = dirname(existingParent);
  }
  const physicalOutput = resolve(realpathSync(existingParent), relative(existingParent, output));
  const outputWithinClient = relative(join(build, 'client'), physicalOutput);
  if (outputWithinClient !== '..' && !outputWithinClient.startsWith(`..${sep}`)) {
    throw new Error('Output directory must be outside the client build.');
  }
  mkdirSync(output, { recursive: true });
  const all = entries(build);
  if (!all.includes('client/index.html')) {
    throw new Error('Missing serve UI client/index.html');
  }
  const runtime = archive(build, output, { name: 'serve-ui-client', members: all });
  const record = (name: string): { path: string; bytes: number; sha256: string } => {
    const bytes = readFileSync(join(build, name));
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const runtimeBytes = statSync(runtime).size;
  writeOutput(
    join(output, 'serve-ui-layer-manifest.json'),
    `${JSON.stringify(
      {
        limitBytes: serveUiLayerLimitBytes,
        runtimeBytes,
        runtimeSha256: createHash('sha256').update(readFileSync(runtime)).digest('hex'),
        runtime: all.filter((name) => statSync(join(build, name)).isFile()).map((name) => record(name)),
      },
      null,
      2,
    )}\n`,
  );
  requireServeUiLayerBudget(runtimeBytes);
};

/** Verify the extracted ordinary-file tree and the archive against the recorded complete inventory. */
export const verifyServeUiLayer = (extractedDirectory: string, outputDirectory: string): void => {
  const manifest: unknown = JSON.parse(readFileSync(join(outputDirectory, 'serve-ui-layer-manifest.json'), 'utf8'));
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('runtime' in manifest) ||
    !('runtimeBytes' in manifest) ||
    !('runtimeSha256' in manifest)
  ) {
    throw new Error('Invalid serve UI layer manifest');
  }
  if (!lstatSync(join(extractedDirectory, 'client')).isDirectory()) {
    throw new Error('Extracted client must be an ordinary directory');
  }
  const actual = entries(extractedDirectory)
    .filter((name) => statSync(join(extractedDirectory, name)).isFile())
    .map((name) => {
      const bytes = readFileSync(join(extractedDirectory, name));
      return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
  const archiveBytes = readFileSync(join(outputDirectory, 'serve-ui-client.tar.gz'));
  if (
    JSON.stringify(actual) !== JSON.stringify(manifest.runtime) ||
    archiveBytes.length !== manifest.runtimeBytes ||
    createHash('sha256').update(archiveBytes).digest('hex') !== manifest.runtimeSha256
  ) {
    throw new Error('Serve UI archive or extracted files differ from the manifest');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [build, output, mode] = process.argv.slice(2);
  if (!build || !output || (process.argv.length !== 4 && !(process.argv.length === 5 && mode === '--verify'))) {
    throw new Error('Usage: pack-serve-ui-layer.ts <build-directory> <output-directory> [--verify]');
  }
  try {
    if (mode === '--verify') {
      verifyServeUiLayer(build, output);
    } else {
      packServeUiLayer(build, output);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = error instanceof ServeUiLayerBudgetError ? 2 : 1;
  }
}
