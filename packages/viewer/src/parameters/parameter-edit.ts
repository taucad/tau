import type { ParameterSetRequestBase } from '@taucad/parameters';
import type { JSONValue } from '@taucad/types';

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
