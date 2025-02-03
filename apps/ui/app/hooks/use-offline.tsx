import { useNetworkConnectivity, usePWAManager } from '@remix-pwa/client';
import { useSWEffect } from '@remix-pwa/sw';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(globalThis?.navigator?.onLine ?? true);
  // Configure the service worker for PWA
  useSWEffect();

  useNetworkConnectivity({
    onOnline: () => {
      const id = 'network-connectivity';
      const title = 'You are back online';
      const description = 'Seemed your network went for a nap, glad to have you back!';
      const type = 'success';

      toast[type](title, { id, description });
    },

    onOffline: () => {
      const id = 'network-connectivity';
      const title = 'You are offline';
      const description = 'Seems like you are offline, check your network connection';
      const type = 'warning';

      toast[type](title, { id, description });
    },
  });

  const manager = usePWAManager();

  useEffect(() => {
    globalThis.addEventListener('online', () => {
      setIsOnline(true);
    });
    globalThis.addEventListener('offline', () => {
      setIsOnline(false);
    });
  }, []);

  return { isOnline, manager };
};
