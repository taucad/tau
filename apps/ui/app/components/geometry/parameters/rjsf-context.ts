import { createContext, useContext } from 'react';
import type { LengthSymbol } from '#constants/length-units.js';
import type { JSONValue, ParameterGroup } from '@taucad/types';
import type {
  ParameterManifest,
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetTarget,
} from '@taucad/parameters';
import type { ParameterDraft } from '#services/parameter-set-service.js';

export type Units = {
  length: {
    displaySymbol: LengthSymbol;
  };
};

export type RjsfFieldResetInput = {
  readonly fieldPath: readonly string[];
  readonly defaultValue: unknown;
};

/**
 * Identity-stable handle for one authoritative parameter editor. It deliberately carries no value
 * and no revision: rows read their own field, so an edit to one field cannot invalidate every row.
 */
export type ParameterCommit = Readonly<{
  target: ParameterSetTarget;
  group: string;
  editorInstance: string;
  /** The draft a row left behind when it last unmounted, if it has one. */
  draft(pointer: string): ParameterDraft | undefined;
  /** Retain or clear one row's draft; `undefined` clears it. */
  setDraft(pointer: string, draft: ParameterDraft | undefined): void;
  /** Observe drafts discarded elsewhere, such as by the unsaved-drafts dialog. */
  subscribeDrafts(listener: () => void): () => void;
  /**
   * Commit one field of the active group. `base` scopes the conflict to this field, and `transient`
   * pressure lets a newer value from the same drag displace an older queued one.
   */
  commit(
    field: Readonly<{
      pointer: string;
      value: JSONValue;
      base?: ParameterSetRequest['base'];
      pressure?: ParameterSetRequest['pressure'];
    }>,
  ): Promise<ParameterSetOutcome | undefined>;
  /** Commit one field of the active group; non-numeric widgets never rewrite the whole group. */
  setValue(field: Readonly<{ pointer: string; value: JSONValue }>): Promise<void>;
}>;

export type ParameterEdit =
  | Readonly<{ kind: 'transient' }>
  | Readonly<{ kind: 'authoritative'; commit: ParameterCommit }>;

// eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for formContext
export type RJSFContext = {
  idPrefix: string;
  rootPresentation: 'catalog' | 'embedded';
  searchTerm: string;
  allExpanded: boolean;
  resetSingleParameter: (input: RjsfFieldResetInput) => void;
  shouldShowField: (prettyLabel: string) => boolean;
  defaultParameters?: Record<string, unknown>;
  units: Units;
  parameterManifest: ParameterManifest;
  /** The stored group, whose authored units refine each field's admitted binding. */
  parameterGroup?: ParameterGroup;
  parameterEdit: ParameterEdit;
};

export type RjsfLayoutContextValue = {
  readonly embeddedDiscriminator?: string;
  readonly arrayItemAction?: {
    readonly label: string;
    readonly onRemove: () => void;
  };
  readonly objectArrayItem?: boolean;
};

export const emptyRjsfLayoutContext: RjsfLayoutContextValue = {};

export const rjsfLayoutContext = createContext<RjsfLayoutContextValue>(emptyRjsfLayoutContext);

export const useRjsfLayoutContext = (): RjsfLayoutContextValue => useContext(rjsfLayoutContext);
