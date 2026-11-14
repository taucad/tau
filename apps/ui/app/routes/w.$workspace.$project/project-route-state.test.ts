import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ProjectRouteAccess } from '#runtime/project-library.js';
import { deriveProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteState, ProjectRouteStateInput } from '#routes/w.$workspace.$project/project-route-state.js';

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const otherProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const slugs = { workspaceSlug: 'rifont', projectSlug: 'planetary-gear' } as const;

const project = (id: string, entryPath = 'main.ts') =>
  createProjectFixture({
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

/*
 * A0.2 (app state orchestration charter): what the derivation compares by. The route state is a
 * function of the project and its access answer; a chat switch or a new request for the same
 * project is not an input, so it cannot derive `resolving` (D7, I20).
 */
describe('deriveProjectRouteState — A0.2 rows', () => {
  it('should derive the same state for the same project whatever chat or request rides along', () => {
    /* The input type has no chat or request field (I20), so a chat switch cannot reach the derivation. */
    expectTypeOf<
      Extract<keyof ProjectRouteStateInput, `${string}${'chat' | 'Chat' | 'request' | 'Request'}${string}`>
    >().toEqualTypeOf<'requestedProjectId'>();
    const base = deriveProjectRouteState(input());
    const withChat = { ...input(), chatId: 'chat-2', requestedChatId: 'chat-2', requestId: 'request-9' };

    expect(deriveProjectRouteState(withChat)).toEqual(base);
    expect(base).toMatchObject({ kind: 'editor', projectId });
  });

  it('should ignore an access error recorded for another project', () => {
    const state = deriveProjectRouteState(
      input({ error: new Error('discovery failed'), errorKind: 'access', errorProjectId: otherProjectId }),
    );
    expect(state).toMatchObject({ kind: 'editor', projectId });
  });

  it('should show a failed leave flush on the way off every project route as the flush notice', () => {
    const state = deriveProjectRouteState(
      input({
        requestedProjectId: undefined,
        slugs: undefined,
        access: undefined,
        resolvedProjectId: undefined,
        error: new Error('unsaved'),
        errorKind: 'flush',
        errorProjectId: '',
      }),
    );
    expect(state).toMatchObject({ kind: 'flush-error' });
  });

  it('should carry the addressed slugs into missing when access says the project is gone', () => {
    expect(deriveProjectRouteState(input({ access: { status: 'missing' } }))).toEqual({ kind: 'missing', slugs });
  });

  it('should derive closed with no reason for a ready project the registry never opened', () => {
    expect(deriveProjectRouteState(input({ liveProjectIds: [otherProjectId] }))).toMatchObject({
      kind: 'closed',
      projectId,
      reason: undefined,
    });
  });
});
