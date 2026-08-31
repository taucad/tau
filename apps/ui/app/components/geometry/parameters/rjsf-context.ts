import { createContext, useContext } from 'react';
import type { LengthSymbol } from '@taucad/units';
import type { MeasurementDescriptor } from '#constants/project-parameters.js';

export type Units = {
  length: {
    sourceSymbol: LengthSymbol;
    displaySymbol: LengthSymbol;
  };
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for formContext
export type RJSFContext = {
  idPrefix: string;
  rootPresentation: 'catalog' | 'embedded';
  searchTerm: string;
  allExpanded: boolean;
  resetSingleParameter: (fieldPath: string[]) => void;
  shouldShowField: (prettyLabel: string) => boolean;
  defaultParameters?: Record<string, unknown>;
  units: Units;
  displayDescriptors?: Readonly<Record<string, { descriptor: MeasurementDescriptor; unit?: string }>>;
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
