import type { KernelProvider } from '@taucad/runtime';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';

// Helper function to get kernel option by id
export function getKernelOption(kernelId: KernelProvider): KernelConfiguration {
  const option = kernelConfigurations.find((option) => option.id === kernelId);

  if (!option) {
    throw new Error(`Kernel option not found for id: ${kernelId}`);
  }

  return option;
}

// Helper function to get main file for a kernel
export function getMainFile(kernelId: KernelProvider): string {
  const option = getKernelOption(kernelId);

  return option.mainFile;
}

// Helper function to get empty code for a kernel
export function getEmptyCode(kernelId: KernelProvider): string {
  const option = getKernelOption(kernelId);
  return option.emptyCode;
}

/**
 * Kernels whose project manifests declare npm libraries (`kernel-libraries.ts`).
 * ponytail: hand-kept beside `kernelLibraries`; `kernel.utils.test.ts` fails when the two differ.
 */
export const kernelsWithLibraries: ReadonlySet<KernelProvider> = new Set([
  'replicad',
  'jscad',
  'manifold',
  'picovoxel',
  'tscircuit',
]);

/**
 * The npm `dependencies` a new project of this kernel declares, as the kernel plugin publishes them
 * (`{ replicad: 'npm:@taulabs/replicad@…' }`); empty for a kernel without npm libraries. Only dependency
 * metadata loads; executable plugins and WASM stay out of the renderer.
 */
export async function getKernelDependencies(kernelId: KernelProvider): Promise<Record<string, string>> {
  if (!kernelsWithLibraries.has(kernelId)) {
    return {};
  }

  const { kernelLibraries } = await import('#utils/kernel-libraries.js');
  return { ...kernelLibraries[kernelId] };
}

/**
 * The project template a new project of this kernel starts from: the manifest and lock files its plugin publishes,
 * pinned to the kernel's own closure (`@taucad/build123d/project/*`, `@taucad/picogk/project/*`); undefined for a
 * kernel whose project files Tau writes itself. Only the text files load, never the plugin.
 */
export async function getKernelProjectTemplate(kernelId: KernelProvider): Promise<Record<string, string> | undefined> {
  switch (kernelId) {
    case 'build123d': {
      const [pyproject, pylock, uvLock] = await Promise.all([
        import('@taucad/build123d/project/pyproject.toml?raw'),
        import('@taucad/build123d/project/pylock.toml?raw'),
        import('@taucad/build123d/project/uv.lock?raw'),
      ]);
      return { 'pyproject.toml': pyproject.default, 'pylock.toml': pylock.default, 'uv.lock': uvLock.default };
    }

    case 'picogk': {
      const [csproj, lock] = await Promise.all([
        import('@taucad/picogk/project/project.csproj?raw'),
        import('@taucad/picogk/project/packages.lock.json?raw'),
      ]);
      return { 'project.csproj': csproj.default, 'packages.lock.json': lock.default };
    }

    default: {
      return undefined;
    }
  }
}

/**
 * Format kernel names as a readable list with the specified conjunction.
 * @example formatKernelList('or') // "OpenSCAD, Replicad, Manifold, Zoo, or JSCAD"
 * @example formatKernelList('and') // "OpenSCAD, Replicad, Manifold, Zoo, and JSCAD"
 */
export function formatKernelList(conjunction: 'and' | 'or' = 'and'): string {
  const names = kernelConfigurations.map((k) => k.name);
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names.at(-1)}`;
}
