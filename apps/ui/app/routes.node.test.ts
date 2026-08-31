// @vitest-environment node
/**
 * Page-grammar gate (blueprint L2/L3). The flat-routes table is the only place
 * that decides which URLs exist, so the removal of the legacy `/projects/:id`
 * resolvers and the promotion of `/projects` + `/community` are pinned here
 * rather than through a rendered redirect.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const routesRoot = join(import.meta.dirname, 'routes');

/** Route directories flatRoutes turns into real URLs — those holding a `route` module. */
const routeDirectories = readdirSync(routesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => ['tsx', 'ts'].some((extension) => existsSync(join(routesRoot, name, `route.${extension}`))));

describe('page grammar', () => {
  it.each([['projects_.$id'], ['projects_.$id_.preview'], ['projects_.library'], ['projects_.community']])(
    'no longer routes %s',
    (segment) => {
      expect(routeDirectories).not.toContain(segment);
    },
  );

  it('serves the library at /projects, community at /community, and keeps /projects/new', () => {
    expect(routeDirectories).toEqual(expect.arrayContaining(['projects_', 'community', 'projects_.new']));
  });

  it('keeps the canonical project routes', () => {
    expect(routeDirectories).toEqual(
      expect.arrayContaining(['w.$workspace.$project', 'w.$workspace.$project_.preview', 's.$slug']),
    );
    expect(routeDirectories).not.toContain('examples.$id');
  });
});
