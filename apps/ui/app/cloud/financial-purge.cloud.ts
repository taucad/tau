import { useCallback } from 'react';
import { useOptionalFinancialSession } from '#providers/financial-session-provider.js';

export const useCloudFinancialPurge = (): ((reason: 'logout' | 'owner_changed') => void) => {
  const session = useOptionalFinancialSession();
  return useCallback((reason: 'logout' | 'owner_changed') => session?.purge(reason), [session]);
};
