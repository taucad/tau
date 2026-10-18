// Roster coverage: every product catalog kernel is either routable in a host's runtime roster or deliberately left
// out with a reason. Order stays pinned by each host's own assertions; this check only asks "is anything forgotten?".

/**
 * The kernel rows of a resolved runtime: what `resolveRuntimeDefinition` from `@taucad/runtime/worker` returns.
 * @public
 */
export type RosterRuntime = {
  readonly kernels: ReadonlyArray<{ readonly id: string; readonly extensions: readonly string[] }>;
};

/**
 * One product catalog entry, as `kernelConfigurations` from `@taucad/types/constants` lists it.
 * @public
 */
export type RosterCatalogEntry = {
  readonly id: string;
  /** The file a new project of this kernel starts from; its extension is what routes it to a kernel. */
  readonly mainFile: string;
};

/**
 * Input of {@link assertKernelRosterCoverage}.
 * @public
 */
export type KernelRosterCoverageInput = {
  /** The host's resolved runtime. */
  readonly runtime: RosterRuntime;
  /** The product catalog. */
  readonly catalog: readonly RosterCatalogEntry[];
  /** Catalog ids this host deliberately does not route, each with why. */
  readonly omitted?: Readonly<Record<string, string>>;
};

const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1);
};

/**
 * Assert that a host's runtime roster covers the product catalog: each entry needs a kernel whose `extensions` claim
 * its `mainFile`'s extension, which is how a project's files are routed, or an `omitted` reason. An omission is
 * stale, and fails, when its entry is routable after all or names no catalog entry.
 *
 * @param input - The resolved runtime, the catalog and the host's omissions.
 * @throws {Error} Naming every uncovered entry and every stale or empty omission.
 * @public
 * @example <caption>Pin a host roster against the catalog</caption>
 * ```typescript
 * import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
 * import type { RosterRuntime } from '@taucad/runtime-testing/roster';
 *
 * export const checkRoster = (runtime: RosterRuntime): void => {
 *   assertKernelRosterCoverage({
 *     runtime,
 *     catalog: [
 *       { id: 'replicad', mainFile: 'main.ts' },
 *       { id: 'zoo', mainFile: 'main.kcl' },
 *     ],
 *     omitted: { zoo: 'credentialed: this host has no proxy token' },
 *   });
 * };
 * ```
 */
export const assertKernelRosterCoverage = (input: KernelRosterCoverageInput): void => {
  const omitted = input.omitted ?? {};
  const catalogIds = new Set(input.catalog.map(({ id }) => id));
  const problems: string[] = [];
  for (const { id, mainFile } of input.catalog) {
    const extension = extensionOf(mainFile);
    const kernel =
      extension === '' ? undefined : input.runtime.kernels.find(({ extensions }) => extensions.includes(extension));
    const reason = Object.hasOwn(omitted, id) ? omitted[id] : undefined;
    if (kernel === undefined && reason === undefined) {
      problems.push(`${id}: no kernel claims ".${extension}" (${mainFile}) and no omission names it.`);
    } else if (kernel !== undefined && reason !== undefined) {
      problems.push(
        `${id}: omitted ("${reason}"), but the ${kernel.id} kernel claims ".${extension}"; drop the omission.`,
      );
    }
  }
  for (const [id, reason] of Object.entries(omitted)) {
    if (!catalogIds.has(id)) {
      problems.push(`${id}: omitted, but no catalog entry has this id; drop the omission.`);
    } else if (reason.trim() === '') {
      problems.push(`${id}: omitted without a reason.`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `The kernel roster does not cover the catalog:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
};
