import { describe, expectTypeOf, it } from 'vitest';
import { quantityRegistry } from '#constants/quantity.constants.js';
import type { quantityIds } from '#constants/quantity.constants.js';
import type { QuantityId, UnitId } from '#types/unit.types.js';

describe('quantity registry types', () => {
  it('should preserve quantity-specific unit and canonical IDs', () => {
    expectTypeOf<(typeof quantityIds)[number]>().toEqualTypeOf<QuantityId>();
    expectTypeOf(quantityRegistry.length.canonicalUnit).toEqualTypeOf<'meter'>();
    expectTypeOf<UnitId<'length'>>().toEqualTypeOf<keyof (typeof quantityRegistry)['length']['units'] & string>();

    const lengthUnit: UnitId<'length'> = 'meter';
    expectTypeOf(lengthUnit).toEqualTypeOf<'meter'>();
    // @ts-expect-error -- time units are not length units.
    const wrongQuantity: UnitId<'length'> = 'second';
    // @ts-expect-error -- unknown units are not admitted by the quantity registry.
    const unknownUnit: UnitId<'length'> = 'furlong';
    // @ts-expect-error -- filtered compound-kilogram prefixes are not admitted.
    const invalidDensity: UnitId<'density'> = 'millikilogramPerCubicMeter';
    void wrongQuantity;
    void unknownUnit;
    void invalidDensity;
  });
});
