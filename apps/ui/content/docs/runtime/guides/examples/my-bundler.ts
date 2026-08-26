import { defineBundler, type BuiltinModule } from '@taucad/runtime/bundler';

export const myBundler = defineBundler({
  id: 'my-bundler',
  name: 'MyBundler',
  version: '1.0.0',
  extensions: ['ts', 'js'],

  async initialize(_options, { filesystem }) {
    const modules = new Map<string, BuiltinModule>();
    return { filesystem, modules };
  },

  async detectImports({ entryPath }) {
    return { detectedModules: [], dependencies: [entryPath] };
  },

  async bundle({ entryPath }) {
    return {
      code: `export default async () => { /* bundled from ${entryPath} */ };`,
      success: true,
      issues: [],
      dependencies: [entryPath],
      unresolvedPaths: [],
    };
  },

  async execute({ code }) {
    const dataUrl = `data:text/javascript;base64,${btoa(code)}`;
    const module = (await import(dataUrl)) as { default: unknown };
    return { success: true, value: module.default };
  },

  registerModule({ name, module }, context) {
    context.modules.set(name, module);
  },
});
