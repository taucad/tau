import type { WebAppManifest } from '@remix-pwa/dev';
import type { LinkDescriptor } from '@remix-run/node';
import { json } from '@remix-run/node';
import { metaConfig } from '@/config';

export const webManifestLinks: LinkDescriptor[] = [{ rel: 'manifest', href: '/manifest.webmanifest' }];

export const loader = () => {
  return json(
    {
      short_name: metaConfig.name,
      name: metaConfig.name,
      description: metaConfig.description,
      orientation: 'portrait',
      start_url: '/',
      display: 'standalone',
      // @see https://developer.mozilla.org/en-US/docs/Web/Manifest/Reference/display_override
      // @ts-expect-error - fullscreen and minimal-ui are available in types, but are legitimate values
      display_override: ['fullscreen', 'minimal-ui'],
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        {
          src: '/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    } satisfies WebAppManifest,
    {
      headers: {
        'Cache-Control': 'public, max-age=600',
        'Content-Type': 'application/manifest+json',
        'ngrok-skip-browser-warning': 'true',
      },
    },
  );
};
