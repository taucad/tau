import { defineBundler } from '@taucad/runtime/bundler';
import { z } from 'zod';

import { createRolldownModuleVm } from '#rolldown-module-vm.js';

const autoExportNames = ['main', 'defaultParams', 'getParameterDefinitions'];

/** @public */
export const rolldownOptionsSchema = z.object({
  /**
   * `locked` (`TAU_ACQUISITION=locked`) makes no request: a bare import of a project without `package-lock.json` and
   * a URL import are refused with `package-not-locked`. Default `open`.
   */
  acquisition: z.enum(['open', 'locked']).optional(),
});

/** Public Rolldown plugin options. @public */
export type RolldownOptions = z.input<typeof rolldownOptionsSchema>;

/** Native Node and isolated-browser Rolldown bundler. @public */
export const rolldownBundler = defineBundler({
  id: 'rolldown',
  extensions: ['ts', 'js', 'tsx', 'jsx'],
  name: 'RolldownBundler',
  version: '1.0.0',
  optionsSchema: rolldownOptionsSchema,
  async initialize(options, { filesystem }) {
    return {
      vm: await createRolldownModuleVm({
        filesystem,
        autoExportNames,
        cacheExecution: true,
        ...(options.acquisition === undefined ? {} : { acquisition: options.acquisition }),
      }),
    };
  },
  async detectImports({ entryPath }, { signal }, context) {
    return context.vm.detectImports(entryPath, signal);
  },
  async bundle({ entryPath }, { signal }, context) {
    return context.vm.bundle(entryPath, signal);
  },
  async execute({ code }, { signal }, context) {
    return context.vm.execute(code, signal);
  },
  registerModule({ name, module }, context) {
    context.vm.registerModule(name, module);
  },
  clearExecutionCache(code, context) {
    context.vm.clearExecutionCache(code);
  },
  async onDispose(context) {
    context.vm.dispose();
  },
});
