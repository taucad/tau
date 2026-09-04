import type { LinkDescriptor } from 'react-router';
import { isDesktopTarget } from '#lib/build-target.js';

/**
 * `<link rel="manifest">` descriptors for the document head.
 *
 * Lives here rather than in `routes/manifest[.webmanifest].ts` because the
 * desktop SPA build excludes that route module: importing it from `root.tsx`
 * would drag the route's server `loader` into the client graph un-stripped
 * (React Router only removes server exports from modules it knows are routes).
 *
 * Empty on desktop for the same reason — the route is gone, so the link would
 * be a guaranteed 404 on every launch. An `app://tau` window is not
 * installable anyway.
 */
export const webManifestLinks: LinkDescriptor[] = isDesktopTarget()
  ? []
  : [{ rel: 'manifest', href: '/manifest.webmanifest' }];
