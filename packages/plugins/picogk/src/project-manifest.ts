import type { KernelIssue } from '@taucad/runtime/kernel';

/**
 * The NuGet packages a PicoGK project references in its `.csproj`, at the versions this kernel runs: upstream PicoGK
 * at the release whose engine (`picogk.26.2`) the kernel's patched host links. A test keeps them equal to the
 * project template and its `packages.lock.json`.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- keys are NuGet package ids
export const picogkProjectLibraries: Readonly<Record<string, string>> = { PicoGK: '2.3.0' };

const projectLibraries = new Map(
  Object.entries(picogkProjectLibraries).map(([name, version]) => [name.toLowerCase(), { name, version }]),
);

const attribute = (element: string, name: string): string | undefined =>
  new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'iu').exec(element)?.[1];

/**
 * Warn about every `PackageReference` in a project's `.csproj` that names one of this kernel's libraries at a version
 * the kernel does not run. A floating or ranged version is not a mismatch.
 * @param manifest - The `.csproj` path, project-relative.
 * @param text - Its text.
 * @returns One `LIBRARY_VERSION_MISMATCH` warning per mismatched reference, located at the reference.
 */
export const libraryVersionMismatches = (manifest: string, text: string): KernelIssue[] => {
  const issues: KernelIssue[] = [];
  for (const reference of text.matchAll(/<PackageReference\b[^>]*>/giu)) {
    const library = projectLibraries.get(String(attribute(reference[0], 'Include')).toLowerCase());
    // `[2.3.0]` is NuGet's exact-version form of `2.3.0`.
    const declared = attribute(reference[0], 'Version')?.replace(/^\[([^,\]]+)\]$/u, '$1');
    if (
      library === undefined ||
      declared === undefined ||
      declared === library.version ||
      !/^[\d.]+(?:-[\w.]+)?$/u.test(declared)
    ) {
      continue;
    }
    issues.push({
      message: `${manifest} references ${library.name} ${declared}, but the picogk kernel runs ${library.name} ${library.version}. Set Version="${library.version}" on its PackageReference and restore, so the project runs the same library inside and outside Tau.`,
      code: 'LIBRARY_VERSION_MISMATCH',
      type: 'kernel',
      severity: 'warning',
      location: {
        fileName: manifest,
        startLineNumber: text.slice(0, reference.index).split('\n').length,
        startColumn: 1,
      },
      details: {
        producer: { kernelId: 'picogk' },
        manifest,
        library: library.name,
        declared,
        runs: library.version,
      },
    });
  }
  return issues;
};
