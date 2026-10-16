import { createPackageManifestCommit, installPackages, materializePackages } from '@taucad/bundler-core';
import type { BundlerFileSystem, PackageIssue, PackageLock } from '@taucad/bundler-core';
import type { InstallPackagesRpcInput, InstallPackagesRpcResult } from '#schemas/rpc.schema.js';
import { installPackagesIssueLimit } from '#schemas/tools/install-packages.tool.schema.js';
import type { InstallPackagesOutput } from '#schemas/tools/install-packages.tool.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

/** The bundler's filesystem port over the RPC filesystem; parents are created by every write. */
const toBundlerFileSystem = (fileSystem: RpcFileSystem): BundlerFileSystem => {
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? fileSystem.readFile(path) : fileSystem.readBinaryFile(path);
  }
  /* The RPC delete is non-recursive by design, so an old package tree is removed leaf first. */
  const isDirectory = async (path: string): Promise<boolean> => {
    const value = await fileSystem.stat(path);
    return value.isDirectory;
  };
  const names = async (path: string): Promise<string[]> => {
    const entries = await fileSystem.readdir(path);
    return entries.map((entry) => entry.name);
  };
  const remove = async (path: string): Promise<void> => {
    if (await isDirectory(path)) {
      const children = await names(path);
      await Promise.all(children.map(async (name) => remove(`${path}/${name}`)));
    }
    await fileSystem.deleteFile(path);
  };
  return {
    exists: async (path) => fileSystem.exists(path),
    stat: async (path) => ({ type: (await isDirectory(path)) ? 'dir' : 'file' }),
    readFile,
    writeFile: async (path, content) =>
      typeof content === 'string' ? fileSystem.writeFile(path, content) : fileSystem.writeBinaryFile(path, content),
    // ponytail: no-op, RpcFileSystem writes create missing parent directories.
    ensureDir: async () => undefined,
    remove,
  };
};

const directPackages = (lock: PackageLock | undefined): InstallPackagesOutput['packages'] =>
  Object.keys(lock?.packages['']?.dependencies ?? {}).flatMap((name) => {
    const path = `node_modules/${name}`;
    const version = lock?.packages[path]?.version;
    return version === undefined ? [] : [{ name, version, path }];
  });

/* Both installPackages and materializePackages report a skipped install script; say it once. */
const toIssues = (issues: readonly PackageIssue[]): InstallPackagesOutput['issues'] => {
  const seen = new Set<string>();
  return issues
    .filter((issue) => {
      const key = `${issue.code}\u0000${issue.name ?? issue.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, installPackagesIssueLimit)
    .map(({ code, message, name }) => ({ code, message, ...(name === undefined ? {} : { name }) }));
};

/**
 * A Python or C# project's package manifest, read from the project root: npm serves neither language, so
 * `install_packages` refuses rather than writing a package.json nothing reads (charter D35). A root that has a
 * package.json, or none of these files, is an npm project.
 * @param fileSystem - The project's record filesystem, rooted at the project.
 * @returns The language and the manifest the person edits instead, or undefined for an npm project.
 */
const nonNpmManifest = async (
  fileSystem: RpcFileSystem,
): Promise<{ readonly language: 'Python' | 'C#'; readonly manifest: string } | undefined> => {
  const entries = await fileSystem.readdir('');
  const names = entries.filter(({ type }) => type !== 'dir').map(({ name }) => name);
  if (names.includes('package.json')) {
    return undefined;
  }
  if (names.some((name) => name === 'pyproject.toml' || name.endsWith('.py'))) {
    return { language: 'Python', manifest: 'pyproject.toml' };
  }
  const csproj = names.find((name) => name.endsWith('.csproj'));
  if (csproj !== undefined || names.some((name) => name.endsWith('.cs'))) {
    return { language: 'C#', manifest: csproj ?? "the project's .csproj" };
  }
  return undefined;
};

/**
 * Install the project's packages: edit package.json, write package-lock.json, then unpack every locked tarball.
 *
 * Refusals are issues in a success result, so the agent reads one shape. The two manifest writes are checked
 * writes on the record authority; tarballs are verified against the lock before a byte is written.
 *
 * @param input - Dependency edits; `upgrade` present selects upgrade mode with exactly those names.
 * @param fileSystem - The project's record filesystem, rooted at the project.
 * @param options - The invocation's cancellation and the host's acquisition profile.
 * @param options.signal - Cancels resolution and downloads.
 * @param options.acquisition - The host's managed acquisition profile; `locked` refuses before any read or request.
 * @returns What changed, the direct dependencies as locked, and issues, or a typed failure.
 * @public
 */
export async function handleInstallPackages(
  input: InstallPackagesRpcInput,
  fileSystem: RpcFileSystem,
  {
    signal = new AbortController().signal,
    acquisition = 'open',
  }: { readonly signal?: AbortSignal | undefined; readonly acquisition?: 'open' | 'locked' | undefined } = {},
): Promise<InstallPackagesRpcResult> {
  if (acquisition === 'locked') {
    // The locked profile makes no request, and resolving or installing a package needs the npm registry (X43).
    return {
      success: true,
      manifestChanged: false,
      lockChanged: false,
      packages: [],
      issues: [
        {
          code: 'registry-unavailable',
          message:
            'The acquisition profile is locked (TAU_ACQUISITION=locked), so install_packages contacts no registry and wrote nothing. Install where the registry is reachable and bring package.json, package-lock.json and node_modules into the project; its imports then load from node_modules.',
        },
      ],
    };
  }
  try {
    const native = await nonNpmManifest(fileSystem);
    if (native !== undefined) {
      const names = [...Object.keys(input.add ?? {}), ...(input.remove ?? []), ...(input.upgrade ?? [])];
      const packages = names.length === 0 ? 'packages' : names.join(', ');
      const declaration =
        native.language === 'Python'
          ? `Declare ${packages} in ${native.manifest} [project] dependencies and run uv sync`
          : `Add a PackageReference for ${packages} to ${native.manifest} and run dotnet restore`;
      return {
        success: true,
        manifestChanged: false,
        lockChanged: false,
        packages: [],
        issues: [
          {
            code: 'manifest-conflict',
            message: `This is a ${native.language} project: install_packages installs npm packages into package.json, so it wrote nothing. ${declaration} to use them outside Tau. Inside Tau the kernel runs only the libraries it ships, so importing any other package fails.`,
          },
        ],
      };
    }
    const filesystem = toBundlerFileSystem(fileSystem);
    const installed = await installPackages({
      filesystem,
      commit: createPackageManifestCommit({ authority: fileSystem, signal }),
      mode: input.upgrade === undefined ? 'install' : 'upgrade',
      ...input,
      signal,
    });
    const tree =
      installed.lock === undefined
        ? undefined
        : await materializePackages({ filesystem, lock: installed.lock, signal });
    return {
      success: true,
      manifestChanged: installed.manifestChanged,
      lockChanged: installed.lockChanged,
      packages: directPackages(installed.lock),
      issues: toIssues([...installed.issues, ...(tree?.issues ?? [])]),
    };
  } catch (error) {
    return toRpcError(error);
  }
}
