// =============================================================================
// OpenCASCADE Exception -> Human-Readable Message Mapping
// =============================================================================

const ocExceptionDescriptions: ReadonlyMap<string, string> = new Map([
  ['BRepSweep_Translation', 'Sweep/extrusion failed — the sweep distance may be zero or the profile is invalid'],
  ['BRepSweep', 'Sweep operation failed — check the profile and sweep parameters'],
  ['BOPAlgo_AlertBOPNotAllowed', 'Boolean operation is not allowed for the given shapes'],
  ['BOPAlgo', 'Boolean operation failed — shapes may be invalid or non-intersecting'],
  ['BRepBuilderAPI', 'Shape construction failed — check dimensions, points, or parameters'],
  ['BRepFilletAPI', 'Fillet/chamfer operation failed — radius may be too large for the edge'],
  ['ChFiDS', 'Fillet/chamfer data error — the edge geometry may be incompatible'],
  ['Standard_ConstructionError', 'Construction failed — input geometry is degenerate or invalid'],
  ['Standard_NullObject', 'Operation received an empty or null shape'],
  ['Standard_NullValue', 'A required value is zero or null'],
  ['Standard_DimensionMismatch', 'Dimension mismatch between inputs'],
  ['Standard_DimensionError', 'Dimension error in the operation'],
  ['Standard_OutOfRange', 'A parameter is outside the valid range'],
  ['Standard_RangeError', 'A value is outside its valid range'],
  ['Standard_TypeMismatch', 'Wrong shape type for this operation'],
  ['Standard_DomainError', 'Mathematical domain error — input is outside the valid domain'],
  ['Standard_DivideByZero', 'Division by zero'],
  ['Standard_Overflow', 'Numeric overflow — value is too large'],
  ['Standard_Underflow', 'Numeric underflow — value is too small'],
  ['Standard_NumericError', 'Numeric error in computation'],
  ['Standard_ImmutableObject', 'Cannot modify an immutable object'],
  ['Standard_NoSuchObject', 'The requested object does not exist'],
  ['Standard_NotImplemented', 'This operation is not implemented'],
  ['Standard_ProgramError', 'Internal program error in the geometry kernel'],
  ['Standard_OutOfMemory', 'Out of memory — the operation requires too many resources'],
  ['StdFail_NotDone', 'Operation did not complete — the algorithm failed to produce a result'],
  ['StdFail_InfiniteSolutions', 'Infinite solutions — the problem is under-constrained'],
  ['StdFail_Undefined', 'Result is undefined for the given input'],
  ['Geom_UndefinedDerivative', 'Curve/surface derivative is undefined at this point'],
  ['Geom_UndefinedValue', 'Curve/surface value is undefined at this point'],
  ['Standard_Failure', 'The geometry kernel encountered an error'],
]);

/**
 * Formats an OpenCASCADE exception type and message into a human-readable `KernelError:` string.
 *
 * @param typeName - The C++ exception type name (e.g. `Standard_ConstructionError`)
 * @param rawMessage - The raw message from the exception's `GetMessageString()`
 * @returns A formatted error message with a descriptive prefix when the type is recognized
 * @public
 */
export function formatOcExceptionMessage(typeName: string, rawMessage: string): string {
  const candidates = [rawMessage, typeName].filter(Boolean);
  for (const candidate of candidates) {
    for (const [prefix, description] of ocExceptionDescriptions) {
      if (candidate.startsWith(prefix)) {
        const identifier = candidate;
        return `KernelError: ${description} (${identifier})`;
      }
    }
  }

  if (typeName && rawMessage) {
    return `KernelError: ${typeName}: ${rawMessage}`;
  }

  if (typeName || rawMessage) {
    return `KernelError: ${typeName || rawMessage}`;
  }

  return 'KernelError: Unknown kernel error';
}

/**
 * Error subclass thrown when a WebAssembly.Exception from OC is caught at the
 * tracing proxy boundary. Preserves the decoded OC message and the JS call
 * stack from the user code call site.
 * @public
 */
export class OcKernelError extends Error {
  public override readonly name = 'OcKernelError';
  public readonly typeName: string;
  public readonly rawMessage: string;

  /**
   * Wraps an OpenCASCADE exception into a kernel-compatible error.
   *
   * @param typeName - The C++ exception type name
   * @param rawMessage - The raw message from the OC exception
   */
  public constructor(typeName: string, rawMessage: string) {
    const formatted = formatOcExceptionMessage(typeName, rawMessage);
    super(formatted);
    this.typeName = typeName;
    this.rawMessage = rawMessage;
  }
}
