import type { RpcGeoSpecClient, RpcInvocationContext, RpcRuntimeClient } from '@taucad/chat/rpc';
import { testModelLoadedModels } from '@taucad/chat/schemas/tools/test-model-summary';

/*
 * Adoption for an entry-less project (automatic kernel selection blueprint D3). While the project's main entry does
 * not resolve to a file, the file of the first successful `evaluate_model`, or the first model a complete `test_model`
 * load rendered, becomes main: the host that serves the tool writes it into `tau.json`. A kernel whose project needs
 * package files gets them before the first evaluation of a file it binds. Every host composes its CAD clients through
 * this one wrapper, so a windowed turn, a daemon-placed turn and an ACP turn adopt alike.
 */

/** The slice of a project's files adoption reads and writes, rooted at the project. @public */
export type EntryAdoptionFileSystem = Readonly<{
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  writeBinaryFile: (path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}>;

/**
 * The package files the kernel that binds `targetFile` needs, keyed by project path; empty when it needs none. The
 * host knows its kernels and their templates, so it supplies them.
 * @public
 */
export type EntryAdoptionPackageFiles = (
  input: Readonly<{ targetFile: string; projectName: string; signal?: AbortSignal }>,
) => Promise<Readonly<Record<string, Uint8Array<ArrayBuffer>>>>;

/** Options for {@link withEntryAdoption}. @public */
export type WithEntryAdoptionOptions = Readonly<{
  fileSystem: EntryAdoptionFileSystem;
  packageFiles?: EntryAdoptionPackageFiles;
  /** Told after each adoption, so a host can refresh what it shows. */
  onAdopted?: (entryPath: string) => void;
}>;

const manifestPath = 'tau.json';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Manifest = Readonly<{ json: Record<string, unknown>; name: string; main: string | undefined }>;

const readManifest = async (fileSystem: EntryAdoptionFileSystem): Promise<Manifest | undefined> => {
  if (!(await fileSystem.exists(manifestPath))) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(await fileSystem.readFile(manifestPath));
  if (!isObject(parsed)) {
    return undefined;
  }
  const assets = isObject(parsed['assets']) ? parsed['assets'] : {};
  const main = isObject(assets['main']) ? assets['main'] : undefined;
  const entryPath = typeof main?.['entryPath'] === 'string' ? main['entryPath'] : undefined;
  return {
    json: parsed,
    name: typeof parsed['name'] === 'string' ? parsed['name'] : '',
    main: entryPath === '' ? undefined : entryPath,
  };
};

const withoutLeadingSlash = (path: string): string => path.replace(/^\/+/u, '');

/**
 * Wrap a host's CAD clients so an entry-less project adopts its first model (blueprint D3).
 *
 * A project with no `tau.json`, or whose main resolves, passes through unchanged. A manifest that does not parse is
 * left alone: adoption never rewrites a file it cannot read.
 *
 * @param clients - The host's runtime client and, when it serves `test_model`, its GeoSpec client.
 * @param options - The project's files, the package files of each kernel, and an adoption callback.
 * @returns The same clients, adopting.
 * @public
 */
export const withEntryAdoption = <
  Clients extends Readonly<{ kernelClient: RpcRuntimeClient; geospec?: RpcGeoSpecClient }>,
>(
  clients: Clients,
  options: WithEntryAdoptionOptions,
): Clients => {
  const { fileSystem, packageFiles, onAdopted } = options;
  /* One adoption at a time, so two evaluations finishing together never both write main. */
  let queue: Promise<void> = Promise.resolve();
  const serially = async (work: () => Promise<void>): Promise<void> => {
    const previous = queue;
    const next = (async () => {
      try {
        await previous;
      } catch {
        // An earlier adoption's failure never blocks the next one.
      }
      await work();
    })();
    queue = next;
    return next;
  };

  const entryless = async (): Promise<Manifest | undefined> => {
    try {
      const manifest = await readManifest(fileSystem);
      if (manifest === undefined) {
        return undefined;
      }
      return manifest.main === undefined || !(await fileSystem.exists(manifest.main)) ? manifest : undefined;
    } catch {
      return undefined;
    }
  };

  const adopt = async (candidate: string): Promise<void> =>
    serially(async () => {
      const manifest = await entryless();
      if (manifest === undefined) {
        return;
      }
      const entryPath = withoutLeadingSlash(candidate);
      const assets = isObject(manifest.json['assets']) ? manifest.json['assets'] : {};
      const main = isObject(assets['main']) ? assets['main'] : {};
      const next = { ...manifest.json, assets: { ...assets, main: { ...main, entryPath } } };
      await fileSystem.writeFile(manifestPath, `${JSON.stringify(next, undefined, 2)}\n`);
      onAdopted?.(entryPath);
    });

  /* Kernels' package files, settled once per target so a run of evaluations checks each once. */
  const provisioned = new Set<string>();
  const provision = async (targetFile: string, context?: RpcInvocationContext): Promise<void> => {
    if (packageFiles === undefined || provisioned.has(targetFile)) {
      return;
    }
    const manifest = await entryless();
    if (manifest === undefined) {
      return;
    }
    provisioned.add(targetFile);
    const files = Object.entries(
      await packageFiles({
        targetFile,
        projectName: manifest.name,
        ...(context?.signal === undefined ? {} : { signal: context.signal }),
      }),
    );
    // A package file the agent or the person already wrote is theirs.
    const present = await Promise.all(files.map(async ([path]) => fileSystem.exists(path)));
    await Promise.all(
      files
        .filter((_file, index) => !present[index])
        .map(async ([path, data]) => fileSystem.writeBinaryFile(path, data)),
    );
  };

  const quietly = async (work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      console.warn('[entry-adoption] skipped', error);
    }
  };

  const kernelClient: RpcRuntimeClient = {
    async evaluateModel(input, context) {
      await quietly(async () => provision(input.targetFile, context));
      const result = await clients.kernelClient.evaluateModel(input, context);
      if (result.success && result.status === 'ready') {
        await quietly(async () => adopt(input.targetFile));
      }
      return result;
    },
  };

  const geospec: RpcGeoSpecClient | undefined =
    clients.geospec === undefined
      ? undefined
      : {
          async runTests(args, context) {
            const result = await clients.geospec!.runTests(args, context);
            const [loaded] = result.success ? testModelLoadedModels(result) : [];
            if (loaded !== undefined) {
              await quietly(async () => adopt(loaded));
            }
            return result;
          },
        };

  return { ...clients, kernelClient, ...(geospec === undefined ? {} : { geospec }) };
};
