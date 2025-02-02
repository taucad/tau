import { useNetworkConnectivity } from '@remix-pwa/client';
import { useSWEffect } from '@remix-pwa/sw';
import { toast } from 'sonner';

export const useOffline = () => {
  // Configure the service worker for PWA
  useSWEffect();

  // within our `App` component
  useNetworkConnectivity({
    onOnline: () => {
      console.log('You are online');
      const id = 'network-connectivity';
      const title = 'You are back online';
      const description = 'Seemed your network went for a nap, glad to have you back!';
      const type = 'message';

      toast[type](title, { id, description });
    },

    onOffline: () => {
      console.log('You are offline');
      const id = 'network-connectivity';
      const title = 'You are offline';
      const description = 'Seems like you are offline, check your network connection';
      const type = 'warning';

      toast[type](title, { id, description });
    },
  });
};
