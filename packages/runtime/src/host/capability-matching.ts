/** Finite scalar advertised by a host capability vocabulary. @public */
export type HostCapabilityValue = boolean | number | string;

/** Requirement supported by host-owned capability matching. @public */
export type HostCapabilityRequirement<Value extends HostCapabilityValue = HostCapabilityValue> =
  | Readonly<{ key: string; condition: 'equals'; value: Value }>
  | Readonly<{ key: string; condition: 'one-of'; values: readonly Value[] }>
  | Readonly<{ key: string; condition: 'at-least'; value: number }>;

/** Result of matching requirements against one host advertisement. @public */
export type HostCapabilityMatch<Requirement extends HostCapabilityRequirement = HostCapabilityRequirement> =
  | Readonly<{ matched: true }>
  | Readonly<{ matched: false; requirement: Requirement }>;

/** Named input for pure host-capability matching; scheduler slot accounting is deliberately absent. @public */
export type MatchHostCapabilitiesInput<
  Value extends HostCapabilityValue = HostCapabilityValue,
  Requirement extends HostCapabilityRequirement<Value> = HostCapabilityRequirement<Value>,
> = Readonly<{
  capabilities: Readonly<Record<string, Value>>;
  requirements: readonly Requirement[];
}>;

const finiteScalar = (value: unknown): value is HostCapabilityValue =>
  typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/**
 * Match typed requirements against descriptive host scalar capabilities.
 * @param input - Host scalar advertisement and provider requirements.
 * @returns Success or the first unsatisfied/invalid requirement.
 * @public
 */
export const matchHostCapabilities = <Requirement extends HostCapabilityRequirement>(
  input: MatchHostCapabilitiesInput<HostCapabilityValue, Requirement>,
): HostCapabilityMatch<Requirement> => {
  for (const requirement of input.requirements) {
    if (!Object.hasOwn(input.capabilities, requirement.key)) {
      return { matched: false, requirement };
    }
    const actual = input.capabilities[requirement.key];
    if (!finiteScalar(actual)) {
      return { matched: false, requirement };
    }
    if (requirement.condition === 'equals' && actual !== requirement.value) {
      return { matched: false, requirement };
    }
    if (
      requirement.condition === 'one-of' &&
      (requirement.values.length === 0 ||
        requirement.values.some((value) => !finiteScalar(value)) ||
        !requirement.values.some((value) => value === actual))
    ) {
      return { matched: false, requirement };
    }
    if (
      requirement.condition === 'at-least' &&
      (!Number.isFinite(requirement.value) || typeof actual !== 'number' || actual < requirement.value)
    ) {
      return { matched: false, requirement };
    }
    if (!['equals', 'one-of', 'at-least'].includes(requirement.condition)) {
      return { matched: false, requirement };
    }
  }
  return { matched: true };
};
