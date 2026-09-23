import { z } from 'zod';
import { admitUnit } from '@taucad/units/unit';
import { quantityKinds, quantityReferences } from '@taucad/units/quantity';

/** Unit and optional runtime semantics for a native numeric configuration field. @public */
export type QuantitySchemaOptions = Readonly<{
  unit: string;
  quantityKind?: (typeof quantityKinds)[keyof typeof quantityKinds];
  space?: 'linear' | 'difference' | 'point';
  reference?: (typeof quantityReferences)[keyof typeof quantityReferences];
  /** Display symbol for the native unit, such as `px` for a dimensionless pixel count. */
  symbol?: string;
}>;

/**
 * Author a numeric quantity using the registry's canonical SI unit.
 *
 * Constraints, defaults and examples use the same unit, which is the unit the
 * consumer receives: a kernel option in model millimetres declares `mm`.
 * Presentation conversion belongs to the renderer, not this schema. Ordinary Zod number
 * methods remain available and propagate the semantic JSON Schema annotation.
 *
 * @param options - Native UCUM code and optional exact QUDT/space semantics.
 * @returns A normal Zod number with native quantity metadata propagation.
 * @public
 * @example <caption>Constrain a canonical length in metres</caption>
 * ```typescript
 * import { quantity } from '@taucad/runtime/configuration/zod';
 *
 * const layerHeight = quantity({
 *   unit: 'm',
 *   quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
 *   space: 'linear',
 * }).positive().max(0.01);
 * ```
 */
export const quantity = (options: QuantitySchemaOptions): z.ZodNumber => {
  if (admitUnit(options.unit).status !== 'success') {
    throw new TypeError('Invalid or unsupported UCUM unit.');
  }
  if (options.quantityKind !== undefined && !Object.values(quantityKinds).includes(options.quantityKind)) {
    throw new TypeError('Unknown quantity kind.');
  }
  if (options.reference !== undefined && !Object.values(quantityReferences).includes(options.reference)) {
    throw new TypeError('Unknown quantity reference.');
  }
  if ((options.space === 'point') !== (options.reference !== undefined)) {
    throw new TypeError('Point quantities require a supported reference and other spaces forbid one.');
  }
  if (options.symbol !== undefined && options.symbol.length === 0) {
    throw new TypeError('A quantity symbol must not be empty.');
  }
  return z.number().check(
    z.meta({
      'x-tau-unit': options.unit,
      ...(options.quantityKind === undefined ? {} : { 'x-tau-quantity-kind': options.quantityKind }),
      ...(options.space === undefined ? {} : { 'x-tau-space': options.space }),
      ...(options.reference === undefined ? {} : { 'x-tau-reference': options.reference }),
      ...(options.symbol === undefined ? {} : { 'x-tau-symbol': options.symbol }),
    }),
  );
};
