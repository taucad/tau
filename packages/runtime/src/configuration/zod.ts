import { z } from 'zod';
import { quantityIds } from '@taucad/units/constants';
import type { QuantityId } from '@taucad/units';

/**
 * Author a numeric quantity using the registry's canonical SI unit.
 *
 * Constraints, defaults and examples use the same canonical unit. Presentation
 * conversion belongs to the renderer, not this schema. Ordinary Zod number
 * methods remain available and propagate the semantic JSON Schema annotation.
 *
 * @param id - A canonical quantity kind, such as length, speed or volume.
 * @returns A normal Zod number with native quantity metadata propagation.
 * @public
 * @example <caption>Constrain a canonical length in metres</caption>
 * ```typescript
 * import { quantity } from '@taucad/runtime/configuration/zod';
 *
 * const layerHeight = quantity('length').positive().max(0.01);
 * ```
 */
export const quantity = (id: QuantityId): z.ZodNumber => {
  if (!quantityIds.includes(id)) {
    throw new TypeError('Unknown quantity kind.');
  }
  return z.number().check(z.meta({ 'x-tau-quantity': id }));
};
