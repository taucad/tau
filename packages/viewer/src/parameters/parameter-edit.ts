import type { ParameterSetRequestBase } from '@taucad/parameters';
import type { JSONValue } from '@taucad/types';

declare const fieldBaseBrand: unique symbol;

/**
 * The value one edit of a field was made from, as its row's own-edit lineage stands on it: the row's
 * own last sent value while the rendered authority still echoes its edits, else that authority value.
 * Only `useFieldEdits` produces one, so no row can send a base built from the value it rendered alone,
 * which the form's deferred projection can show late.
 * @public
 */
export type FieldBase<Value extends JSONValue = JSONValue> = ParameterSetRequestBase &
  Readonly<{ value: Value; [fieldBaseBrand]: true }>;

/**
 * One row's in-progress edit, retained here so it survives the row unmounting (collapse, expand,
 * search) and so a close or rename can refuse to discard it silently.
 * @public
 */
export type ParameterDraft = Readonly<{
  /** Exactly what the person typed. */
  text: string;
  /** Whether that text parses and admits; an invalid draft cannot be entered. */
  valid: boolean;
  /** The service owns final settlement; rejected text remains separate from the authority value. */
  final?:
    | Readonly<{ status: 'pending'; requestId: string; base: ParameterSetRequestBase }>
    | Readonly<{ status: 'refused'; requestId: string; base: ParameterSetRequestBase; message: string }>;
}>;

/**
 * One field edit; only a final with an explicit base may retain widget-formatted recovery text.
 *
 * @public
 */
export type ParameterValueEdit = Readonly<{ pointer: string; value: JSONValue }> &
  (
    | Readonly<{ pressure?: 'final'; base: ParameterSetRequestBase; draft: Pick<ParameterDraft, 'text' | 'valid'> }>
    | Readonly<{ pressure?: 'final'; base?: ParameterSetRequestBase; draft?: never }>
    | Readonly<{ pressure: 'transient'; base?: ParameterSetRequestBase; draft?: never }>
  );

/**
 * One field edit a row sends through its {@link ParameterCommit}: its base comes from the row's own-edit
 * lineage, never from the value it rendered.
 *
 * @public
 */
export type FieldValueEdit = ParameterValueEdit & Readonly<{ base?: FieldBase }>;
