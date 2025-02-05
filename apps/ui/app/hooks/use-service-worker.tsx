import { useSWEffect } from '@remix-pwa/sw';
import { toast } from 'sonner';
import { useNetworkConnectivity } from './use-network-connectivity';
import { useEffect, useRef } from 'react';

const NETWORK_STATUS_COOKIE = 'network-status';
const NETWORK_STATUS_TOAST_ID = 'network-connectivity';

export const useServiceWorker = () => {
  // Configure the service worker for PWA
  useSWEffect();

  // Debounce the network status to avoid spamming toast notifications
  const previousStatus = useRef<boolean | null>(null);

  useEffect(() => {
    // Initialize previousStatus from localStorage
    const storedStatus = localStorage.getItem(NETWORK_STATUS_COOKIE);
    previousStatus.current = storedStatus === 'true';
  }, []);

  const isOnline = useNetworkConnectivity({
    onOnline: () => {
      if (previousStatus.current !== true) {
        const title = 'You are back online';
        const description = 'Seemed your network went for a nap, glad to have you back!';

        toast.success(title, { id: NETWORK_STATUS_TOAST_ID, description });
      }
      previousStatus.current = true;
      localStorage.setItem(NETWORK_STATUS_COOKIE, 'true');
    },

    onOffline: () => {
      if (previousStatus.current !== false) {
        const title = 'You are offline';
        const description = 'Seems like you are offline, check your network connection';

        toast.warning(title, { id: NETWORK_STATUS_TOAST_ID, description });
      }
      previousStatus.current = false;
      localStorage.setItem(NETWORK_STATUS_COOKIE, 'false');
    },
  });

  return { isOnline };
};
