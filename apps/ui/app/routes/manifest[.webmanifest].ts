/* eslint-disable @typescript-eslint/naming-convention -- snake_case is expected for webmanifest */
import type { WebAppManifest } from 'web-app-manifest';
import type { LoaderFunction } from 'react-router';
import { metaConfig } from '#constants/meta.constants.js';
import { appStartUrl } from '#lib/route-classes.js';

export const loader: LoaderFunction = () => {
  return Response.json(
    {
      short_name: metaConfig.name,
      name: metaConfig.name,
      description: metaConfig.description,
      orientation: 'portrait',
      /* The app's Home, whatever the visitor's `tau-entry` preference: `/` alone opens marketing without it. The
       * service worker answers it from the Home shell, so an installed app launches offline (PL7). */
      start_url: appStartUrl,
      // A stable identity, so a later change of `start_url` updates the installed app instead of making another.
      id: '/',
      scope: '/',
      display: 'standalone',
      // @see https://developer.mozilla.org/en-US/docs/Web/Manifest/Reference/display_override
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
      },
    },
  );
};
