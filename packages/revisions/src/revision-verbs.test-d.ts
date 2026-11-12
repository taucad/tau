/**
 * A row's who is typed, never a string (blueprint B2, I7).
 *
 * No surface can read `row.actor` as a string, because the row has no `actor`;
 * its `who` is a recorded identity or a commit's git author, and neither arm is
 * a string to print as is. `trigger` is `capture`, as the trailer names it.
 */

import { expectTypeOf } from 'vitest';

import type { RevisionIdentity, RevisionTrigger } from '#revision-authority.js';
import type { RevisionRow, RevisionRowWho } from '#revision-verbs.js';

expectTypeOf<RevisionRow>().not.toHaveProperty('actor');
expectTypeOf<RevisionRow>().not.toHaveProperty('trigger');
expectTypeOf<RevisionRow['who']>().toEqualTypeOf<RevisionRowWho>();
expectTypeOf<string>().not.toExtend<RevisionRow['who']>();
expectTypeOf<Extract<RevisionRowWho, { kind: 'recorded' }>['identity']>().toEqualTypeOf<RevisionIdentity>();
expectTypeOf<Extract<RevisionRowWho, { kind: 'unrecorded' }>>().not.toHaveProperty('identity');
expectTypeOf<NonNullable<RevisionRow['capture']>>().toEqualTypeOf<RevisionTrigger>();
