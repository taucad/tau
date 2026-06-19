import { packageVersion } from '@taucad/runtime/metadata';
import { presets } from '@taucad/runtime/presets';

export const runtimePinFromPackageVersion = (version: string): string => {
  const [major = '0', minor = '0'] = version.split('.');
  return `~${major}.${minor}.0`;
};

export const resolveRuntimePin = (): string => runtimePinFromPackageVersion(packageVersion);

/**
 * Infer kernel identifiers from relative paths using {@link presets.all} registration metadata.
 * `.jscad` paths always map to `jscad` for parity with UI naming even though the kernel lists `ts/js`.
 */
export const detectKernelIdsFromRelativePaths = (paths: string[]): string[] => {
  const { kernels } = presets.all();
  const ids = new Set<string>();

  for (const relativePath of paths) {
    const dot = relativePath.lastIndexOf('.');
    const extension = dot === -1 ? '' : relativePath.slice(dot + 1).toLowerCase();

    if (extension === 'jscad') {
      ids.add('jscad');
    }

    for (const kernel of kernels) {
      if (kernel.extensions.includes('*') || kernel.extensions.includes(extension)) {
        ids.add(kernel.id);
      }
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b));
};
