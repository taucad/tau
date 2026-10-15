/** Public identity and display name only; never connection addresses or credentials. */
export type StreamingMachine = { readonly hostId: string; readonly machineId: string; readonly name: string };
/** A force decision belongs to one assessment on one utility lifetime. */
export type MachineQuitDecision = { readonly attemptId: string; readonly forceMachines: boolean };
/** Validate the utility boundary without turning malformed evidence into an empty set. */
export const isStreamingMachines = (value: unknown): value is readonly StreamingMachine[] =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      'hostId' in item &&
      typeof item.hostId === 'string' &&
      item.hostId.length > 0 &&
      'machineId' in item &&
      typeof item.machineId === 'string' &&
      item.machineId.length > 0 &&
      'name' in item &&
      typeof item.name === 'string',
  );
