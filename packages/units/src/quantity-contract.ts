import type { AdmittedUnit, Dimension } from '#unit.js';

/** Evidence retained when semantics came from an inference profile. @public */
export type Assumption = Readonly<{ profile: string; rule: string; evidence: string }>;
/** Mathematical space of a quantity. @public */
export type QuantitySpace = 'linear' | 'difference' | 'point';
/** Open absolute quantity-kind URI; known behavior is limited to `quantityKinds`. @public */
export type QuantityKind = string;
/** Numeric representation carried by a quantity. @public */
export type QuantityRepresentation = 'binary64' | 'safe-integer' | 'decimal';
/** Revalidatable unit expression emitted by checked derived operations. @public */
export type UnitExpression =
  | Readonly<{ operator: 'unit'; unit: string }>
  | Readonly<{ operator: 'multiply' | 'divide'; left: UnitExpression; right: UnitExpression }>
  | Readonly<{ operator: 'power' | 'root'; operand: UnitExpression; exponent: number }>;
/** Unit metadata for a constructed or derived quantity. @public */
export type QuantityUnit =
  | AdmittedUnit
  | Readonly<{
      code: string;
      dimension: Dimension;
      classification: 'derived';
      expression: UnitExpression;
      scale: number;
      profile: AdmittedUnit['profile'];
    }>;

type QuantityMetadata = Readonly<{
  unit: QuantityUnit;
  kind?: QuantityKind;
  space: QuantitySpace;
  reference?: string;
  assumptions: readonly Assumption[];
  numericProvenance?: Readonly<{
    source: 'ucum-lhc-7.1.9';
    factor: number;
    behavior: 'binary64-rounded';
  }>;
}>;

/** Checked quantity, including preserved decimal text unsupported for execution. @public */
export type Quantity = QuantityMetadata &
  (
    | Readonly<{ value: number; representation?: 'binary64' | 'safe-integer' }>
    | Readonly<{ value: string; representation: 'decimal' }>
  );

/** Dimensionless or ordering result with retained assumptions. @public */
export type CheckedScalar = Readonly<{
  value: number;
  assumptions: readonly Assumption[];
  representation: 'binary64' | 'safe-integer';
}>;
/** Semantic admission mode. @public */
export type SemanticMode = 'default' | 'declared-only';

type CreateQuantityMetadata = Readonly<{
  unit: string;
  kind?: string;
  space: QuantitySpace;
  reference?: string;
  assumptions?: readonly Assumption[];
  semanticMode?: SemanticMode;
}>;

/** Request to construct an admitted quantity. @public */
export type CreateQuantityRequest = CreateQuantityMetadata &
  (
    | Readonly<{ value: number; representation?: 'binary64' | 'safe-integer' }>
    | Readonly<{ value: string; representation: 'decimal' }>
  );

/** Request for one checked algebra operation. @public */
export type OperationRequest =
  | Readonly<{
      operator: 'add' | 'subtract' | 'compare' | 'min' | 'max' | 'multiply' | 'divide';
      left: Quantity;
      right: Quantity;
    }>
  | Readonly<{ operator: 'clamp'; left: Quantity; right: Quantity; upper: Quantity }>
  | Readonly<{ operator: 'power' | 'root'; left: Quantity; exponent: number }>
  | Readonly<{ operator: 'sin' | 'cos' | 'tan' | 'exp' | 'log'; left: Quantity }>;

/** Request for a checked unit conversion. @public */
export type ConvertRequest = Readonly<{ quantity: Quantity; to: string }>;
