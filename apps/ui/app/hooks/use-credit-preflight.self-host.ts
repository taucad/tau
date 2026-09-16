import { useCallback } from 'react';

type CreditPreflight = (routeId: string, modelName: string) => void;

export const useCreditPreflight = (): CreditPreflight => useCallback(() => undefined, []);
