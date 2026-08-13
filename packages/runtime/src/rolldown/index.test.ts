import type { ExternalOption, InputOptions, OutputOptions } from 'rolldown';
import { describe, it, expect } from 'vitest';
import { tauRuntime } from '#rolldown/index.js';
import * as rolldownIntegration from '#rolldown/index.js';
import { runtimePackages, wasmBearingDeps } from '#vite/runtime-invariants.js';

type OptionsHandler = (options: InputOptions) => InputOptions | undefined;
type OutputHandler = (output: OutputOptions) => OutputOptions | undefined;

const callOptionsHook = (existing: ExternalOption | undefined): ExternalOption => {
  const plugin = tauRuntime();
  const optionsHook = plugin.options;
  if (typeof optionsHook !== 'function') {
    throw new TypeError('tauRuntime() Rolldown plugin must expose an options() hook');
  }
  const handler = optionsHook as unknown as OptionsHandler;
  const result = handler({ external: existing });
  if (result?.external === undefined) {
    throw new TypeError('options() hook must return a merged external array');
  }
  return result.external;
};

const callOutputHook = (existing: OutputOptions): OutputOptions | undefined => {
  const plugin = tauRuntime();
  const hook = plugin.outputOptions;
  if (typeof hook !== 'function') {
    throw new TypeError('tauRuntime() Rolldown plugin must expose an outputOptions() hook');
  }
  const handler = hook as unknown as OutputHandler;
  return handler(existing);
};

describe('tauRuntime (Rolldown plugin)', () => {
  it('should expose the self-identifying factory without the retired runtime alias', () => {
    expect(tauRuntime).toBeTypeOf('function');
    expect(rolldownIntegration).not.toHaveProperty('runtime');
  });

  it('should be named taucad-runtime:invariants for parity with the Vite plugin', () => {
    const plugin = tauRuntime();

    expect(plugin.name).toBe('taucad-runtime:invariants');
  });

  it('should add the runtime packages and every WASM-bearing dep to external when none are provided', () => {
    const external = callOptionsHook(undefined);

    expect(external).toEqual([...runtimePackages, ...wasmBearingDeps]);
  });

  it('should preserve consumer-provided external entries when merging', () => {
    const consumer = ['lodash-es'];

    const external = callOptionsHook(consumer) as readonly string[];

    expect(external).toEqual([...consumer, ...runtimePackages, ...wasmBearingDeps]);
  });

  it('should normalise a single string external into an array preserving the original entry', () => {
    const external = callOptionsHook('lodash-es') as readonly string[];

    expect(external[0]).toBe('lodash-es');
    for (const package_ of [...runtimePackages, ...wasmBearingDeps]) {
      expect(external).toContain(package_);
    }
  });

  it('should compose with a function-form external, externalising both consumer matches and runtime packages', () => {
    const consumer = (id: string): boolean | undefined => (id === 'lodash-es' ? true : undefined);

    const external = callOptionsHook(consumer);

    expect(typeof external).toBe('function');
    if (typeof external !== 'function') {
      return;
    }
    expect(external('lodash-es', undefined, false)).toBe(true);
    expect(external('@taucad/runtime', undefined, false)).toBe(true);
    expect(external('@taucad/runtime/node', undefined, false)).toBe(true);
    expect(external('replicad-opencascadejs', undefined, false)).toBe(true);
    expect(external('react', undefined, false)).toBeUndefined();
  });

  it('should externalise subpath imports of runtime packages (e.g. @taucad/runtime/node)', () => {
    const external = callOptionsHook(undefined) as readonly string[];

    expect(external).toContain('@taucad/runtime');
    expect(external).toContain('@taucad/openscad');
  });

  it('should force output format to "es" so import.meta.url survives the build', () => {
    const result = callOutputHook({ format: 'cjs' });

    expect(result?.format).toBe('es');
  });

  it('should leave output format untouched when forceEsmOutput is false', () => {
    const plugin = tauRuntime({ forceEsmOutput: false });
    const hook = plugin.outputOptions;
    if (typeof hook !== 'function') {
      throw new TypeError('tauRuntime() Rolldown plugin must expose an outputOptions() hook');
    }

    const handler = hook as unknown as OutputHandler;
    const result = handler({ format: 'cjs' });

    expect(result).toBeUndefined();
  });
});
