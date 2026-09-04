import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { billingQueryClient } from '#hooks/query-client.js';

const settlementLag = 3000;

export const confirmTopupSettlement = (): void => {
  void billingQueryClient.invalidateQueries({ queryKey: ['billing'] });
  setTimeout(() => void billingQueryClient.invalidateQueries({ queryKey: ['billing'] }), settlementLag);
};

export const useTopupReturn = ({ onPaymentReceived }: { readonly onPaymentReceived: () => void }): void => {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (searchParameters.get('topup') !== 'success' || handledRef.current) {
      return;
    }
    handledRef.current = true;
    setSearchParameters(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('topup');
        return next;
      },
      { replace: true },
    );
    onPaymentReceived();
    confirmTopupSettlement();
  }, [onPaymentReceived, searchParameters, setSearchParameters]);
};
