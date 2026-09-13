/** The Standard Schema interface. */
export type StandardSchemaV1<Input = unknown, Output = Input> = {
  /** The Standard Schema properties. */
  readonly '~standard': StandardSchemaV1Props<Input, Output>;
};

/** The Standard Schema properties interface. */
export type StandardSchemaV1Props<Input = unknown, Output = Input> = {
  /** The version number of the standard. */
  readonly version: 1;
  /** The vendor name of the schema library. */
  readonly vendor: string;
  /** Validates unknown input values. */
  readonly validate: (value: unknown) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
  /** Inferred types associated with the schema. */
  readonly types?: StandardSchemaV1Types<Input, Output> | undefined;
};

/** The result interface of the validate function. */
export type StandardSchemaV1Result<Output> = StandardSchemaV1SuccessResult<Output> | StandardSchemaV1FailureResult;

/** The result interface if validation succeeds. */
export type StandardSchemaV1SuccessResult<Output> = {
  /** The typed output value. */
  readonly value: Output;
  /** The non-existent issues. */
  readonly issues?: undefined;
};

/** The result interface if validation fails. */
export type StandardSchemaV1FailureResult = {
  /** The issues of failed validation. */
  readonly issues: readonly StandardSchemaV1Issue[];
};

/** The issue interface of the failure output. */
export type StandardSchemaV1Issue = {
  /** The error message of the issue. */
  readonly message: string;
  /** The path of the issue, if any. */
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined;
};

/** The path segment interface of the issue. */
export type StandardSchemaV1PathSegment = {
  /** The key representing a path segment. */
  readonly key: PropertyKey;
};

/** The Standard Schema types interface. */
export type StandardSchemaV1Types<Input = unknown, Output = Input> = {
  /** The input type of the schema. */
  readonly input: Input;
  /** The output type of the schema. */
  readonly output: Output;
};

/** Infers the input type of a Standard Schema. */
export type StandardSchemaV1InferInput<Schema extends StandardSchemaV1> = NonNullable<
  Schema['~standard']['types']
>['input'];

/** Infers the output type of a Standard Schema. */
export type StandardSchemaV1InferOutput<Schema extends StandardSchemaV1> = NonNullable<
  Schema['~standard']['types']
>['output'];
