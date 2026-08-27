import { describe, expect, it } from 'vitest';
import type { ProjectLocator } from '@taucad/filesystem';
import type { Workspace } from '#filesystem/handle-store.js';
import {
  exampleUrl,
  projectChatIdFromSearch,
  projectChatUrl,
  projectPreviewUrl,
  projectSlugsOf,
  projectUrl,
  projectUrlOr,
} from '#utils/project-url.utils.js';

const workspaceRow: Workspace = {
  workspaceId: 'wsp_live',
  name: 'Tau Workspace',
  lastConnectedAt: 1,
  slug: 'tau-workspace',
};

const webaccessLocator: ProjectLocator = {
  backend: 'webaccess',
  storageRootKey: 'webaccess:wsp_live',
  relativeDirectory: '/gearbox',
  workspaceId: 'wsp_live',
};

describe('project URL grammar', () => {
  it('builds the canonical `/w/` URL with both segments encoded', () => {
    expect(projectUrl({ workspaceSlug: 'my ws', projectSlug: 'a/b' })).toBe('/w/my%20ws/a%2Fb');
    expect(projectPreviewUrl({ workspaceSlug: 'ws', projectSlug: 'p' })).toBe('/w/ws/p/preview');
  });

  it('adds an encoded chat selection without changing the canonical project path', () => {
    const slugs = { workspaceSlug: 'my ws', projectSlug: 'a/b' };

    expect(projectChatUrl(slugs)).toBe(projectUrl(slugs));
    expect(projectChatUrl(slugs, '')).toBe(projectUrl(slugs));
    expect(projectChatUrl(slugs, 'chat /+?&')).toBe('/w/my%20ws/a%2Fb?chat=chat+%2F%2B%3F%26');
  });

  it('parses a non-empty chat selection from strings and URLSearchParams', () => {
    expect(projectChatIdFromSearch('?chat=chat+%2F%2B%3F%26')).toBe('chat /+?&');
    expect(projectChatIdFromSearch(new URLSearchParams({ chat: 'chat_42' }))).toBe('chat_42');
    expect(projectChatIdFromSearch('?other=value')).toBeUndefined();
    expect(projectChatIdFromSearch('?chat=')).toBeUndefined();
  });

  it('falls back to the library instead of an id-addressed URL', () => {
    expect(projectUrlOr(undefined)).toBe('/projects');
  });

  it('derives slugs from a discovered locator', () => {
    expect(projectSlugsOf(webaccessLocator, [workspaceRow])).toEqual({
      workspaceSlug: 'tau-workspace',
      projectSlug: 'gearbox',
    });
  });

  it('uses Home for every built-in engine', () => {
    expect(projectSlugsOf({ backend: 'opfs', storageRootKey: 'opfs', relativeDirectory: '/vase' }, [])).toEqual({
      workspaceSlug: 'home',
      projectSlug: 'vase',
    });
    expect(
      projectSlugsOf({ backend: 'indexeddb', storageRootKey: 'indexeddb', relativeDirectory: '/gear' }, []),
    ).toEqual({ workspaceSlug: 'home', projectSlug: 'gear' });
  });

  it('has no slugs when the owning workspace row is unknown', () => {
    expect(projectSlugsOf(webaccessLocator, [])).toBeUndefined();
  });

  it('namespaces static examples away from the project id space', () => {
    expect(exampleUrl('proj_hollow_box')).toBe('/examples/proj_hollow_box');
  });
});
