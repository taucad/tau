import { expectTypeOf, test } from 'vitest';
import { formatQuantity, parseInput } from '@taucad/units/input';
import type { FormattedQuantity } from '@taucad/units/input';
import { checkOperation, convert, createQuantity } from '@taucad/units/quantity';
import type {
  CheckedScalar,
  ConvertRequest,
  CreateQuantityRequest,
  OperationRequest,
  Quantity,
} from '@taucad/units/quantity';
import { admitUnit } from '@taucad/units/unit';
import * as unitApi from '@taucad/units/unit';
import type { AdmittedUnit, UnitResult } from '@taucad/units/unit';

test('public types expose checked results', () => {
  expectTypeOf(admitUnit('mm')).toEqualTypeOf<UnitResult<AdmittedUnit>>();
  expectTypeOf(parseInput({ text: '1 mm' }).status).toEqualTypeOf<
    'success' | 'invalid' | 'unsupported' | 'indeterminate' | 'incomplete'
  >();
  const quantity = null as unknown as Quantity;
  const operation = { operator: 'add', left: quantity, right: quantity } satisfies OperationRequest;
  expectTypeOf(checkOperation(operation)).toEqualTypeOf<UnitResult<Quantity | CheckedScalar>>();
  const conversion = { quantity, to: 'mm' } satisfies ConvertRequest;
  expectTypeOf(convert(conversion)).toEqualTypeOf<UnitResult<Quantity>>();
  expectTypeOf(formatQuantity({ quantity })).toEqualTypeOf<UnitResult<FormattedQuantity>>();

  const decimal = {
    value: '1.2300',
    representation: 'decimal',
    unit: 'mm',
    space: 'linear',
  } satisfies CreateQuantityRequest;
  expectTypeOf(createQuantity(decimal)).toEqualTypeOf<UnitResult<Quantity>>();

  // @ts-expect-error unknown operations are rejected statically
  checkOperation({ operator: 'eval', left: quantity });
  // @ts-expect-error conversion requires an admitted quantity rather than a bare number
  const rawConversion: ConvertRequest = { quantity: 1, to: 'mm' };
  // @ts-expect-error decimal representation requires exact string payload
  const invalidDecimal: CreateQuantityRequest = { value: 1.23, representation: 'decimal', unit: 'mm', space: 'linear' };
  // @ts-expect-error public unit API does not expose the provider conversion seam
  unitApi.convertWithProvider('m', 1, 'mm');
  // @ts-expect-error quantities are readonly
  quantity.value = 2;
  expectTypeOf(rawConversion).toBeObject();
  expectTypeOf(invalidDecimal).toBeObject();
});
