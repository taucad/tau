import { describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { deriveProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteState, ProjectRouteStateInput } from '#routes/w.$workspace.$project/project-route-state.js';

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const otherProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const slugs = { workspaceSlug: 'rifont', projectSlug: 'planetary-gear' } as const;

const project = (id: string, entryPath = 'main.ts') =>
  projectToManifest({
    id,
    name: id,
    description: '',
    tags: [],
    assets: { main: { entryPath } },
  });

const input = (overrides: Partial<ProjectRouteStateInput> = {}): ProjectRouteStateInput => ({
  requestedProjectId: projectId,
  slugs,
  isResolvingSlugs: false,
  resolvedProjectId: projectId,
  access: { status: 'ready', project: project(projectId) },
  error: undefined,
  errorKind: undefined,
  errorProjectId: undefined,
  liveProjectIds: [projectId],
  closedReason: undefined,
  nativeKernelRequirement: undefined,
  isKernelAvailable: () => true,
  ...overrides,
});

describe('deriveProjectRouteState', () => {
  it('should return undefined away from a project route', () => {
    expect(deriveProjectRouteState(input({ requestedProjectId: undefined, slugs: undefined }))).toBeUndefined();
  });

  it('should resolve the editor when access is ready and the project is live', () => {
    expect(deriveProjectRouteState(input())).toMatchObject({ kind: 'editor', projectId });
  });

  /*
   * One row per state, so a new union member fails here until it is derived.
   * The exhaustiveness check below proves the list is complete.
   */
  const cases: ReadonlyArray<readonly [ProjectRouteState['kind'], Partial<ProjectRouteStateInput>]> = [
    ['resolving', { access: undefined }],
    ['editor', {}],
    ['closed', { liveProjectIds: [] }],
    ['trashed', { access: { status: 'trashed', project: project(projectId) } }],
    ['missing', { access: { status: 'missing' } }],
    ['conflict', { access: { status: 'conflict' } }],
    ['unavailable', { access: { status: 'unavailable' } }],
    [
      'recovering',
      {
        access: {
          status: 'recovering',
          recovery: {
            operationId: 'req_recovery',
            projectId,
            kind: 'create',
            storage: { backend: 'opfs', providerBasePath: '/pending' },
            status: 'recovering',
          },
        } satisfies ProjectRouteAccess,
      },
    ],
    [
      'recovery-failed',
      {
        access: {
          status: 'recovery-failed',
          recovery: {
            operationId: 'req_recovery',
            projectId,
            kind: 'create',
            storage: { backend: 'opfs', providerBasePath: '/pending' },
            status: 'failed',
            reason: 'filesystem-error',
          },
        } satisfies ProjectRouteAccess,
      },
    ],
    [
      'native-kernel',
      {
        nativeKernelRequirement: { kernelName: 'PicoGK', runtimeKernelId: 'picogk' },
        isKernelAvailable: () => false,
      },
    ],
    ['access-error', { error: new Error('discovery failed'), errorKind: 'access', errorProjectId: projectId }],
    ['flush-error', { error: new Error('flush failed'), errorKind: 'flush', errorProjectId: '' }],
  ];

  it.each(cases)('should derive %s', (kind, overrides) => {
    expect(deriveProjectRouteState(input(overrides))?.kind).toBe(kind);
  });

  it('should cover every state kind', () => {
    const derived = new Set(cases.map(([kind]) => kind));
    // Every member of the union, spelled out so adding one without a case fails to compile.
    const all: Record<ProjectRouteState['kind'], true> = {
      resolving: true,
      editor: true,
      closed: true,
      trashed: true,
      missing: true,
      conflict: true,
      unavailable: true,
      recovering: true,
      'recovery-failed': true,
      'native-kernel': true,
      'access-error': true,
      'flush-error': true,
    };
    expect(Object.keys(all).filter((kind) => !derived.has(kind as ProjectRouteState['kind']))).toEqual([]);
  });

  describe('precedence', () => {
    it('should prefer trashed over closed, so Reopen cannot resurrect a trashed project', () => {
      /* Deleting the open project closes its session first, so both facts are true (Finding 2). */
      const state = deriveProjectRouteState(
        input({ access: { status: 'trashed', project: project(projectId) }, liveProjectIds: [], closedReason: 'user' }),
      );
      expect(state?.kind).toBe('trashed');
    });

    it('should prefer an access error over resolving, so a failed check does not spin', () => {
      const state = deriveProjectRouteState(
        input({ access: undefined, error: new Error('nope'), errorKind: 'access', errorProjectId: projectId }),
      );
      expect(state?.kind).toBe('access-error');
    });

    it('should prefer a flush error over every project state', () => {
      const state = deriveProjectRouteState(
        input({ error: new Error('unsaved'), errorKind: 'flush', errorProjectId: '' }),
      );
      expect(state?.kind).toBe('flush-error');
    });

    it('should show the flush notice for a flush that failed on the way to another project', () => {
      /* The id is the project being navigated *to*, exactly as a failed access
       * check carries it, so only the kind can tell the two notices apart. */
      const state = deriveProjectRouteState(
        input({ error: new Error('unsaved'), errorKind: 'flush', errorProjectId: projectId }),
      );
      expect(state?.kind).toBe('flush-error');
    });

    it('should stay resolving while access belongs to the project being navigated away from', () => {
      const state = deriveProjectRouteState(
        input({ requestedProjectId: otherProjectId, resolvedProjectId: projectId }),
      );
      expect(state?.kind).toBe('resolving');
    });
  });

  describe('slug resolution', () => {
    it('should resolve while slugs are still resolving', () => {
      const state = deriveProjectRouteState(
        input({ requestedProjectId: undefined, isResolvingSlugs: true, access: undefined }),
      );
      expect(state?.kind).toBe('resolving');
    });

    it('should be missing when slugs resolve to no project', () => {
      const state = deriveProjectRouteState(
        input({ requestedProjectId: undefined, isResolvingSlugs: false, access: undefined }),
      );
      expect(state).toEqual({ kind: 'missing', slugs });
    });
  });

  describe('closed', () => {
    it('should carry the close reason the registry recorded', () => {
      const state = deriveProjectRouteState(input({ liveProjectIds: [], closedReason: 'idle' }));
      expect(state).toMatchObject({ kind: 'closed', reason: 'idle' });
    });
  });

  describe('native kernel', () => {
    it('should stay in the editor when the required kernel is available', () => {
      const isKernelAvailable = vi.fn(() => true);
      const state = deriveProjectRouteState(
        input({ nativeKernelRequirement: { kernelName: 'PicoGK', runtimeKernelId: 'picogk' }, isKernelAvailable }),
      );
      expect(state?.kind).toBe('editor');
      expect(isKernelAvailable).toHaveBeenCalledWith('picogk');
    });

    it('should outrank the closed state, because the host cannot run it either way', () => {
      const state = deriveProjectRouteState(
        input({
          nativeKernelRequirement: { kernelName: 'PicoGK', runtimeKernelId: 'picogk' },
          isKernelAvailable: () => false,
          liveProjectIds: [],
        }),
      );
      expect(state).toMatchObject({ kind: 'native-kernel', kernelName: 'PicoGK' });
    });
  });
});
