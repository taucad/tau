import { convertWithProvider } from '#provider.js';
import type * as Contract from '#quantity-contract.js';
import {
  combineDimension,
  checkedScale,
  copyAssumptions,
  failure,
  mapDimension,
  sameDimension,
  unitExpression,
  validateExecutableQuantity,
  validateQuantity,
} from '#quantity-validation.js';
import type { ExecutableQuantity } from '#quantity-validation.js';
import {
  compatibleKind,
  derivedKind,
  getKindRule,
  quantityKinds as reviewedQuantityKinds,
  quantityReferences as reviewedQuantityReferences,
} from '#semantics.js';
import { admitUnit, unitLimits } from '#unit.js';
import type { Dimension, UnitResult } from '#unit.js';

/** Evidence retained when semantics came from an inference profile. @public */
export type Assumption = Contract.Assumption;
/** Dimensionless or ordering result with retained assumptions. @public */
export type CheckedScalar = Contract.CheckedScalar;
/** Request for a checked unit conversion. @public */
export type ConvertRequest = Contract.ConvertRequest;
/** Request to construct an admitted quantity. @public */
export type CreateQuantityRequest = Contract.CreateQuantityRequest;
/** Request for one checked algebra operation. @public */
export type OperationRequest = Contract.OperationRequest;
/** Checked quantity, including preserved decimal text unsupported for execution. @public */
export type Quantity = Contract.Quantity;
/** Open absolute quantity-kind URI; known behavior is limited to `quantityKinds`. @public */
export type QuantityKind = Contract.QuantityKind;
/** Numeric representation carried by a quantity. @public */
export type QuantityRepresentation = Contract.QuantityRepresentation;
/** Mathematical space of a quantity. @public */
export type QuantitySpace = Contract.QuantitySpace;
/** Unit metadata for a constructed or derived quantity. @public */
export type QuantityUnit = Contract.QuantityUnit;
/** Semantic admission mode. @public */
export type SemanticMode = Contract.SemanticMode;
/** Revalidatable unit expression emitted by checked derived operations. @public */
export type UnitExpression = Contract.UnitExpression;

/** QUDT 3.5.1 identities in Tau's exact reviewed quantity-kind table. @public */
export const quantityKinds = reviewedQuantityKinds;
/** Reference identities admitted by Tau's initial point profile. @public */
export const quantityReferences = reviewedQuantityReferences;

const numericSource = 'ucum-lhc-7.1.9';

const mergeAssumptions = (...values: Quantity[]): readonly Assumption[] =>
  copyAssumptions([
    ...new Map(
      values
        .flatMap((value) => value.assumptions)
        .map((item) => [`${item.profile}\0${item.rule}\0${item.evidence}`, item]),
    ).values(),
  ]);

const resultRepresentation = (...values: Quantity[]): 'binary64' | 'safe-integer' =>
  values.every((value) => value.representation === 'safe-integer') ? 'safe-integer' : 'binary64';

const checkedNumber = (
  value: number,
  representation: 'binary64' | 'safe-integer',
  underflow: boolean,
): UnitResult<number> => {
  if (!Number.isFinite(value)) {
    return failure('invalid', 'NUMERIC_OVERFLOW', 'Operation produced a non-finite value.');
  }
  if (underflow && value === 0) {
    return failure('unsupported', 'NUMERIC_UNDERFLOW', 'Operation underflowed finite binary64.');
  }
  if (representation === 'safe-integer' && !Number.isSafeInteger(value)) {
    return failure('unsupported', 'REPRESENTATION_UNSUPPORTED', 'Operation does not preserve a safe integer.');
  }
  return { status: 'success', value };
};

const knownCompatibleKind = (left: Quantity, right: Quantity): UnitResult<string> => {
  if (!left.kind || !right.kind || !getKindRule(left.kind) || !getKindRule(right.kind)) {
    return failure('indeterminate', 'SEMANTICS_UNRESOLVED', 'Known quantity kinds are required for this operation.');
  }
  const kind = compatibleKind(left.kind, right.kind);
  return kind
    ? { status: 'success', value: kind }
    : failure('invalid', 'KIND_MISMATCH', 'Kinds are not a reviewed compatible pair.');
};

const withValue = ({
  quantity,
  value,
  operands,
  kind,
}: Readonly<{
  quantity: ExecutableQuantity;
  value: number;
  operands: readonly ExecutableQuantity[];
  kind: string;
}>): UnitResult<Quantity> => {
  const representation = resultRepresentation(...operands);
  const numeric = checkedNumber(value, representation, false);
  if (numeric.status !== 'success') {
    return numeric;
  }
  return validateQuantity(
    Object.freeze({
      ...quantity,
      value: numeric.value,
      representation,
      kind,
      assumptions: mergeAssumptions(...operands),
    }),
  );
};

const isRuntimeRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Construct an admitted quantity while preserving unsupported decimal text.
 * @param request - Quantity value and semantic metadata to validate.
 * @returns A checked quantity or a structured diagnostic.
 * @public
 */
export function createQuantity(request: CreateQuantityRequest): UnitResult<Quantity> {
  const candidate: unknown = request;
  if (!isRuntimeRecord(candidate)) {
    return failure('invalid', 'METADATA_CONFLICT', 'Quantity request must be an object.');
  }
  if (
    candidate['semanticMode'] !== undefined &&
    candidate['semanticMode'] !== 'default' &&
    candidate['semanticMode'] !== 'declared-only'
  ) {
    return failure('invalid', 'METADATA_CONFLICT', 'Semantic mode is unsupported.');
  }
  if (
    candidate['semanticMode'] === 'declared-only' &&
    (typeof candidate['kind'] !== 'string' ||
      !getKindRule(candidate['kind']) ||
      (Array.isArray(candidate['assumptions']) && candidate['assumptions'].length > 0))
  ) {
    return failure(
      'indeterminate',
      'SEMANTICS_UNRESOLVED',
      'Declared-only admission rejects inferred or missing semantics.',
    );
  }
  const unit = admitUnit(typeof candidate['unit'] === 'string' ? candidate['unit'] : '');
  if (unit.status !== 'success') {
    return unit;
  }
  const kind = typeof candidate['kind'] === 'string' ? candidate['kind'] : undefined;
  const rule = kind ? getKindRule(kind) : undefined;
  const reference =
    candidate['space'] === 'point' && rule?.family === 'temperature'
      ? (candidate['reference'] ?? quantityReferences.thermodynamicAbsoluteZero)
      : candidate['reference'];
  return validateQuantity(
    Object.freeze({
      value: candidate['value'],
      representation: candidate['representation'],
      unit: unit.value,
      kind: candidate['kind'],
      space: candidate['space'],
      reference,
      assumptions: candidate['assumptions'] ?? [],
    }),
  );
}

/**
 * Convert an executable quantity while preserving semantic metadata.
 * @param request - Quantity and complete target UCUM code.
 * @returns A converted quantity or a structured diagnostic.
 * @public
 */
export function convert(request: ConvertRequest): UnitResult<Quantity> {
  const candidate: unknown = request;
  if (!isRuntimeRecord(candidate)) {
    return failure('invalid', 'METADATA_CONFLICT', 'Conversion request must be an object.');
  }
  const source = validateExecutableQuantity(candidate['quantity']);
  if (source.status !== 'success') {
    return source;
  }
  if (typeof candidate['to'] !== 'string') {
    return failure('invalid', 'UNIT_INVALID', 'Target unit must be a string.');
  }
  const target = admitUnit(candidate['to']);
  if (target.status !== 'success') {
    return target;
  }
  if (!sameDimension(source.value.unit.dimension, target.value.dimension)) {
    return failure('invalid', 'DIMENSION_MISMATCH', 'Units have incompatible dimensions.');
  }
  if (source.value.unit.code === target.value.code) {
    return { status: 'success', value: source.value };
  }

  const factor = source.value.unit.scale / target.value.scale;
  const checkedFactor = checkedScale(factor);
  if (checkedFactor.status !== 'success') {
    return checkedFactor;
  }
  const converted: UnitResult<number> =
    source.value.space === 'point'
      ? convertWithProvider(source.value.unit.code, source.value.value, target.value.code)
      : { status: 'success', value: source.value.value * checkedFactor.value };
  if (converted.status !== 'success') {
    return converted;
  }
  const numeric = checkedNumber(
    converted.value,
    resultRepresentation(source.value),
    source.value.space !== 'point' && source.value.value !== 0,
  );
  if (numeric.status !== 'success') {
    return numeric;
  }
  return validateQuantity(
    Object.freeze({
      ...source.value,
      value: numeric.value,
      unit: target.value,
      numericProvenance: { source: numericSource, factor: checkedFactor.value, behavior: 'binary64-rounded' },
    }),
  );
}

const align = (
  left: ExecutableQuantity,
  right: ExecutableQuantity,
  spaces: 'same' | 'point-difference' = 'same',
): UnitResult<Readonly<{ kind: string; right: ExecutableQuantity }>> => {
  const leftValid = validateExecutableQuantity(left);
  if (leftValid.status !== 'success') {
    return leftValid;
  }
  const rightValid = validateExecutableQuantity(right);
  if (rightValid.status !== 'success') {
    return rightValid;
  }
  if (!sameDimension(leftValid.value.unit.dimension, rightValid.value.unit.dimension)) {
    return failure('invalid', 'DIMENSION_MISMATCH', 'Quantities have incompatible dimensions.');
  }
  if (
    (spaces === 'same' && leftValid.value.space !== rightValid.value.space) ||
    (spaces === 'point-difference' && !(leftValid.value.space === 'point' && rightValid.value.space === 'difference'))
  ) {
    return failure('invalid', 'SPACE_MISMATCH', 'Quantities use incompatible mathematical spaces.');
  }
  if (
    leftValid.value.space === 'point' &&
    rightValid.value.space === 'point' &&
    leftValid.value.reference !== rightValid.value.reference
  ) {
    return failure('invalid', 'SPACE_MISMATCH', 'Point references differ.');
  }
  const kind = knownCompatibleKind(leftValid.value, rightValid.value);
  if (kind.status !== 'success') {
    return kind;
  }
  let converted: UnitResult<Quantity>;
  if (leftValid.value.unit.classification === 'derived') {
    const factor = rightValid.value.unit.scale / leftValid.value.unit.scale;
    const checkedFactor = checkedScale(factor);
    if (checkedFactor.status !== 'success') {
      return checkedFactor;
    }
    const numeric = checkedNumber(
      rightValid.value.value * checkedFactor.value,
      'binary64',
      rightValid.value.value !== 0,
    );
    converted =
      numeric.status === 'success'
        ? validateQuantity(
            Object.freeze({
              ...rightValid.value,
              value: numeric.value,
              unit: leftValid.value.unit,
              numericProvenance: {
                source: numericSource,
                factor: checkedFactor.value,
                behavior: 'binary64-rounded',
              },
            }),
          )
        : numeric;
  } else {
    const alignmentSource: ExecutableQuantity = Object.freeze({
      ...rightValid.value,
      representation: 'binary64',
    });
    converted = convert({ quantity: alignmentSource, to: leftValid.value.unit.code });
  }
  if (converted.status !== 'success') {
    return converted;
  }
  const executable = validateExecutableQuantity(converted.value);
  return executable.status === 'success'
    ? { status: 'success', value: { kind: kind.value, right: executable.value } }
    : executable;
};

type DerivedRequest = Readonly<{
  operator: 'multiply' | 'divide' | 'power' | 'root';
  left: ExecutableQuantity;
  right?: ExecutableQuantity;
  exponent?: number;
  value: number;
  dimension: Dimension;
  scale: number;
}>;

const derived = ({
  operator,
  left,
  right,
  exponent,
  value,
  dimension,
  scale,
}: DerivedRequest): UnitResult<Quantity> => {
  const representation = resultRepresentation(left, ...(right ? [right] : []));
  const numeric = checkedNumber(value, representation, value === 0 && left.value !== 0 && (right?.value ?? 1) !== 0);
  if (numeric.status !== 'success') {
    return numeric;
  }
  const validScale = checkedScale(scale);
  if (validScale.status !== 'success') {
    return validScale;
  }

  let expression: UnitExpression;
  let code: string;
  if (operator === 'multiply' || operator === 'divide') {
    if (!right) {
      return failure('invalid', 'METADATA_CONFLICT', 'Binary derived operation requires a right quantity.');
    }
    expression = { operator, left: unitExpression(left), right: unitExpression(right) };
    code = `(${left.unit.code})${operator === 'multiply' ? '*' : '/'}(${right.unit.code})`;
  } else {
    if (exponent === undefined) {
      return failure('invalid', 'METADATA_CONFLICT', 'Power/root requires an exponent.');
    }
    expression = { operator, operand: unitExpression(left), exponent };
    code = `${operator}(${left.unit.code},${exponent})`;
  }
  const rightKindOrExponent = right?.kind ?? exponent;
  const kind =
    left.kind && rightKindOrExponent !== undefined ? derivedKind(operator, left.kind, rightKindOrExponent) : undefined;
  return validateQuantity(
    Object.freeze({
      value: numeric.value,
      representation,
      unit: Object.freeze({
        code,
        dimension,
        classification: 'derived',
        expression,
        scale: validScale.value,
        profile: left.unit.profile,
      }),
      kind,
      space: 'linear',
      assumptions: mergeAssumptions(left, ...(right ? [right] : [])),
    }),
  );
};

const scalar = (
  value: number,
  quantities: readonly ExecutableQuantity[],
  underflow = false,
): UnitResult<CheckedScalar> => {
  const representation = resultRepresentation(...quantities);
  const numeric = checkedNumber(value, representation, underflow);
  return numeric.status === 'success'
    ? {
        status: 'success',
        value: Object.freeze({
          value: numeric.value,
          assumptions: mergeAssumptions(...quantities),
          representation,
        }),
      }
    : numeric;
};

const supportedOperators = new Set<string>([
  'add',
  'subtract',
  'compare',
  'min',
  'max',
  'multiply',
  'divide',
  'clamp',
  'power',
  'root',
  'sin',
  'cos',
  'tan',
  'exp',
  'log',
]);

/**
 * Execute checked scalar algebra.
 * @param request - One operation and its operands.
 * @returns A checked quantity or scalar, or a structured diagnostic.
 * @public
 */
export function checkOperation(request: OperationRequest): UnitResult<Quantity | CheckedScalar> {
  const candidate: unknown = request;
  if (
    !isRuntimeRecord(candidate) ||
    typeof candidate['operator'] !== 'string' ||
    !supportedOperators.has(candidate['operator'])
  ) {
    return failure('invalid', 'METADATA_CONFLICT', 'Operation request is malformed.');
  }
  const valid = validateExecutableQuantity(request.left);
  if (valid.status !== 'success') {
    return valid;
  }
  const left = valid.value;

  if (request.operator === 'sin' || request.operator === 'cos' || request.operator === 'tan') {
    if (!left.kind || getKindRule(left.kind)?.family !== 'angle') {
      return left.kind
        ? failure('invalid', 'KIND_MISMATCH', 'Trigonometry requires a known plane angle.')
        : failure('indeterminate', 'SEMANTICS_UNRESOLVED', 'Trigonometry requires a known plane angle.');
    }
    const canonical = checkedNumber(left.value * left.unit.scale, 'binary64', left.value !== 0);
    return canonical.status === 'success' ? scalar(Math[request.operator](canonical.value), [left]) : canonical;
  }
  if (request.operator === 'exp' || request.operator === 'log') {
    if (!left.kind || getKindRule(left.kind)?.family !== 'ratio') {
      return left.kind
        ? failure('invalid', 'KIND_MISMATCH', 'Operation requires a known dimensionless ratio.')
        : failure('indeterminate', 'SEMANTICS_UNRESOLVED', 'Operation requires a known dimensionless ratio.');
    }
    const canonical = checkedNumber(left.value * left.unit.scale, 'binary64', left.value !== 0);
    if (canonical.status !== 'success') {
      return canonical;
    }
    const ratio = canonical.value;
    if (request.operator === 'log' && ratio <= 0) {
      return failure('invalid', 'CONSTRAINT_VIOLATION', 'Logarithm requires a positive ratio.');
    }
    const value = request.operator === 'exp' ? Math.exp(ratio) : Math.log(ratio);
    return scalar(value, [left], request.operator === 'exp' && value === 0);
  }
  if (request.operator === 'power' || request.operator === 'root') {
    if (
      !Number.isSafeInteger(request.exponent) ||
      Math.abs(request.exponent) > unitLimits.exponentMagnitude ||
      (request.operator === 'root' && request.exponent === 0)
    ) {
      return failure('invalid', 'RESOURCE_LIMIT', 'Exponent is outside the supported range.');
    }
    if (left.space !== 'linear') {
      return failure('invalid', 'SPACE_MISMATCH', 'Power/root requires a linear quantity.');
    }
    if (request.operator === 'root' && left.value < 0 && Math.abs(request.exponent) % 2 === 0) {
      return failure('invalid', 'CONSTRAINT_VIOLATION', 'An even real root requires a non-negative value.');
    }
    const factor = request.operator === 'root' ? 1 / request.exponent : request.exponent;
    const value = request.operator === 'root' && left.value < 0 ? -((-left.value) ** factor) : left.value ** factor;
    return derived({
      operator: request.operator,
      left,
      exponent: request.exponent,
      value,
      dimension: mapDimension(left.unit.dimension, factor),
      scale: left.unit.scale ** factor,
    });
  }
  if (!('right' in request)) {
    return failure('invalid', 'METADATA_CONFLICT', 'Operation request is incomplete.');
  }
  const rightValid = validateExecutableQuantity(request.right);
  if (rightValid.status !== 'success') {
    return rightValid;
  }
  const right = rightValid.value;

  if (request.operator === 'multiply' || request.operator === 'divide') {
    if (left.space !== 'linear' || right.space !== 'linear') {
      return failure('invalid', 'SPACE_MISMATCH', 'Multiply/divide requires linear quantities.');
    }
    if (request.operator === 'divide' && right.value === 0) {
      return failure('invalid', 'CONSTRAINT_VIOLATION', 'Division by zero is invalid.');
    }
    const divide = request.operator === 'divide';
    return derived({
      operator: request.operator,
      left,
      right,
      value: divide ? left.value / right.value : left.value * right.value,
      dimension: combineDimension(left.unit.dimension, right.unit.dimension, divide ? -1 : 1),
      scale: divide ? left.unit.scale / right.unit.scale : left.unit.scale * right.unit.scale,
    });
  }

  if (request.operator === 'subtract' && left.space === 'point' && right.space === 'point') {
    const aligned = align(left, right);
    if (aligned.status !== 'success') {
      return aligned;
    }
    const numeric = checkedNumber(left.value - aligned.value.right.value, resultRepresentation(left, right), false);
    if (numeric.status !== 'success') {
      return numeric;
    }
    return validateQuantity(
      Object.freeze({
        ...left,
        value: numeric.value,
        representation: resultRepresentation(left, right),
        kind: quantityKinds.temperatureDifference,
        space: 'difference',
        reference: undefined,
        assumptions: mergeAssumptions(left, right),
      }),
    );
  }
  if (
    (request.operator === 'add' || request.operator === 'subtract') &&
    left.space === 'point' &&
    right.space === 'difference'
  ) {
    const aligned = align(left, right, 'point-difference');
    if (aligned.status !== 'success') {
      return aligned;
    }
    const value =
      request.operator === 'add' ? left.value + aligned.value.right.value : left.value - aligned.value.right.value;
    return withValue({
      quantity: left,
      value,
      operands: [left, right],
      kind: left.kind ?? aligned.value.kind,
    });
  }
  if (request.operator === 'add' && left.space === 'difference' && right.space === 'point') {
    return checkOperation({ operator: 'add', left: right, right: left });
  }

  const aligned = align(left, right);
  if (aligned.status !== 'success') {
    return aligned;
  }
  const rightValue = aligned.value.right.value;
  if (request.operator === 'compare') {
    return scalar(left.value < rightValue ? -1 : left.value > rightValue ? 1 : 0, [left, right]);
  }
  if (request.operator === 'min' || request.operator === 'max') {
    const value = request.operator === 'min' ? Math.min(left.value, rightValue) : Math.max(left.value, rightValue);
    return withValue({ quantity: left, value, operands: [left, right], kind: aligned.value.kind });
  }
  if (request.operator === 'clamp') {
    const upperValid = validateExecutableQuantity(request.upper);
    if (upperValid.status !== 'success') {
      return upperValid;
    }
    const upper = align(left, upperValid.value);
    if (upper.status !== 'success') {
      return upper;
    }
    if (rightValue > upper.value.right.value) {
      return failure('invalid', 'CONSTRAINT_VIOLATION', 'Clamp lower bound exceeds its upper bound.');
    }
    const kind = compatibleKind(aligned.value.kind, upper.value.kind);
    if (!kind) {
      return failure('invalid', 'KIND_MISMATCH', 'Clamp operands do not share one reviewed compatible kind.');
    }
    return withValue({
      quantity: left,
      value: Math.min(Math.max(left.value, rightValue), upper.value.right.value),
      operands: [left, right, upperValid.value],
      kind,
    });
  }
  if (left.space === 'point') {
    return failure('invalid', 'SPACE_MISMATCH', 'Point addition is invalid.');
  }
  const value = request.operator === 'add' ? left.value + rightValue : left.value - rightValue;
  const numeric = checkedNumber(value, resultRepresentation(left, right), false);
  if (numeric.status !== 'success') {
    return numeric;
  }
  return validateQuantity(
    Object.freeze({
      ...left,
      value: numeric.value,
      representation: resultRepresentation(left, right),
      kind: aligned.value.kind,
      assumptions: mergeAssumptions(left, right),
    }),
  );
}

/**
 * Convert a supported temperature point to its absolute linear basis.
 * @param quantity - Point quantity to validate and linearize.
 * @returns A linear absolute quantity or a structured diagnostic.
 * @public
 */
export function linearize(quantity: Quantity): UnitResult<Quantity> {
  const valid = validateExecutableQuantity(quantity);
  if (valid.status !== 'success') {
    return valid;
  }
  if (valid.value.space !== 'point') {
    return failure('invalid', 'SPACE_MISMATCH', 'Only points can be linearized.');
  }
  const result = convert({ quantity: valid.value, to: 'K' });
  return result.status === 'success'
    ? validateQuantity(Object.freeze({ ...result.value, space: 'linear', reference: undefined }))
    : result;
}
