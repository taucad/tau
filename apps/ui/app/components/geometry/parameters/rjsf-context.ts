import { createContext, useContext } from 'react';
import type { LengthSymbol } from '#constants/length-units.js';
import type { CurrentFileParameterEntry } from '@taucad/types';
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
  parameterBindings?: CurrentFileParameterEntry['groups'][string]['bindings'];
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
