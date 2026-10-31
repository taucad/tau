import { describe, expect, it } from 'vitest';
import { resolveProjectRoute } from '#hooks/use-project-slug-route.js';

const projects: Parameters<typeof resolveProjectRoute>[0] = [
  {
    id: 'proj_home',
    locator: { backend: 'opfs', storageRootKey: 'opfs', relativeDirectory: '/gear' },
    slugs: { workspaceSlug: 'home', projectSlug: 'gear' },
  },
  {
    id: 'proj_disk',
    locator: {
      backend: 'webaccess',
      storageRootKey: 'webaccess:wsp_disk',
      relativeDirectory: '/bracket',
      workspaceId: 'wsp_disk',
    },
    slugs: { workspaceSlug: 'my-workspace', projectSlug: 'bracket' },
  },
];

describe('resolveProjectRoute', () => {
  it('resolves case-insensitive slug segments', () => {
    expect(resolveProjectRoute(projects, 'HOME', 'Gear')).toBe('proj_home');
  });

  it('resolves workspace and project id segments independently', () => {
    expect(resolveProjectRoute(projects, 'wsp_disk', 'bracket')).toBe('proj_disk');
    expect(resolveProjectRoute(projects, 'my-workspace', 'proj_disk')).toBe('proj_disk');
    expect(resolveProjectRoute(projects, 'wsp_disk', 'proj_disk')).toBe('proj_disk');
  });

  it('does not let an id bypass the other segment', () => {
    expect(resolveProjectRoute(projects, 'home', 'proj_disk')).toBeUndefined();
    expect(resolveProjectRoute(projects, 'wsp_disk', 'proj_home')).toBeUndefined();
  });

  it('should reject colliding folded slugs regardless of listing order', () => {
    const colliding: Parameters<typeof resolveProjectRoute>[0] = [
      ...projects,
      {
        id: 'proj_other',
        locator: { backend: 'opfs', storageRootKey: 'opfs', relativeDirectory: '/Gear' },
        slugs: { workspaceSlug: 'HOME', projectSlug: 'Gear' },
      },
    ];

    expect(resolveProjectRoute(colliding, 'home', 'gear')).toBeUndefined();
    expect(resolveProjectRoute(colliding.toReversed(), 'home', 'gear')).toBeUndefined();
    expect(resolveProjectRoute(colliding, 'home', 'proj_home')).toBe('proj_home');
    expect(resolveProjectRoute(colliding, 'home', 'proj_other')).toBe('proj_other');
  });

  it('should distinguish identical project slugs by durable workspace identity', () => {
    const colliding: Parameters<typeof resolveProjectRoute>[0] = [
      ...projects,
      {
        id: 'proj_second_disk',
        locator: {
          backend: 'webaccess',
          storageRootKey: 'webaccess:wsp_second_disk',
          relativeDirectory: '/bracket',
          workspaceId: 'wsp_second_disk',
        },
        slugs: { workspaceSlug: 'my-workspace', projectSlug: 'bracket' },
      },
    ];

    expect(resolveProjectRoute(colliding, 'my-workspace', 'bracket')).toBeUndefined();
    expect(resolveProjectRoute(colliding.toReversed(), 'my-workspace', 'bracket')).toBeUndefined();
    expect(resolveProjectRoute(colliding, 'wsp_disk', 'bracket')).toBe('proj_disk');
    expect(resolveProjectRoute(colliding, 'wsp_second_disk', 'bracket')).toBe('proj_second_disk');
  });

  it.each(['opfs', 'OPFS', 'indexeddb', 'IndexedDB'])('rejects the %s tombstone', (slug) => {
    expect(resolveProjectRoute(projects, slug, 'proj_home')).toBeUndefined();
  });
});
