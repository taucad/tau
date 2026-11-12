import type { KernelId } from '@taucad/types/constants';
import { createKernelPackageFiles } from '#constants/project.constants.js';
import { getKernelDependencies, getKernelOption, getKernelProjectTemplate } from '#utils/kernel.utils.js';

/**
 * The package files a project of `kernel` starts with, without its main file: what an entry-less project gains when its
 * first model binds a kernel, and what Start from a template writes (automatic kernel selection blueprint D3).
 *
 * @param kernel - The catalog kernel.
 * @param projectName - The project's name, used in the package manifests.
 * @returns Each file's bytes, keyed by project path.
 */
export const kernelPackageFiles = async (
  kernel: KernelId,
  projectName: string,
): Promise<Readonly<Record<string, Uint8Array<ArrayBuffer>>>> => {
  const files = createKernelPackageFiles({
    projectName,
    ecosystem: getKernelOption(kernel).ecosystem,
    dependencies: await getKernelDependencies(kernel),
    template: await getKernelProjectTemplate(kernel),
  });
  return Object.fromEntries(Object.entries(files).map(([path, { content }]) => [path, content]));
};
