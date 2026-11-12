import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ToolRegistry } from '@taucad/agent-host';
import type { BindingKernelRow } from '@taucad/chat/prompts';

/*
 * Workspace modules the kernel routing evals load by path. A package edge to `@taucad/tau-examples`,
 * `@taucad/runtime`, `@taucad/host` or `@taucad/skills` would put every kernel in the API's project graph
 * (`app/package-metadata.test.ts`); a file URL keeps the eval's reach out of it. Each module resolves its own
 * dependencies from its package, as Node resolves any file.
 */

/** The workspace root. */
export const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const workspaceModule = (path: string): string => pathToFileURL(join(workspaceRoot, path)).href;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const exportOf = async (path: string, name: string): Promise<unknown> => {
  const loaded: unknown = await import(workspaceModule(path));
  const value = isRecord(loaded) ? loaded[name] : undefined;
  if (value === undefined) {
    throw new TypeError(`${path} exports no ${name}.`);
  }
  return value;
};

/**
 * The workspace runtime's kernel rows (`libs/tau-examples/scripts/runtime.ts`): the example runtime the example-health
 * gate renders every example with, plus SMLibPy and Build123d.
 *
 * @returns The rows in precedence order.
 */
export const loadWorkspaceKernelRows = async (): Promise<readonly BindingKernelRow[]> => {
  const rows = await exportOf('libs/tau-examples/scripts/runtime.ts', 'workspaceKernelRows');
  if (typeof rows !== 'function') {
    throw new TypeError('workspaceKernelRows is not a function.');
  }
  return (rows as () => Promise<readonly BindingKernelRow[]>)();
};

/** The slice of `createHostToolRegistry` (`packages/host/src/agent-tools.ts`) the L2 runner calls. */
export type CreateHostToolRegistry = (
  options: Readonly<{
    workspaceRoot: string;
    systemSkillBundles: readonly unknown[];
    geospecRunner: () => Promise<never>;
  }>,
) => ToolRegistry;

/**
 * The plugin host's tool registry factory and the system skill bundles it serves.
 *
 * @returns `createHostToolRegistry` and `systemSkillBundles`.
 */
export const loadHostToolRegistry = async (): Promise<
  Readonly<{ createHostToolRegistry: CreateHostToolRegistry; systemSkillBundles: readonly unknown[] }>
> => {
  const create = await exportOf('packages/host/src/agent-tools.ts', 'createHostToolRegistry');
  const bundles = await exportOf('packages/skills/src/resources.ts', 'systemSkillBundles');
  if (typeof create !== 'function' || !Array.isArray(bundles)) {
    throw new TypeError('The host tool registry or the system skill bundles have an unexpected shape.');
  }
  return { createHostToolRegistry: create as CreateHostToolRegistry, systemSkillBundles: bundles };
};
