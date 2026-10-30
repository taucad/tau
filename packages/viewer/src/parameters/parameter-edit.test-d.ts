import { expectTypeOf } from 'vitest';
import type { FieldBase } from '#parameters/parameter-edit.js';
import type { ParameterCommit } from '#parameters/rjsf-context.js';
import type { FieldEdits } from '#parameters/use-field-edits.js';

/*
 * A row's base comes from its own-edit lineage, never from the value it rendered: the form renders the
 * record late, so a base built from that value can name the row's own superseded write.
 */
declare const commit: ParameterCommit;
declare const lineage: FieldEdits<number>;

// @ts-expect-error -- a base built from a rendered value is refused
void commit.setValue({ pointer: '/width', value: 2, base: { pointer: '/width', value: 1 } });
// @ts-expect-error -- a base built from a rendered value is refused
void commit.commit({ pointer: '/width', value: 2, base: { pointer: '/width', value: 1 } });

void commit.setValue({ pointer: '/width', value: 2, base: lineage.base });
void commit.commit({ pointer: '/width', value: 2, base: lineage.base });
expectTypeOf(lineage.base).toExtend<FieldBase<number>>();
