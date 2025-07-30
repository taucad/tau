import { useSWEffect } from '@remix-pwa/sw';
import { useEffect, useRef } from 'react';
import { useNetworkConnectivity } from '#hooks/use-network-connectivity.js';
import { toast } from '#components/ui/sonner.js';

const networkStatusCookie = 'network-status';
const networkStatusToastId = 'network-connectivity';

export const useServiceWorker = (): { isOnline: boolean } => {
  // Configure the service worker for PWA
  useSWEffect();

  // Debounce the network status to avoid spamming toast notifications
  const previousStatus = useRef<boolean | undefined>(null);

  useEffect(() => {
    // Initialize previousStatus from localStorage
    const storedStatus = localStorage.getItem(networkStatusCookie);
    previousStatus.current = storedStatus === 'true';
  }, []);

  const isOnline = useNetworkConnectivity({
    onOnline() {
      if (previousStatus.current !== true) {
        const title = 'You are back online';
        const description = 'Seemed your network went for a nap, glad to have you back!';

        toast.success(title, { id: networkStatusToastId, description });
      }

      previousStatus.current = true;
      localStorage.setItem(networkStatusCookie, 'true');
    },

    onOffline() {
      if (previousStatus.current !== false) {
        const title = 'You are offline';
        const description = 'Seems like you are offline, check your network connection';

        toast.warning(title, { id: networkStatusToastId, description });
      }

      previousStatus.current = false;
      localStorage.setItem(networkStatusCookie, 'false');
    },
  });

  return { isOnline };
};
