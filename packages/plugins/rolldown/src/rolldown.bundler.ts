import { defineBundler } from '@taucad/runtime/bundler';

import { createRolldownModuleVm } from '#rolldown-module-vm.js';

const autoExportNames = ['main', 'defaultParams', 'getParameterDefinitions'];

/** Native Node and isolated-browser Rolldown bundler. @public */
export const rolldownBundler = defineBundler({
  id: 'rolldown',
  extensions: ['ts', 'js', 'tsx', 'jsx'],
  name: 'RolldownBundler',
  version: '1.0.0',
  async initialize(_options, { filesystem }) {
    return {
      vm: await createRolldownModuleVm({ filesystem, autoExportNames, cacheExecution: true }),
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
  async cleanup(context) {
    context.vm.dispose();
  },
});
