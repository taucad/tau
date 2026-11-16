/**
 * Layout-affecting flags, kept as a client fact (loading-states blueprint H2; progressive loading P2).
 *
 * A flag marked `affectsLayout` in the registry decides first-paint geometry. No surface reads one at present: the
 * first, Home's suggestions row, was removed. Its value comes from PostHog after hydration, so the client keeps each
 * such flag's last settled value in the client-facts record (`#lib/client-facts`), which the page reads before PostHog
 * answers. The server reads none of it: the document renders a flagged surface's box empty while its value is unknown.
 */

import type { LayoutFlagName } from '#flags/flag.constants.js';
import { readClientFacts, writeClientFacts } from '#lib/client-facts.js';

/** The settled values of the layout-affecting flags, by registry name. A flag not yet settled is absent. */
export type LayoutFlagValues = Readonly<Partial<Record<LayoutFlagName, boolean>>>;

/**
 * The layout flags this device last settled.
 *
 * @returns The remembered values; empty when none has settled here.
 */
export const readRememberedLayoutFlags = (): LayoutFlagValues => readClientFacts().layoutFlags ?? {};

/**
 * Remember settled layout flags. A flag that is not settled keeps its remembered value; the record is written only
 * when a value changes.
 *
 * @param settled - The settled layout flags.
 */
export const rememberLayoutFlags = (settled: LayoutFlagValues): void => {
  const current = readRememberedLayoutFlags();
  const next = { ...current, ...settled };
  if (Object.entries(next).some(([name, value]) => current[name as LayoutFlagName] !== value)) {
    writeClientFacts({ layoutFlags: next });
  }
};
