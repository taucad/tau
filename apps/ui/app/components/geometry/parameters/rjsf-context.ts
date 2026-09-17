import { createContext, useContext } from 'react';
import type { LengthSymbol } from '#constants/length-units.js';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import type { ParameterManifest, ParameterSetTarget } from '@taucad/parameters';
import type { ParameterInputRequest, RetainedParameterInput } from '#services/parameter-set-service.js';

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
 * and no revision: those live in the actors, so an edit to one field cannot invalidate every row.
 */
export type ParameterCommit = Readonly<{
  target: ParameterSetTarget;
  group: string;
  editorInstance: string;
  input(input: ParameterInputRequest): RetainedParameterInput;
  /** Commit one field of the active group; non-numeric widgets never rewrite the whole group. */
  setValue(field: Readonly<{ pointer: string; value: JSONValue }>): Promise<void>;
  /**
   * Show one field's in-flight drag value without persisting it (D2). Absent when the active kernel
   * did not declare that it can serve the drag lane, in which case the row previews the value alone
   * and the model re-renders on release.
   */
  scrub?(field: Readonly<{ pointer: string; value: JSONValue }>): void;
  /** End a drag: the released value is committed through `setValue`. */
  endScrub?(): void;
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
  parameterBindings?: FileParameterEntry['groups'][string]['bindings'];
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
