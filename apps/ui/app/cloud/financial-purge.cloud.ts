import { useCallback } from 'react';
import { useOptionalFinancialSession } from '@taucad/billing-ui/providers/financial-session-provider';

export const useCloudFinancialPurge = (): ((reason: 'logout' | 'owner_changed') => void) => {
  const session = useOptionalFinancialSession();
  return useCallback((reason: 'logout' | 'owner_changed') => session?.purge(reason), [session]);
};
