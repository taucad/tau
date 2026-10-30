import { useEffect, useMemo } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ParameterSetRequestBase } from '@taucad/parameters';
import type { ActorRefFrom } from 'xstate';
import { parameterFieldEditMachine, selectOwnValue } from '#parameters/parameter-field-edit.machine.js';
import type { ParameterFieldEditMachine, ParameterFieldScalar } from '#parameters/parameter-field-edit.machine.js';
import type { FieldBase } from '#parameters/parameter-edit.js';

/** One row's own-edit lineage and the base its next edit is made from. */
export type FieldEdits<Value extends ParameterFieldScalar> = Readonly<{
  /** Report each final the row sends (`submitted`) and how it settled (`settled`). */
  edits: ActorRefFrom<ParameterFieldEditMachine>;
  /** The row's own last sent value while the rendered authority is still an echo of its edits. */
  ownValue: Value | undefined;
  /** The base the row's next edit is made from: its own value while it leads, else the authority. */
  base: FieldBase<Value>;
}>;

/**
 * Track one row's own edits against the authority value it renders, which the form's deferred
 * projection can show late, and produce the only bases the row may send; see
 * {@link parameterFieldEditMachine}.
 *
 * @param field - The field's pointer, the authority value the row renders and its effective binding.
 * @returns The lineage actor, the row's own value while it leads and its base.
 */
export const useFieldEdits = <Value extends ParameterFieldScalar>(
  field: Readonly<{ pointer: string; authority: Value; binding?: ParameterSetRequestBase['binding'] }>,
): FieldEdits<Value> => {
  const { pointer, authority, binding } = field;
  const edits = useActorRef(parameterFieldEditMachine, { input: { authority } });
  const ownValue = useSelector(edits, (snapshot) => selectOwnValue(snapshot, authority));
  useEffect(() => {
    edits.send({ type: 'observed', value: authority });
  }, [edits, authority]);
  const value = ownValue ?? authority;
  const base = useMemo(() => {
    const minted: ParameterSetRequestBase = { pointer, value, ...(binding === undefined ? {} : { binding }) };
    // The one place a base is minted: from the lineage, never from a rendered value alone.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    return minted as FieldBase<Value>;
  }, [binding, pointer, value]);
  return { edits, ownValue, base };
};
