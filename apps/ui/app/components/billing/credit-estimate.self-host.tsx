import { useCallback } from 'react';

export const modelTiers = ['Fast', 'Balanced', 'Frontier'] as const;
export type ModelTier = (typeof modelTiers)[number];
export type CreditAffordance = { readonly credits: string; readonly turns: number | undefined };

export const modelTier = (outputCostPerMillion: number): ModelTier => {
  if (outputCostPerMillion < 8) {
    return 'Fast';
  }
  return outputCostPerMillion <= 15 ? 'Balanced' : 'Frontier';
};

export const useCreditAffordance = (): ((modelId: string) => CreditAffordance | undefined) =>
  useCallback(() => undefined, []);

export function CreditBalanceChip(): React.JSX.Element | undefined {
  return undefined;
}
