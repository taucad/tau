/**
 * How a person reached setup, carried on `/welcome` so `onboarding_setup_opened` can say. An address
 * without it, such as a typed URL, counts as Help.
 */
import type { SetupEntry } from '#telemetry/onboarding-telemetry.js';

/** The search parameter that carries the entry. */
export const setupEntryParameter = 'entry';

const setupEntries: readonly SetupEntry[] = ['signup', 'first_launch', 'invite', 'help', 'palette'];

/**
 * The entry a `/welcome` address names.
 *
 * @param value - The parameter's value.
 * @returns The entry; Help when absent or unknown.
 */
export const parseSetupEntry = (value: string | undefined): SetupEntry =>
  setupEntries.find((entry) => entry === value) ?? 'help';

/**
 * The address that opens setup from an entry, at a step when given.
 *
 * @param entry - How setup is reached.
 * @param step - The step to open at.
 * @returns The address.
 */
export const setupHref = (entry: SetupEntry, step?: 'how'): string =>
  step === undefined
    ? `/welcome?${setupEntryParameter}=${entry}`
    : `/welcome?${setupEntryParameter}=${entry}&step=${step}`;
