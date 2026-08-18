import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { oxcRuntimeEsm } from '#oxc-runtime-esm.vite-plugin.js';

const require = createRequire(import.meta.url);

function getRuntimeDirectory(): string {
  return path.dirname(require.resolve('@oxc-project/runtime/package.json'));
}

type ResolveIdHook = {
  filter: { id: RegExp };
  handler: (id: string) => string | undefined;
};

function getResolveIdHook(plugin: ReturnType<typeof oxcRuntimeEsm>): ResolveIdHook {
  return plugin.resolveId as unknown as ResolveIdHook;
}

function callConfigResolved(plugin: ReturnType<typeof oxcRuntimeEsm>) {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Vite plugin hooks; cast needed to call
  (plugin.configResolved as unknown as () => void)();
}

describe('oxcRuntimeEsm', () => {
  it('should have correct metadata', () => {
    const plugin = oxcRuntimeEsm();
    expect(plugin.name).toBe('vite:oxc-runtime-esm');
    expect(plugin.enforce).toBe('pre');
    expect(plugin.apply).toBe('serve');
  });

  it('should filter on @oxc-project/runtime/helpers/ prefix', () => {
    const plugin = oxcRuntimeEsm();
    const { filter } = getResolveIdHook(plugin);
    expect(filter.id).toBeInstanceOf(RegExp);
    expect(filter.id.test('@oxc-project/runtime/helpers/classPrivateFieldGet2')).toBe(true);
    expect(filter.id.test('@oxc-project/runtime/something-else')).toBe(false);
    expect(filter.id.test('lodash')).toBe(false);
  });

  it('should resolve CJS helper imports to ESM paths', () => {
    const plugin = oxcRuntimeEsm();
    callConfigResolved(plugin);

    const { handler } = getResolveIdHook(plugin);
    const runtimeDirectory = getRuntimeDirectory();

    const resolved = handler('@oxc-project/runtime/helpers/classPrivateFieldGet2');
    expect(resolved).toBe(path.join(runtimeDirectory, 'src/helpers/esm', 'classPrivateFieldGet2.js'));
  });

  it('should skip imports that already target the ESM subpath', () => {
    const plugin = oxcRuntimeEsm();
    callConfigResolved(plugin);

    const { handler } = getResolveIdHook(plugin);
    const result = handler('@oxc-project/runtime/helpers/esm/classPrivateFieldGet2');
    expect(result).toBeUndefined();
  });

  it('should resolve deeply nested helper names', () => {
    const plugin = oxcRuntimeEsm();
    callConfigResolved(plugin);

    const { handler } = getResolveIdHook(plugin);
    const runtimeDirectory = getRuntimeDirectory();

    const resolved = handler('@oxc-project/runtime/helpers/applyDecoratedDescriptor');
    expect(resolved).toBe(path.join(runtimeDirectory, 'src/helpers/esm', 'applyDecoratedDescriptor.js'));
  });

  it("should resolve the runtime directory from @taucad/vite's @oxc-project/runtime dependency", () => {
    const plugin = oxcRuntimeEsm();
    callConfigResolved(plugin);

    const { handler } = getResolveIdHook(plugin);
    const resolved = handler('@oxc-project/runtime/helpers/classPrivateFieldGet2');

    expect(resolved).toBeDefined();
    expect(resolved!).toContain('@oxc-project/runtime');
    expect(resolved!).toContain(path.join('src', 'helpers', 'esm'));
    expect(resolved!).toMatch(/\.js$/);
  });
});
