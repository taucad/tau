import { describe, expectTypeOf, it } from 'vitest';
import type { KernelConfiguration, KernelId, KernelPreference } from '#constants/kernel.constants.js';
import type { KernelRoutingZone } from '#constants/kernel-routing.constants.js';

type Facets = Pick<KernelConfiguration, 'representation' | 'exactGeometry' | 'routing'>;

describe('kernel routing facets', () => {
  it('should require every routing facet on a catalog entry', () => {
    // @ts-expect-error -- a kernel without facets fails the build (AKS-1a)
    const withoutFacets: Facets = {};
    // @ts-expect-error -- routing copy needs both one-liners
    const withoutAvoid: Facets = { representation: 'mesh', exactGeometry: false, routing: { useWhen: 'x' } };
    expectTypeOf(withoutFacets).toEqualTypeOf<Facets>();
    expectTypeOf(withoutAvoid).toEqualTypeOf<Facets>();
  });

  it('should refuse a zone that names an unknown kernel', () => {
    const zone = {
      id: 'U1',
      useCase: 'x',
      tier: 'broad',
      rules: [],
      // @ts-expect-error -- not a catalog kernel
      acceptable: ['freecad'],
      preferred: [],
    } satisfies KernelRoutingZone;
    expectTypeOf(zone.id).toEqualTypeOf<'U1'>();
  });

  it('should keep auto out of KernelId', () => {
    expectTypeOf<'auto'>().not.toExtend<KernelId>();
    expectTypeOf<'auto'>().toExtend<KernelPreference>();
  });
});
