import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { quantityKinds } from '@taucad/units/quantity';
import { quantity } from '#configuration/zod.js';

describe('quantity schema inference', () => {
  it('should return a normal extensible Zod number', () => {
    const schema = quantity({ unit: 'm', quantityKind: quantityKinds.length, space: 'linear' })
      .positive()
      .int()
      .default(1);
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<number | undefined>();
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<number>();
    expectTypeOf(
      quantity({ unit: 'm3', quantityKind: quantityKinds.volume, space: 'linear' }),
    ).toEqualTypeOf<z.ZodNumber>();
  });

  it('should reject unit names and misspelled quantity kinds', () => {
    // @ts-expect-error -- meter is a unit, not a quantity kind.
    quantity('meter');
    // @ts-expect-error -- quantity IDs come from the canonical registry.
    quantity({ unit: 'm', quantityKind: 'lenght' });
  });
});
