import { getKindRule, quantityReferences } from '#semantics.js';
import { admitUnit, unitLimits, unitProfile } from '#unit.js';
import type {
  Assumption,
  Quantity,
  QuantityRepresentation,
  QuantitySpace,
  UnitExpression,
} from '#quantity-contract.js';
import type { Dimension, ProviderDimension, UnitDiagnosticCode, UnitResult } from '#unit.js';

type RuntimeRecord = Readonly<
  Record<string, unknown> & {
    assumptions?: unknown;
    behavior?: unknown;
    classification?: unknown;
    code?: unknown;
    dimension?: unknown;
    evidence?: unknown;
    exponent?: unknown;
    expression?: unknown;
    factor?: unknown;
    kind?: unknown;
    left?: unknown;
    numericProvenance?: unknown;
    operand?: unknown;
    operator?: unknown;
    profile?: unknown;
    providerDimension?: unknown;
    reference?: unknown;
    representation?: unknown;
    right?: unknown;
    rule?: unknown;
    scale?: unknown;
    source?: unknown;
    space?: unknown;
    unit?: unknown;
    value?: unknown;
  }
>;

/** Internal quantity narrowed to an executable binary64 representation. */
export type ExecutableQuantity = Readonly<{
  value: number;
  representation?: 'binary64' | 'safe-integer';
  unit: Quantity['unit'];
  kind?: Quantity['kind'];
  space: Quantity['space'];
  reference?: Quantity['reference'];
  assumptions: Quantity['assumptions'];
  numericProvenance?: Quantity['numericProvenance'];
}>;

const dimensionKeys: ReadonlyArray<keyof Dimension> = [
  'length',
  'time',
  'mass',
  'angle',
  'temperature',
  'electricCurrent',
  'luminousIntensity',
  'amountOfSubstance',
];
const providerDimensionKeys: ReadonlyArray<keyof ProviderDimension> = [
  'length',
  'time',
  'mass',
  'angle',
  'temperature',
  'charge',
  'luminousIntensity',
  'amountOfSubstance',
];

export const failure = <T>(
  status: 'invalid' | 'unsupported' | 'indeterminate',
  code: UnitDiagnosticCode,
  message: string,
): UnitResult<T> => ({ status, diagnostic: { code, message } });

export const checkedScale = (value: number): UnitResult<number> => {
  if (!Number.isFinite(value)) {
    return failure('unsupported', 'NUMERIC_OVERFLOW', 'Scale is outside finite binary64.');
  }
  return value === 0
    ? failure('unsupported', 'NUMERIC_UNDERFLOW', 'Scale underflows finite binary64.')
    : { status: 'success', value };
};

const isRecord = (value: unknown): value is RuntimeRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDimension = (value: unknown): value is Dimension =>
  isRecord(value) && dimensionKeys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));

const isProviderDimension = (value: unknown): value is ProviderDimension =>
  isRecord(value) &&
  providerDimensionKeys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));

export const sameDimension = (left: Dimension, right: Dimension): boolean =>
  dimensionKeys.every((key) => left[key] === right[key]);

const sameProviderDimension = (left: ProviderDimension, right: ProviderDimension): boolean =>
  providerDimensionKeys.every((key) => left[key] === right[key]);

export const mapDimension = (source: Dimension, factor: number): Dimension =>
  Object.freeze({
    length: source.length * factor,
    time: source.time * factor,
    mass: source.mass * factor,
    angle: source.angle * factor,
    temperature: source.temperature * factor,
    electricCurrent: source.electricCurrent * factor,
    luminousIntensity: source.luminousIntensity * factor,
    amountOfSubstance: source.amountOfSubstance * factor,
  });

export const combineDimension = (left: Dimension, right: Dimension, sign: 1 | -1): Dimension =>
  Object.freeze({
    length: left.length + sign * right.length,
    time: left.time + sign * right.time,
    mass: left.mass + sign * right.mass,
    angle: left.angle + sign * right.angle,
    temperature: left.temperature + sign * right.temperature,
    electricCurrent: left.electricCurrent + sign * right.electricCurrent,
    luminousIntensity: left.luminousIntensity + sign * right.luminousIntensity,
    amountOfSubstance: left.amountOfSubstance + sign * right.amountOfSubstance,
  });

type EvaluatedExpression = Readonly<{
  code: string;
  dimension: Dimension;
  expression: UnitExpression;
  scale: number;
}>;

const evaluateExpression = (expression: unknown, state: { nodes: number }): UnitResult<EvaluatedExpression> => {
  state.nodes += 1;
  if (state.nodes > unitLimits.expressionNodes) {
    return failure('invalid', 'RESOURCE_LIMIT', 'Derived expression exceeds the supported node limit.');
  }
  if (!isRecord(expression) || typeof expression.operator !== 'string') {
    return failure('invalid', 'METADATA_CONFLICT', 'Derived expression is malformed.');
  }
  if (expression.operator === 'unit') {
    if (typeof expression.unit !== 'string') {
      return failure('invalid', 'METADATA_CONFLICT', 'Derived unit leaf is malformed.');
    }
    const admitted = admitUnit(expression.unit);
    if (admitted.status !== 'success') {
      return admitted;
    }
    return {
      status: 'success',
      value: {
        code: admitted.value.code,
        dimension: admitted.value.dimension,
        expression: Object.freeze({ operator: 'unit', unit: admitted.value.code }),
        scale: admitted.value.scale,
      },
    };
  }
  if (expression.operator === 'multiply' || expression.operator === 'divide') {
    const left = evaluateExpression(expression.left, state);
    if (left.status !== 'success') {
      return left;
    }
    const right = evaluateExpression(expression.right, state);
    if (right.status !== 'success') {
      return right;
    }
    const divide = expression.operator === 'divide';
    const scale = divide ? left.value.scale / right.value.scale : left.value.scale * right.value.scale;
    const checked = checkedScale(scale);
    if (checked.status !== 'success') {
      return checked;
    }
    return {
      status: 'success',
      value: {
        code: `(${left.value.code})${divide ? '/' : '*'}(${right.value.code})`,
        dimension: combineDimension(left.value.dimension, right.value.dimension, divide ? -1 : 1),
        expression: Object.freeze({
          operator: expression.operator,
          left: left.value.expression,
          right: right.value.expression,
        }),
        scale: checked.value,
      },
    };
  }
  if (expression.operator === 'power' || expression.operator === 'root') {
    if (typeof expression.exponent !== 'number') {
      return failure('invalid', 'METADATA_CONFLICT', 'Derived expression exponent is malformed.');
    }
    const operand = evaluateExpression(expression.operand, state);
    if (operand.status !== 'success') {
      return operand;
    }
    if (
      !Number.isSafeInteger(expression.exponent) ||
      Math.abs(expression.exponent) > unitLimits.exponentMagnitude ||
      (expression.operator === 'root' && expression.exponent === 0)
    ) {
      return failure('invalid', 'RESOURCE_LIMIT', 'Derived expression exponent is outside the supported range.');
    }
    const factor = expression.operator === 'root' ? 1 / expression.exponent : expression.exponent;
    const scale = operand.value.scale ** factor;
    const checked = checkedScale(scale);
    if (checked.status !== 'success') {
      return checked;
    }
    return {
      status: 'success',
      value: {
        code: `${expression.operator}(${operand.value.code},${expression.exponent})`,
        dimension: mapDimension(operand.value.dimension, factor),
        expression: Object.freeze({
          operator: expression.operator,
          operand: operand.value.expression,
          exponent: expression.exponent,
        }),
        scale: checked.value,
      },
    };
  }
  return failure('invalid', 'METADATA_CONFLICT', 'Derived expression operator is unsupported.');
};

export const unitExpression = (quantity: Quantity): UnitExpression =>
  quantity.unit.classification === 'derived'
    ? quantity.unit.expression
    : { operator: 'unit', unit: quantity.unit.code };

const validAssumptions = (value: unknown): value is readonly Assumption[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.profile === 'string' &&
      item.profile.length > 0 &&
      typeof item.rule === 'string' &&
      item.rule.length > 0 &&
      typeof item.evidence === 'string' &&
      item.evidence.length > 0,
  );

export const copyAssumptions = (assumptions: readonly Assumption[]): readonly Assumption[] =>
  Object.freeze(
    assumptions.map(({ profile, rule, evidence }) =>
      Object.freeze({
        profile,
        rule,
        evidence,
      }),
    ),
  );

const isAbsoluteUri = (value: string): boolean => {
  try {
    return new URL(value).protocol.length > 1;
  } catch {
    return false;
  }
};

const validateUnit = (unit: unknown): UnitResult<Quantity['unit']> => {
  if (!isRecord(unit) || typeof unit.classification !== 'string') {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity unit metadata is malformed.');
  }
  if (unit.classification === 'derived') {
    const evaluated = evaluateExpression(unit.expression, { nodes: 0 });
    if (evaluated.status !== 'success') {
      return evaluated;
    }
    if (
      unit.profile !== unitProfile ||
      unit.code !== evaluated.value.code ||
      !isDimension(unit.dimension) ||
      !sameDimension(unit.dimension, evaluated.value.dimension) ||
      unit.scale !== evaluated.value.scale
    ) {
      return failure('invalid', 'METADATA_CONFLICT', 'Derived unit metadata does not match its expression.');
    }
    return {
      status: 'success',
      value: Object.freeze({
        code: evaluated.value.code,
        dimension: evaluated.value.dimension,
        classification: 'derived',
        expression: evaluated.value.expression,
        scale: evaluated.value.scale,
        profile: unitProfile,
      }),
    };
  }
  if (typeof unit.code !== 'string') {
    return failure('invalid', 'METADATA_CONFLICT', 'Admitted unit metadata is malformed.');
  }
  const admitted = admitUnit(unit.code);
  if (admitted.status !== 'success') {
    return admitted;
  }
  if (
    unit.classification !== admitted.value.classification ||
    unit.profile !== admitted.value.profile ||
    unit.scale !== admitted.value.scale ||
    !isDimension(unit.dimension) ||
    !sameDimension(unit.dimension, admitted.value.dimension) ||
    !isProviderDimension(unit.providerDimension) ||
    !sameProviderDimension(unit.providerDimension, admitted.value.providerDimension)
  ) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity metadata conflicts with UCUM admission.');
  }
  return { status: 'success', value: admitted.value };
};

const validRepresentation = (value: unknown): value is QuantityRepresentation | undefined =>
  value === undefined || value === 'binary64' || value === 'safe-integer' || value === 'decimal';

const validSpace = (value: unknown): value is QuantitySpace =>
  value === 'linear' || value === 'difference' || value === 'point';

export const validateQuantity = (quantity: unknown): UnitResult<Quantity> => {
  if (!isRecord(quantity)) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity must be an object.');
  }
  if (!validRepresentation(quantity.representation)) {
    return failure('invalid', 'REPRESENTATION_UNSUPPORTED', 'Quantity representation is not supported.');
  }
  if (!validAssumptions(quantity.assumptions)) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity assumptions are malformed.');
  }
  if (!validSpace(quantity.space)) {
    return failure('invalid', 'SPACE_MISMATCH', 'Quantity space is unsupported.');
  }
  const unit = validateUnit(quantity.unit);
  if (unit.status !== 'success') {
    return unit;
  }
  if (quantity.kind !== undefined && (typeof quantity.kind !== 'string' || !isAbsoluteUri(quantity.kind))) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity kind must be an absolute URI.');
  }
  const kind = typeof quantity.kind === 'string' ? quantity.kind : undefined;
  const kindRule = kind ? getKindRule(kind) : undefined;
  if (kindRule) {
    if (!sameDimension(unit.value.dimension, kindRule.dimension)) {
      return failure('invalid', 'KIND_MISMATCH', 'Quantity kind conflicts with the admitted unit dimension.');
    }
    if (!kindRule.spaces.includes(quantity.space)) {
      return failure('invalid', 'SPACE_MISMATCH', 'Quantity kind does not support the requested mathematical space.');
    }
  }
  const reference = typeof quantity.reference === 'string' ? quantity.reference : undefined;
  if (quantity.reference !== undefined && reference === undefined) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity reference must be a string.');
  }
  if (quantity.space === 'point') {
    if (kindRule?.family !== 'temperature') {
      return failure('indeterminate', 'SEMANTICS_UNRESOLVED', 'The initial point profile supports temperature only.');
    }
    if (reference !== quantityReferences.thermodynamicAbsoluteZero) {
      return failure(
        'invalid',
        'SPACE_MISMATCH',
        'Temperature point reference is not the supported thermodynamic reference.',
      );
    }
  } else if (reference !== undefined) {
    return failure('invalid', 'SPACE_MISMATCH', 'References are valid only for point quantities.');
  }
  if (unit.value.classification === 'affine-point' && quantity.space === 'linear') {
    return failure('invalid', 'SPACE_MISMATCH', 'Affine temperature codes require point or difference space.');
  }

  let numericProvenance: Quantity['numericProvenance'];
  if (quantity.numericProvenance !== undefined) {
    const provenance = quantity.numericProvenance;
    if (
      !isRecord(provenance) ||
      provenance.source !== 'ucum-lhc-7.1.9' ||
      typeof provenance.factor !== 'number' ||
      !Number.isFinite(provenance.factor) ||
      provenance.factor === 0 ||
      provenance.behavior !== 'binary64-rounded'
    ) {
      return failure('invalid', 'METADATA_CONFLICT', 'Numeric provenance is malformed.');
    }
    numericProvenance = Object.freeze({
      source: 'ucum-lhc-7.1.9',
      factor: provenance.factor,
      behavior: 'binary64-rounded',
    });
  }

  const metadata = {
    unit: unit.value,
    kind,
    space: quantity.space,
    reference,
    assumptions: copyAssumptions(quantity.assumptions),
    numericProvenance,
  };
  if (quantity.representation === 'decimal') {
    if (typeof quantity.value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(quantity.value)) {
      return failure(
        'invalid',
        'REPRESENTATION_UNSUPPORTED',
        'Decimal representation requires preserved decimal text.',
      );
    }
    return {
      status: 'success',
      value: Object.freeze({ ...metadata, value: quantity.value, representation: 'decimal' }),
    };
  }
  if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    return failure('invalid', 'NUMERIC_OVERFLOW', 'Quantity value must be finite binary64.');
  }
  if (quantity.representation === 'safe-integer' && !Number.isSafeInteger(quantity.value)) {
    return failure('unsupported', 'REPRESENTATION_UNSUPPORTED', 'Safe-integer execution requires a safe integer.');
  }
  return {
    status: 'success',
    value: Object.freeze({ ...metadata, value: quantity.value, representation: quantity.representation }),
  };
};

const isExecutable = (quantity: Quantity): quantity is ExecutableQuantity => quantity.representation !== 'decimal';

export const validateExecutableQuantity = (quantity: unknown): UnitResult<ExecutableQuantity> => {
  const valid = validateQuantity(quantity);
  if (valid.status !== 'success') {
    return valid;
  }
  return isExecutable(valid.value)
    ? { status: 'success', value: valid.value }
    : failure('unsupported', 'REPRESENTATION_UNSUPPORTED', 'Decimal quantities are preserved but not executable.');
};
