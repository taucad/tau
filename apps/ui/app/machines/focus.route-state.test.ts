/**
 * The route-state selector (plan § 4 A5a item 7): one row per `ProjectRouteState` member, and the mismatch rows. The
 * committed route is compared with focus's request by project, never by request id or chat.
 */
import { describe, expect, it } from 'vitest';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { FocusAccessAnswer } from '#machines/focus.machine.js';
import { createFocusHarness, projectFixture, slugsOf } from '#machines/focus.machine.test.fixture.js';
import type { FocusHarness } from '#machines/focus.machine.test.fixture.js';
import { accessErrorMessage, leaveFlushErrorMessage, selectProjectRouteState } from '#machines/focus.route-state.js';
import type { CommittedProjectRoute, FocusRegistryView } from '#machines/focus.route-state.js';

const live = { state: 'live', runs: 0, dirty: false, pushed: true, pending: 0 } as const;
const registry = (status: FocusRegistryView['status'] = {}, closed: FocusRegistryView['closed'] = {}) => ({
  status,
  closed,
});
const committedFor = (
  projectId: string | undefined,
  slugs = slugsOf(projectId ?? 'unresolved'),
): CommittedProjectRoute => ({
  slugs,
  projectId,
  chatId: undefined,
});
const select = (harness: FocusHarness, view: FocusRegistryView, committed: CommittedProjectRoute | undefined) =>
  selectProjectRouteState(harness.focus.getSnapshot(), view, committed);

/** Focus held on project `a` with `answer`. */
const heldOn = (answer: FocusAccessAnswer): FocusHarness => {
  const harness = createFocusHarness();
  harness.route('r1', 'a');
  harness.answer('r1', answer);
  return harness;
};

const recovery = <S extends 'recovering' | 'failed'>(status: S): Extract<PendingProjectRecovery, { status: S }> =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the selector reads only the status and reason.
  ({ status, reason: 'copy-failed' }) as unknown as Extract<PendingProjectRecovery, { status: S }>;

describe('selectProjectRouteState: one row per route state', () => {
  it('resolving: focus has not answered the committed project yet', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');

    expect(select(harness, registry(), committedFor('a'))).toEqual({ kind: 'resolving' });
  });

  it('editor: focus is focused on the committed project and its session is live', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');

    expect(select(harness, registry({ a: live }), committedFor('a'))).toEqual({
      kind: 'editor',
      projectId: 'a',
      project: projectFixture('a'),
    });
  });

  it('closed: focused on the committed project whose session is gone, with the reason it closed', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');

    expect(select(harness, registry({}, { a: { reason: 'idle', at: 3 } }), committedFor('a'))).toEqual({
      kind: 'closed',
      projectId: 'a',
      project: projectFixture('a'),
      reason: 'idle',
    });
    expect(select(harness, registry({ a: { ...live, state: 'closing' } }), committedFor('a'))?.kind).toBe('closed');
  });

  it('trashed', () => {
    expect(select(heldOn({ status: 'trashed', project: projectFixture('a') }), registry(), committedFor('a'))).toEqual({
      kind: 'trashed',
      projectId: 'a',
      project: projectFixture('a'),
    });
  });

  it('missing: the library has no project, or the slugs name none', () => {
    expect(select(heldOn({ status: 'missing' }), registry(), committedFor('a'))).toEqual({
      kind: 'missing',
      slugs: slugsOf('a'),
    });

    const harness = createFocusHarness();
    harness.route('r1', undefined, { slugsMissing: true });

    expect(select(harness, registry(), committedFor(undefined))).toEqual({
      kind: 'missing',
      slugs: slugsOf('unresolved'),
    });
  });

  it.each(['conflict', 'unavailable'] as const)('%s', (status) => {
    expect(select(heldOn({ status }), registry(), committedFor('a'))).toEqual({ kind: status, projectId: 'a' });
  });

  it('recovering', () => {
    const answer: FocusAccessAnswer = { status: 'recovering', recovery: recovery('recovering') };

    expect(select(heldOn(answer), registry(), committedFor('a'))).toEqual({ kind: 'recovering', projectId: 'a' });
  });

  it('recovery-failed', () => {
    const answer: FocusAccessAnswer = { status: 'recovery-failed', recovery: recovery('failed') };

    expect(select(heldOn(answer), registry(), committedFor('a'))).toEqual({
      kind: 'recovery-failed',
      projectId: 'a',
      reason: 'copy-failed',
    });
  });

  it('native-kernel: the entry needs a kernel this host lacks, also while the session opens behind it', () => {
    const harness = createFocusHarness({
      kernel: { kernelName: 'Native', runtimeKernelId: 'native', available: false },
    });
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    const expected = { kind: 'native-kernel', projectId: 'a', project: projectFixture('a'), kernelName: 'Native' };

    expect(select(harness, registry(), committedFor('a'))).toEqual(expected);

    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.loaded();

    expect(harness.state()).toBe('focused');
    expect(select(harness, registry({ a: live }), committedFor('a'))).toEqual(expected);
  });

  it('access-error: the access port failed', () => {
    const state = select(heldOn({ status: 'error', message: 'port failed' }), registry(), committedFor('a'));

    expect(state).toMatchObject({ kind: 'access-error', projectId: 'a' });
    expect(state?.kind === 'access-error' && state.error.message).toBe(accessErrorMessage);
  });

  it('flush-error: the leave flush of the session being left failed', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(false);
    const state = select(harness, registry({ a: live }), committedFor('b'));

    expect(state?.kind).toBe('flush-error');
    expect(state?.kind === 'flush-error' && state.error.message).toBe(leaveFlushErrorMessage);
  });
});

describe('selectProjectRouteState: a mismatch derives resolving, never another project editor (D7)', () => {
  it('should derive resolving when focus has no request: the server render and the first client render', () => {
    expect(select(createFocusHarness(), registry(), committedFor('a'))).toEqual({ kind: 'resolving' });
  });

  it('should derive resolving for a committed project focus has not heard of yet', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');

    expect(select(harness, registry({ a: live }), committedFor('b'))).toEqual({ kind: 'resolving' });
  });

  it('should derive resolving on a project route while focus is on Home, and nothing away from a project route', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.home('r2');

    expect(select(harness, registry({ a: live }), committedFor('a'))).toEqual({ kind: 'resolving' });
    expect(select(harness, registry({ a: live }), undefined)).toBeUndefined();
  });

  it('should derive resolving while the committed slugs have no project yet and focus is on another', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');

    expect(select(harness, registry({ a: live }), committedFor(undefined))).toEqual({ kind: 'resolving' });
  });

  it('should match a slug with no project by its slugs, and a chat switch by project', () => {
    const harness = createFocusHarness();
    harness.route('r1', undefined);

    expect(select(harness, registry(), committedFor(undefined))).toEqual({ kind: 'resolving' });

    const focused = createFocusHarness();
    focused.focusOn('r1', 'a');

    expect(
      select(focused, registry({ a: live }), { slugs: slugsOf('a'), projectId: 'a', chatId: 'another-chat' })?.kind,
    ).toBe('editor');
  });
});
