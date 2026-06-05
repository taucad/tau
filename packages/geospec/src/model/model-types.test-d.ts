import { describe, expectTypeOf, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import type { LoadModelCodeOptions, LoadModelFileOptions } from '#model/types.js';
import { activeParams, createModelLoader, loadModel, parameterGroups, params } from '#model/index.js';

const parameterEntry = {
  activeGroup: 'wide',
  groups: {
    wide: { values: { height: 30, base: { width: 40 } } },
  },
};

describe('geospec/model public types', () => {
  it('should preserve parameter value types from defaults', () => {
    const defaults: { height: number; base: { width: number; depth: number } } = {
      height: 20,
      base: { width: 10, depth: 5 },
    };

    const resolved = params(parameterEntry, { defaults });
    const groups = parameterGroups(parameterEntry, { defaults });
    const active = activeParams(parameterEntry, { defaults });

    expectTypeOf(resolved.active.values.height).toEqualTypeOf<number>();
    expectTypeOf(groups[0]!.values.base.depth).toEqualTypeOf<number>();
    expectTypeOf(active.base.width).toEqualTypeOf<number>();
  });

  it('should keep override-only parameter values unknown without defaults', () => {
    const groups = parameterGroups(parameterEntry);

    expectTypeOf(groups[0]!.values).toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(groups[0]!.values['height']).toEqualTypeOf<unknown>();
  });

  it('should keep unit options on direct sources only', () => {
    expectTypeOf(loadModel({ source: new Uint8Array(), format: 'glb', unit: 'mm' })).toEqualTypeOf<
      Promise<GeometrySubject>
    >();

    // @ts-expect-error -- runtime-backed file loads do not expose unit options.
    const invalidFileOptions: LoadModelFileOptions = { file: 'main.ts', unit: 'mm' };
    void invalidFileOptions;

    const code = Object.fromEntries([['main.ts', 'export default function main() {}']]) as Record<'main.ts', string>;
    const invalidCodeOptions: LoadModelCodeOptions<Record<'main.ts', string>> = {
      code,
      file: 'main.ts',
      // @ts-expect-error -- runtime-backed code loads do not expose unit options.
      unit: 'mm',
    };
    void invalidCodeOptions;

    // @ts-expect-error -- shared defaults cannot override the runtime-backed unit contract.
    createModelLoader({ unit: 'mm' });
  });
});
