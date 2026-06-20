/** First numeric `<name> = literal;` line from extracted OpenSCAD parameters. */
export type NumericScadSlice = Readonly<{ name: string; defaultValue: number }>;

/**
 * Decide the next Electron example `{ name, value }` override applied on top of SCAD source.
 *
 * Preserve a user-adjusted slider when the extracted kernel default did not move; refresh
 * the override when the declared literal in source changes (`3`→`300`) so the UI matches
 * the source default again.
 */

export function resolveElectronNumericParameterOverride(
  numeric: NumericScadSlice | undefined,
  previousOverride: { name: string; value: number } | undefined,
  lastKernelNumeric: { name: string; value: number } | undefined,
): { name: string; value: number } | undefined {
  if (!numeric) {
    return undefined;
  }

  const { name, defaultValue: numericDefault } = numeric;

  const identityChanged = lastKernelNumeric !== undefined && lastKernelNumeric.name !== name;

  const kernelDefaultMoved =
    lastKernelNumeric !== undefined && lastKernelNumeric.name === name && lastKernelNumeric.value !== numericDefault;

  if (identityChanged || kernelDefaultMoved) {
    return { name, value: numericDefault };
  }

  if (previousOverride?.name === name) {
    return previousOverride;
  }

  return { name, value: numericDefault };
}
