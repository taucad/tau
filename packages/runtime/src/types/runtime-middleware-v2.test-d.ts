import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { MediaType } from '@taucad/types';
import { defineMiddleware } from '#plugins/middleware-entry.js';

const factory = defineMiddleware({
  id: 'typed-middleware',
  name: 'Typed',
  stateSchema: z.object({ hits: z.number() }),
  optionsSchema: z.object({ prefix: z.string().default('x') }),
  content: {
    views: { 'image/svg+xml': ['includeEdges'], 'model/gltf-binary': ['includeTopology'] },
    exports: { svg: ['includeTopology'] },
  },
  resolve({ entryPath }, { options }) {
    expectTypeOf(options.prefix).toEqualTypeOf<string>();
    return [{ path: entryPath, affects: ['describe', 'render'] }];
  },
  async wrapDescribe(input, next, { state }) {
    state.update({ hits: 1 });
    return next(input);
  },
  async wrapEvaluate(input, next, { options }) {
    expectTypeOf(options.prefix).toEqualTypeOf<string>();
    // @ts-expect-error -- evaluation is independent of view content.
    void input.content;
    return next(input);
  },
  async wrapRender(input, next) {
    expectTypeOf(input.view).toEqualTypeOf<string>();
    expectTypeOf(input.mimeType).toEqualTypeOf<MediaType>();
    expectTypeOf(input.content).toEqualTypeOf<
      | {
          readonly includeEdges?: boolean;
          readonly includeTopology?: boolean;
        }
      | undefined
    >();
    // @ts-expect-error -- the middleware declares neither normals nor materials.
    void input.content?.includeNormals;
    return next(input);
  },
  async wrapWrite(input, next) {
    expectTypeOf(input.mimeType).toEqualTypeOf<MediaType>();
    expectTypeOf(input.extension).toEqualTypeOf<string>();
    expectTypeOf(input.content).toEqualTypeOf<{ readonly includeTopology?: boolean } | undefined>();
    return next(input);
  },
});

describe('v2 middleware authoring', () => {
  it('preserves options and public content inference', () => {
    const plugin = factory();
    expectTypeOf(plugin.id).toEqualTypeOf<'typed-middleware'>();
    factory({ prefix: 'test' });
    // @ts-expect-error -- prefix must be text.
    factory({ prefix: 1 });
  });
});
