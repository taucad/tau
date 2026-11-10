import { describe, expect, it } from 'vitest';
import { loadAllFixtures } from '@taucad/tau-examples/fixtures';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { bindEntryFirstPass, catalogKernelOf } from '#testing/live/kernel-routing.binding.js';
import type { BindingKernelRow } from '#testing/live/kernel-routing.binding.js';

/*
 * Agreement with the runtime (AKS-3a). The rows are the workspace runtime's own (`@taucad/tau-examples/runtime`): the
 * example runtime the example-health gate renders every example with, plus SMLibPy and Build123d. An example's kernel
 * directory is therefore a binding the runtime has already made. The helper must reproduce it for every example its first pass decides, and for every
 * catalog template (`emptyCode`), which is the file Tau writes when it creates a project today.
 */

/** Example directories named for a runtime package rather than a catalog id; `occt` is native C++, not a kernel. */
const exampleKernel: Readonly<Record<string, KernelId | undefined>> = { opencascade: 'opencascadejs', occt: undefined };

/*
 * Loaded by a non-literal specifier so the compiler does not follow it: api's ambient `ProcessEnv`
 * (`apps/libs/api-core/src/types/environment.d.ts`) does not type-check the native-process sources that module imports.
 * Vitest loads it as usual.
 */
const workspaceRuntimeModule = ['@taucad', 'tau-examples', 'runtime'].join('/');

const hasWorkspaceRuntime = (value: unknown): value is { readonly workspaceRuntime: AnyRuntimeDefinition } =>
  typeof value === 'object' &&
  value !== null &&
  'workspaceRuntime' in value &&
  typeof value.workspaceRuntime === 'object' &&
  value.workspaceRuntime !== null;

const rows = async (): Promise<readonly BindingKernelRow[]> => {
  const loaded: unknown = await import(workspaceRuntimeModule);
  if (!hasWorkspaceRuntime(loaded)) {
    throw new Error(`${workspaceRuntimeModule} exports no workspaceRuntime.`);
  }
  const resolved = await resolveRuntimeDefinition(loaded.workspaceRuntime, undefined);
  return resolved.kernels;
};

describe('bindEntryFirstPass', () => {
  it('should bind every catalog template to its own kernel', async () => {
    const kernels = await rows();
    const bindings = kernelConfigurations
      .filter(({ id }) => kernels.some((row) => catalogKernelOf(row.id) === id))
      .map(({ id, mainFile, emptyCode }) => {
        const binding = bindEntryFirstPass({ entryPath: mainFile, source: emptyCode, kernels });
        return { id, bound: binding.kind === 'bound' ? binding.kernel : binding.kind };
      });
    expect(bindings.filter(({ id, bound }) => id !== bound)).toEqual([]);
    // Zoo is the only catalog kernel the workspace runtime does not list.
    expect(bindings.map(({ id }) => id).sort()).toEqual(
      kernelConfigurations
        .map(({ id }) => id)
        .filter((id) => id !== 'zoo')
        .sort(),
    );
  });

  it('should agree with the runtime on every example its first pass decides', async () => {
    const kernels = await rows();
    const disagreements: string[] = [];
    const undecided: string[] = [];
    let decided = 0;
    for (const [directory, examples] of Object.entries(loadAllFixtures())) {
      const expected = Object.hasOwn(exampleKernel, directory) ? exampleKernel[directory] : (directory as KernelId);
      if (expected === undefined) {
        continue;
      }
      for (const [name, { files, mainFile }] of Object.entries(examples)) {
        const binding = bindEntryFirstPass({ entryPath: mainFile, source: files[mainFile] ?? '', kernels });
        if (binding.kind === 'bound') {
          decided += 1;
          if (binding.kernel !== expected) {
            disagreements.push(`${directory}/${name}: ${binding.kernel ?? binding.runtimeKernel}`);
          }
        } else {
          undecided.push(`${directory}/${name}: ${binding.kind}`);
        }
      }
    }
    console.info('binding agreement', JSON.stringify({ decided, undecided }));
    expect(disagreements).toEqual([]);
    expect(decided).toBeGreaterThan(100);
  });

  it('should leave an entry that binds only through a helper undecided', async () => {
    const binding = bindEntryFirstPass({
      entryPath: 'main.ts',
      source: "import { bracket } from './lib/bracket.js';\nexport default () => bracket();\n",
      kernels: await rows(),
    });
    expect(binding.kind).toBe('undecided');
  });

  it('should bind Python to SMLibPy only when the entry imports it', async () => {
    const kernels = await rows();
    const bound = (source: string) => {
      const binding = bindEntryFirstPass({ entryPath: 'main.py', source, kernels });
      return binding.kind === 'bound' ? binding.kernel : binding.kind;
    };
    expect(bound('import smlibpy\n')).toBe('smlibpy');
    expect(bound('from build123d import Box\n')).toBe('build123d');
  });

  it('should report no kernel for an extension no kernel claims', async () => {
    expect(bindEntryFirstPass({ entryPath: 'main.rb', source: '', kernels: await rows() }).kind).toBe('unbound');
  });
});
