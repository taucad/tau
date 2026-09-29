/**
 * `/projects` — the project library (blueprint L3). It used to redirect to `/`
 * and host the library one level down under a `library` child; the page grammar
 * collapsed onto this route and `/projects/new` is the only child left.
 */
import { Outlet, useLocation } from 'react-router';
import type { MetaFunction } from 'react-router';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import type { Handle } from '#types/matches.types.js';

export const meta: MetaFunction = () => [{ title: 'Projects · Tau' }];

export const handle: Handle = {
  enableOverflowY: true,
};

export default function Projects(): React.JSX.Element {
  const location = useLocation();
  if (location.pathname !== '/projects') {
    return <Outlet />;
  }
  /* One list (D20): the library lists this account's Tau Cloud projects beside
     this device's own, so there is no second *From Tau Cloud* section. */
  return <ProjectLibrary />;
}
