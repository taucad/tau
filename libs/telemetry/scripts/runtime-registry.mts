/**
 * Derive the runtime telemetry vocabularies from Tau's plugin registry (package design D-T16a, AR-W22-03, AR-W23-02).
 *
 * `@taucad/telemetry` is dependency-light and cannot import the plugins, so the vocabularies it validates against are
 * GENERATED into `src/runtime-vocabulary.ts` by `generate-runtime-vocabulary.mts`, which calls this module, and the
 * T30 contract test (`src/runtime-vocabulary.test.ts`) calls it again and asserts the generated file still equals the
 * registry. The derivation imports the real plugin factories and reads their composed capabilities and worker
 * definitions; only facts that exist as types alone (operation kinds, preparation and admission codes) and the job
 * providers (which need deployment options to construct) are read from source text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The workspace root, three levels above `libs/telemetry/scripts`. */
export const workspaceRoot = path.resolve(import.meta.dirname, '../../..');

const pluginsRoot = path.join(workspaceRoot, 'packages/plugins');
const definitionSymbol = Symbol.for('@taucad/runtime/plugin-definition');
const capabilityKinds = ['kernels', 'middleware', 'bundlers', 'transcoders', 'jobs', 'machines'] as const;
type CapabilityKind = (typeof capabilityKinds)[number];

/** What one registry capability contributes to the vocabularies. */
type Capability = Readonly<{
  kind: CapabilityKind;
  id: string;
  name: string | undefined;
  extensions: readonly string[];
  exports: readonly string[];
  edges: ReadonlyArray<Readonly<{ from: string; to: string }>>;
}>;

/** The derived vocabularies, each sorted and de-duplicated, in the order `runtime-vocabulary.ts` declares them. */
export type RuntimeRegistryVocabulary = Readonly<{
  runtimeKernelIds: readonly string[];
  middlewareIds: readonly string[];
  bundlerIds: readonly string[];
  transcoderIds: readonly string[];
  jobProviderIds: readonly string[];
  machineProviderIds: readonly string[];
  exportFormats: readonly string[];
  fileFormats: readonly string[];
  conversionEdges: readonly string[];
  machineActions: readonly string[];
  machineKinds: readonly string[];
  kernelIssueCodes: readonly string[];
  preparationCodes: readonly string[];
  admissionCodes: readonly string[];
  machineFailureCodes: readonly string[];
  jobCodes: readonly string[];
}>;

const read = (file: string): string => readFileSync(path.join(workspaceRoot, file), 'utf8');
const unique = (values: Iterable<string>): string[] => {
  const distinct = [...new Set(values)];
  distinct.sort();
  return distinct;
};
const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * The capability factories a plugin's definition names, per kind, read from `definePlugin({ kernels: { … }, … })`.
 * Each factory is the plugin package's own named export of that identifier.
 *
 * @param text - The `*.plugin.ts` source.
 * @returns Kind → exported factory identifiers.
 */
const factoryNames = (text: string): ReadonlyArray<Readonly<{ kind: CapabilityKind; identifier: string }>> =>
  capabilityKinds.flatMap((kind) => {
    const block = new RegExp(String.raw`^  ${kind}: \{(?<body>[^}]*)\}`, 'mu').exec(text)?.groups?.['body'];
    return block === undefined
      ? []
      : [...block.matchAll(/(?:\w+:\s*)?(?<identifier>\w+),?/gu)].map(({ groups }) => ({
          kind,
          identifier: groups?.['identifier'] ?? '',
        }));
  });

/**
 * Every capability of every first-party plugin under `packages/plugins`, by invoking each capability factory the
 * plugin's definition declares (whether or not a preset selects it) and resolving its worker definition.
 *
 * @returns The registry's capabilities.
 */
export const registryCapabilities = async (): Promise<readonly Capability[]> => {
  const capabilities: Capability[] = [];
  const directories = readdirSync(pluginsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  directories.sort((a, b) => a.name.localeCompare(b.name));
  for (const directory of directories) {
    const source = path.join(pluginsRoot, directory.name, 'src');
    // A package may expose different plugins through its native and browser entry points.
    // Pair each declaration with the entry point that exports it, never filesystem ordering.
    const entries = readdirSync(source).filter((file) => file === 'index.ts' || file === 'browser.ts');
    for (const entry of entries) {
      const entrySource = readFileSync(path.join(source, entry), 'utf8');
      const pluginFile = /from '#(?<file>[^']+\.plugin)\.js'/u.exec(entrySource)?.groups?.['file'];
      if (pluginFile === undefined) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- plugins load one at a time so the derivation is deterministic.
      const module: unknown = await import(path.join(source, entry));
      for (const { kind, identifier } of factoryNames(readFileSync(path.join(source, `${pluginFile}.ts`), 'utf8'))) {
        const factory = isRecord(module) ? module[identifier] : undefined;
        if (typeof factory !== 'function') {
          throw new TypeError(`${directory.name} does not export the ${kind} factory ${identifier}`);
        }
        const capability: unknown = (factory as () => unknown)();
        if (!isRecord(capability) || typeof capability['id'] !== 'string') {
          throw new TypeError(`${directory.name}.${identifier} did not produce an identified capability`);
        }
        const loader = capability[definitionSymbol];
        // oxlint-disable-next-line no-await-in-loop -- each definition resolves after its own factory.
        const definition: unknown = typeof loader === 'function' ? await (loader as () => unknown)() : undefined;
        const own = (key: string): unknown => capability[key] ?? (isRecord(definition) ? definition[key] : undefined);
        const exportsMap = own('exports');
        const edges = own('edges');
        capabilities.push({
          kind,
          id: capability['id'],
          name: isRecord(definition) && typeof definition['name'] === 'string' ? definition['name'] : undefined,
          extensions: strings(own('extensions')),
          exports: isRecord(exportsMap)
            ? Object.values(exportsMap).flatMap((entry) =>
                isRecord(entry) && typeof entry['extension'] === 'string' ? [entry['extension']] : [],
              )
            : [],
          edges: Array.isArray(edges)
            ? edges.flatMap((edge: unknown) =>
                isRecord(edge) && typeof edge['from'] === 'string' && typeof edge['to'] === 'string'
                  ? [{ from: edge['from'], to: edge['to'] }]
                  : [],
              )
            : [],
        });
      }
    }
  }
  return capabilities;
};

/**
 * The string literals of one exported union type, `export type Name = | 'a' | 'b';`.
 *
 * @param file - Workspace-relative source file.
 * @param name - The type name.
 * @returns The literals in declaration order.
 */
const unionLiterals = (file: string, name: string): string[] => {
  const text = read(file);
  const start = text.indexOf(`export type ${name} =`);
  if (start === -1) {
    throw new Error(`${file} no longer declares ${name}`);
  }
  const body = text.slice(start, text.indexOf(';', start));
  return [...body.matchAll(/'(?<value>[^']+)'/gu)].map(({ groups }) => groups?.['value'] ?? '');
};

/**
 * Derive every registry-generated runtime vocabulary.
 *
 * @returns The vocabularies, sorted.
 */
export const deriveRuntimeVocabulary = async (): Promise<RuntimeRegistryVocabulary> => {
  const capabilities = await registryCapabilities();
  const of = (kind: CapabilityKind): readonly Capability[] => capabilities.filter((entry) => entry.kind === kind);
  const kernels = of('kernels');
  const transcoderEdges = of('transcoders').flatMap((transcoder) => transcoder.edges);
  const exportFormats = unique([
    ...kernels.flatMap((kernel) => kernel.exports),
    ...transcoderEdges.map((edge) => edge.to),
  ]);
  const runtimeTypes = 'packages/runtime/src';
  const machineActionsModule: unknown = await import(
    path.join(workspaceRoot, runtimeTypes, 'machines/machine-actions.ts')
  );
  const issueCodesModule: unknown = await import(path.join(workspaceRoot, runtimeTypes, 'types/kernel-issue-codes.ts'));
  const exported = (module: unknown, key: string): unknown => (isRecord(module) ? module[key] : undefined);
  const standardActions = exported(machineActionsModule, 'standardMachineActions');
  const jobSources = readdirSync(path.join(workspaceRoot, 'packages/jobs-solvers/src')).filter(
    (file) => file.endsWith('.ts') && !file.includes('.test.'),
  );
  const jobProviderIds = jobSources.flatMap((file) =>
    [
      ...read(`packages/jobs-solvers/src/${file}`).matchAll(/defineJobProvider(?:<[^>]*>)?\(\{\s*id: '(?<id>[^']+)'/gu),
    ].map(({ groups }) => groups?.['id'] ?? ''),
  );
  const jobCodes = [
    ...read('packages/jobs/src/job-provider.ts').matchAll(/code: '(?<code>[A-Z][A-Z_]+)'/gu),
    ...read('packages/jobs/src/job-coordinator.ts').matchAll(/code: '(?<code>[A-Z][A-Z_]+)'/gu),
  ].map(({ groups }) => groups?.['code'] ?? '');
  return {
    runtimeKernelIds: unique(kernels.map((kernel) => kernel.id)),
    middlewareIds: unique(of('middleware').map((entry) => entry.name ?? entry.id)),
    bundlerIds: unique(of('bundlers').map((entry) => entry.id)),
    transcoderIds: unique(of('transcoders').map((entry) => entry.id)),
    jobProviderIds: unique([...of('jobs').map((entry) => entry.id), ...jobProviderIds]),
    machineProviderIds: unique(of('machines').map((entry) => entry.id)),
    exportFormats,
    fileFormats: unique([
      ...kernels.flatMap((kernel) => kernel.extensions),
      ...transcoderEdges.map((edge) => edge.from),
      ...exportFormats,
    ]),
    conversionEdges: unique(transcoderEdges.map((edge) => `${edge.from}→${edge.to}`)),
    machineActions: unique(isRecord(standardActions) ? Object.keys(standardActions) : []),
    machineKinds: unique(unionLiterals(`${runtimeTypes}/machines/machine-jobs.ts`, 'MachineOperationKind')),
    kernelIssueCodes: unique(strings(exported(issueCodesModule, 'kernelIssueCodeValues'))),
    preparationCodes: unique([
      ...unionLiterals(`${runtimeTypes}/preparation/preparation-host.types.ts`, 'PreparationBlockedReason'),
      ...unionLiterals(`${runtimeTypes}/preparation/preparation.types.ts`, 'PreparationErrorCode'),
    ]),
    admissionCodes: unique(unionLiterals(`${runtimeTypes}/host/host-admission.ts`, 'HostAdmissionRefusalCode')),
    machineFailureCodes: unique(strings(exported(machineActionsModule, 'machineFailureCodes'))),
    jobCodes: unique(jobCodes),
  };
};
