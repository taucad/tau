import { catalogKernelOfRuntimeKernel } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { createKernelPackageFiles } from '#constants/project.constants.js';
import { getKernelDependencies, getKernelOption, getKernelProjectTemplate } from '#utils/kernel.utils.js';

/*
 * Adoption for an entry-less project (automatic kernel selection blueprint D3). While the project's main entry does
 * not resolve to a file, the file of the first successful `evaluate_model` becomes main, and a kernel whose project
 * needs package files gets them the first time it binds a file. Every surface evaluates through this host's runtime
 * client, so a windowed turn, a daemon-placed turn and an ACP turn adopt the same way.
 */

/** The slice of the project actor adoption reads and drives. */
export type EntryAdoptionProject = Readonly<{
  /** The project's name and declared main entry, or undefined before the manifest loads. */
  manifest: () => Readonly<{ name: string; mainEntryPath: string | undefined }> | undefined;
  /** Declare `path` as the project's main entry. */
  setMainFile: (path: string) => void;
}>;

/** The slice of the project's files adoption reads and writes. */
export type EntryAdoptionFiles = Readonly<{
  exists: (path: string) => Promise<boolean>;
  writeFile: (path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
}>;

/** The package files a kernel's project reads, for a project of this name. */
export type KernelPackageFiles = (
  kernel: KernelId,
  projectName: string,
) => Promise<Readonly<Record<string, { content: Uint8Array<ArrayBuffer> }>>>;

/** What adoption did after one evaluation. */
export type EntryAdoptionResult = Readonly<{
  /** The path declared as main, when this evaluation adopted it. */
  adopted?: string;
  /** Package files written because the bound kernel needs them. */
  wrote: readonly string[];
}>;

/** Adoption for one project. */
export type EntryAdoption = Readonly<{
  /**
   * Record an evaluation of `targetFile`.
   *
   * @param input - The evaluated file, the runtime kernel it bound (if any) and whether the evaluation succeeded.
   * @returns What adoption did.
   */
  afterEvaluation: (
    input: Readonly<{ targetFile: string; runtimeKernelId: string | undefined; isSuccess: boolean }>,
  ) => Promise<EntryAdoptionResult>;
}>;

/**
 * The package files a project of `kernel` starts with, without its main file.
 *
 * @param kernel - The catalog kernel.
 * @param projectName - The project's name, used in the package manifests.
 * @returns The files, keyed by project path.
 */
export const kernelPackageFiles: KernelPackageFiles = async (kernel, projectName) => {
  return createKernelPackageFiles({
    projectName,
    ecosystem: getKernelOption(kernel).ecosystem,
    dependencies: await getKernelDependencies(kernel),
    template: await getKernelProjectTemplate(kernel),
  });
};

const stripLeadingSlash = (path: string): string => path.replace(/^\/+/u, '');

/**
 * Adoption for one project.
 *
 * @param dependencies - The project, its files and the package files of each kernel.
 * @returns The adoption hooks the runtime client calls after each evaluation.
 */
export const createEntryAdoption = (
  dependencies: Readonly<{
    project: EntryAdoptionProject;
    files: EntryAdoptionFiles;
    packageFiles?: KernelPackageFiles;
  }>,
): EntryAdoption => {
  const { project, files, packageFiles = kernelPackageFiles } = dependencies;
  /* Kernels whose package files were already settled here, so a run of evaluations checks each kernel once. */
  const settledKernels = new Set<KernelId>();

  const isEntryless = async (): Promise<boolean> => {
    const manifest = project.manifest();
    if (manifest === undefined) {
      return false;
    }
    return manifest.mainEntryPath === undefined || !(await files.exists(manifest.mainEntryPath));
  };

  return {
    async afterEvaluation({ targetFile, runtimeKernelId, isSuccess }) {
      if (!(await isEntryless())) {
        return { wrote: [] };
      }
      const wrote: string[] = [];
      const kernel = runtimeKernelId === undefined ? undefined : catalogKernelOfRuntimeKernel(runtimeKernelId);
      const manifest = project.manifest();
      if (kernel !== undefined && manifest !== undefined && !settledKernels.has(kernel)) {
        settledKernels.add(kernel);
        const candidates = Object.entries(await packageFiles(kernel, manifest.name));
        // A package file the agent or the person already wrote is theirs.
        const present = await Promise.all(candidates.map(async ([path]) => files.exists(path)));
        const missing = candidates.filter((_entry, index) => !present[index]);
        await Promise.all(missing.map(async ([path, { content }]) => files.writeFile(path, content)));
        wrote.push(...missing.map(([path]) => path));
      }
      if (!isSuccess) {
        return { wrote };
      }
      const adopted = stripLeadingSlash(targetFile);
      project.setMainFile(adopted);
      return { adopted, wrote };
    },
  };
};
