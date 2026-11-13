/**
 * Focus machine rows (plan § 4 A5a; lane brief "A5a", Tests). Each row scripts the ports through the shared harness
 * and asserts what focus sent, where it is and what the route-state selector derives.
 *
 * Path table (the shortest path to each state value; `focus.machine.totality.test.ts` keeps it current):
 *
 * 1. `idle`: initial
 * 2. `resolving`: `routeRequested` for a project
 * 3. `opening.pending`: then a ready `accessAnswered`
 * 4. `held`: or a held `accessAnswered`
 * 5. `opening.live`: then `sessionFacts` live and the open's `openSettled` live
 * 6. `focused`: then `moduleLoaded` with both facts settled
 * 7. `leaving`: then a request for another project and its ready answer
 * 8. `flushFailed`: then the leave flush fails
 */
import { describe, expect, it } from 'vitest';
import { openPatienceMilliseconds } from '#machines/focus.machine.js';
import type { FocusRegistryCommand } from '#machines/focus.machine.js';
import { createFocusHarness, projectFixture, slugsOf } from '#machines/focus.machine.test.fixture.js';
import type { FocusHarness } from '#machines/focus.machine.test.fixture.js';
import { selectProjectRouteState } from '#machines/focus.route-state.js';
import type { FocusRegistryView } from '#machines/focus.route-state.js';

const liveStatus = { state: 'live', runs: 0, dirty: false, pushed: true, pending: 0 } as const;

/** The registry's view with `projectIds` live. */
const registryWith = (...projectIds: string[]): FocusRegistryView => ({
  status: Object.fromEntries(projectIds.map((projectId) => [projectId, liveStatus])),
  closed: {},
});

/** What the selector derives for the committed project `projectId` and chat, with the `live` sessions live. */
const routeState = (
  harness: FocusHarness,
  projectId: string,
  { live = [], chatId }: Readonly<{ live?: readonly string[]; chatId?: string }> = {},
): string | undefined =>
  selectProjectRouteState(harness.focus.getSnapshot(), registryWith(...live), {
    slugs: slugsOf(projectId),
    projectId,
    chatId,
  })?.kind;

const registryOf = (harness: FocusHarness, type: FocusRegistryCommand['type']) => harness.ofType('registry', type);

describe('focus: the route gate rows of A0.2', () => {
  it('should retry a failed leave flush and move once the retry settles', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(false);

    expect(harness.state()).toBe('flushFailed');
    expect(harness.opens().map((open) => open.projectId)).toEqual(['a']);

    harness.send({ type: 'retry' });

    expect(harness.ofType('flush', 'leaveFlushAsked')).toHaveLength(2);
    expect(harness.state()).toBe('leaving');

    harness.settleFlush(true);

    expect(harness.opens().map((open) => open.projectId)).toEqual(['a', 'b']);
    expect(harness.state()).toEqual({ opening: 'pending' });
  });

  it('should retry a failed access check with the same request and open on its answer', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.answer('r1', { status: 'error', message: 'Tau could not check this project. Try again.' });

    expect(harness.state()).toBe('held');
    expect(routeState(harness, 'a')).toBe('access-error');

    harness.send({ type: 'retry' });

    expect(harness.ofType('library', 'accessAsked')).toEqual([
      { type: 'accessAsked', requestId: 'r1', projectId: 'a' },
      { type: 'accessAsked', requestId: 'r1', projectId: 'a' },
    ]);

    harness.ready('r1', 'a');

    expect(harness.lastOpen()).toMatchObject({ type: 'open', projectId: 'a' });
  });

  it('should open only the latest destination when a second navigation lands during the first leave flush', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    const first = harness.lastFlush();
    harness.route('r3', 'c');
    harness.ready('r2', 'b');
    harness.settleFlush(true, first.requestId);

    expect(harness.opens().map((open) => open.projectId)).toEqual(['a']);

    harness.ready('r3', 'c');

    expect(harness.opens().map((open) => open.projectId)).toEqual(['a', 'c']);
    // One flush of the session being left, kept across the second navigation.
    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([first]);
  });

  it('should open nothing when the leave flush settles while the newest destination is still checking access', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.route('r3', 'c');
    harness.settleFlush(true);

    expect(harness.state()).toBe('resolving');
    expect(harness.opens()).toHaveLength(1);
  });

  it('should drop an access answer that a library revision superseded while it was resolving', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 0);

    expect(harness.state()).toBe('resolving');
    expect(harness.opens()).toEqual([]);
    expect(harness.ofType('library', 'accessAsked')).toHaveLength(2);

    harness.ready('r1', 'a', 1);

    expect(harness.lastOpen().request.epoch).toBe(1);
  });

  it('should keep the project being left, open nothing and send no close while a failed leave flush blocks the move (I3)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(false);

    expect(harness.state()).toBe('flushFailed');
    expect(harness.context().on).toBe('a');
    expect(harness.opens()).toHaveLength(1);
    expect(harness.sent.registry.some((command) => command.type === 'close')).toBe(false);
    expect(routeState(harness, 'b', { live: ['a'] })).toBe('flush-error');
  });
});

describe('focus: requests', () => {
  it('should ignore an answer for a superseded request (I18)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.route('r2', 'b');

    expect(harness.ofType('library', 'accessCancelled')).toEqual([{ type: 'accessCancelled', requestId: 'r1' }]);

    harness.ready('r1', 'a');

    expect(harness.state()).toBe('resolving');
    expect(harness.opens()).toEqual([]);

    harness.ready('r2', 'b');

    expect(harness.opens().map((open) => open.projectId)).toEqual(['b']);
  });

  it('should not retry a failed leave flush on a library change (programme control ruling; named change)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(false);
    harness.send({ type: 'libraryChanged', revision: 1 });

    expect(harness.state()).toBe('flushFailed');
    expect(harness.ofType('flush', 'leaveFlushAsked')).toHaveLength(1);
    expect(harness.ofType('library', 'accessAsked')).toHaveLength(2);
  });

  it("should keep the left project's flush obligation through a held answer", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.answer('r2', { status: 'unavailable' });

    expect(harness.state()).toBe('held');
    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([]);
    expect(harness.context().leave).toEqual({ projectId: 'a', flush: 'none' });

    harness.route('r3', 'c');
    harness.ready('r3', 'c');

    expect(harness.lastFlush().projectId).toBe('a');
    expect(harness.opens().map((open) => open.projectId)).toEqual(['a']);

    harness.settleFlush(true);

    expect(harness.opens().map((open) => open.projectId)).toEqual(['a', 'c']);
  });

  it("should settle in flushFailed when a failed child's producers reject the leave flush", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.facts('a', 'failed');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');

    expect(harness.lastFlush().projectId).toBe('a');

    harness.settleFlush(false);

    expect(harness.state()).toBe('flushFailed');
    expect(harness.opens()).toHaveLength(1);
  });

  it('should move without a flush when the session being left closed while focus waited', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });
    harness.ready('r2', 'b');

    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([]);
    expect(harness.opens().map((open) => open.projectId)).toEqual(['a', 'b']);
  });

  it('should keep one leave flush in flight across a return to the project being left', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    const first = harness.lastFlush();
    harness.route('r3', 'a');
    harness.ready('r3', 'a');
    harness.route('r4', 'b');
    harness.ready('r4', 'b');

    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([first]);
    expect(harness.state()).toBe('leaving');

    harness.settleFlush(true, first.requestId);

    expect(harness.opens().at(-1)?.projectId).toBe('b');
  });

  it('should flush the session being left on Home, settle idle, and block on a failure', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.home('r2');

    expect(harness.lastFlush().projectId).toBe('a');
    expect(harness.state()).toBe('leaving');

    harness.settleFlush(true);

    expect(harness.state()).toBe('idle');

    const failing = createFocusHarness();
    failing.focusOn('r1', 'a');
    failing.home('r2');
    failing.settleFlush(false);

    expect(failing.state()).toBe('flushFailed');
  });

  it('should withdraw its waiting open when the person moves to another project', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.route('r2', 'b');

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.context().pending).toBeUndefined();
  });

  it('should withdraw its waiting open and open again from the fresh answer after a library change', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.send({ type: 'libraryChanged', revision: 1 });

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.opens()).toHaveLength(1);

    harness.ready('r1', 'a', 1);

    expect(harness.opens()).toHaveLength(2);
    expect(harness.lastOpen().request.epoch).toBe(1);
  });
});

describe('focus: the registry answers an open', () => {
  it('should send its open again when the registry drops it, and when another open displaces it', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.settleOpen('dropped');

    expect(harness.opens()).toHaveLength(2);

    harness.settleOpen('waiting');
    harness.focus.send({ type: 'openRequested', projectId: 'a' });

    // A person's open of the same project waits in the same slot: focus's open still stands.
    expect(harness.opens()).toHaveLength(3);
  });

  it('should send its open again when a person open of another project displaces it from the slot', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'b');
    harness.route('r2', 'a');
    harness.ready('r2', 'a');
    harness.settleFlush(true);
    harness.settleOpen('waiting');
    const waiting = harness.lastOpen();
    harness.send({ type: 'openRequested', projectId: 'b' });

    const opens = harness.opens().map((open) => open.projectId);

    expect(opens.slice(-2)).toEqual(['b', 'a']);
    expect(harness.lastOpen().requestId).not.toBe(waiting.requestId);
    expect(harness.context().pending).toBeUndefined();
  });

  it('should hold a session that could not start, and ask again on retry', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('start-failed');

    expect(harness.state()).toBe('held');
    expect(routeState(harness, 'a')).toBe('access-error');

    harness.send({ type: 'retry' });
    harness.ready('r1', 'a');

    expect(harness.opens()).toHaveLength(2);
  });

  it('should settle on the closed view when its open lands on a failed session (rule 10)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'failed');
    harness.settleOpen('on-failed');

    expect(harness.state()).toBe('focused');
    expect(
      selectProjectRouteState(
        harness.focus.getSnapshot(),
        { status: { a: { ...liveStatus, state: 'failed' } }, closed: {} },
        { slugs: slugsOf('a'), projectId: 'a', chatId: undefined },
      )?.kind,
    ).toBe('closed');
  });

  it('should settle on the closed view when the session it opened closes before the join (rule 11)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a')).toBe('closed');
    expect(harness.opens()).toHaveLength(1);
  });

  it('should withdraw and re-send its refused open, also when a person closes the session in the window (rule 12)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    // The open waits for a closing session; that close fails to `failed`, and the person closes it again before
    // focus hears the refusal.
    harness.facts('a', 'closing');
    harness.settleOpen('waiting');
    harness.facts('a', 'failed');
    harness.facts('a', 'closing');
    harness.settleOpen('refused');

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.opens()).toHaveLength(2);

    // The re-sent open waits for the person's close, and is resumed when it frees the slot.
    harness.settleOpen('waiting');
    harness.facts('a', 'live');
    harness.settleOpen('live');

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });
});

describe('focus: the four facts of opening (I20)', () => {
  const orders = [
    ['module', 'chat', 'check'],
    ['module', 'check', 'chat'],
    ['chat', 'module', 'check'],
    ['chat', 'check', 'module'],
    ['check', 'module', 'chat'],
    ['check', 'chat', 'module'],
  ] as const;

  it.each(orders)('should join only once %s, %s and %s have all settled', (...order) => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');
    let chat = false;
    let check = false;
    for (const [index, fact] of order.entries()) {
      expect(harness.state()).toEqual({ opening: 'live' });
      expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');
      if (fact === 'module') {
        harness.loaded();
      } else {
        chat ||= fact === 'chat';
        check ||= fact === 'check';
        harness.facts('a', 'live', { chatReady: chat, availability: check ? 'settled' : 'pending' });
      }
      expect(harness.state()).toEqual(index === order.length - 1 ? 'focused' : { opening: 'live' });
    }

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });

  it('should focus with whatever is unsettled once the open bound passes after the session reports live', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');
    harness.clock.advance(openPatienceMilliseconds - 1);

    expect(harness.state()).toEqual({ opening: 'live' });

    // A fact arriving inside the window does not restart the bound.
    harness.facts('a', 'live', { chatReady: true, availability: 'pending' });
    harness.clock.advance(1);

    expect(harness.state()).toBe('focused');
  });

  it('should not start the bound before the session reports live, and should wait for the module after it', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.facts('a', 'starting', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');
    harness.clock.advance(openPatienceMilliseconds * 2);

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.clock.advance(openPatienceMilliseconds);

    expect(harness.state()).toEqual({ opening: 'live' });
    expect(harness.context().open.patience).toBe(true);

    harness.loaded();

    expect(harness.state()).toBe('focused');
  });

  it('U1: should never derive the editor while the session module is pending', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.facts('a', 'live');
    harness.settleOpen('live');

    expect(harness.context().module).toBe('loading');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');

    harness.loaded();

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });
});

describe('focus: the same project keeps its editor (D7)', () => {
  it('should keep focused, send one chatRequested and derive the editor in every step of a chat switch', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
    expect(routeState(harness, 'a', { live: ['a'], chatId: 'chat-2' })).toBe('editor');

    harness.route('r2', 'a', { chatId: 'chat-2' });

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'], chatId: 'chat-2' })).toBe('editor');
    expect(registryOf(harness, 'chatRequested')).toEqual([{ type: 'chatRequested', projectId: 'a', chatId: 'chat-2' }]);
    expect(harness.ofType('library', 'accessAsked')).toHaveLength(1);
    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([]);
    expect(harness.opens()).toHaveLength(1);
    expect(harness.context().kept['a']?.chatId).toBe('chat-2');
  });

  it("should keep focused and send no chatRequested when the editor's focused chat replaces the URL", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.send({ type: 'focusedChatResolved', projectId: 'a', chatId: 'chat-9' });

    expect(harness.sent.route).toEqual([{ type: 'chatShown', projectId: 'a', chatId: 'chat-9' }]);
    expect(routeState(harness, 'a', { live: ['a'], chatId: 'chat-9' })).toBe('editor');

    harness.route('r2', 'a', { chatId: 'chat-9' });

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'], chatId: 'chat-9' })).toBe('editor');
    expect(registryOf(harness, 'chatRequested')).toEqual([]);
  });

  it('should ask again under the new request id when a same-project request lands while resolving', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.route('r2', 'a', { chatId: 'chat-2', createdChatId: 'chat-2' });

    expect(harness.state()).toBe('resolving');
    expect(harness.ofType('library', 'accessCancelled')).toEqual([{ type: 'accessCancelled', requestId: 'r1' }]);
    expect(harness.ofType('library', 'accessAsked')).toEqual([
      { type: 'accessAsked', requestId: 'r1', projectId: 'a' },
      { type: 'accessAsked', requestId: 'r2', projectId: 'a' },
    ]);

    // The answer to the first id is stale (I18).
    harness.ready('r1', 'a');

    expect(harness.opens()).toEqual([]);

    harness.ready('r2', 'a');

    expect(harness.lastOpen().request).toMatchObject({ chatId: 'chat-2', createdChatId: 'chat-2' });
    expect(harness.ofType('flush', 'leaveFlushAsked')).toEqual([]);
  });
});

describe("focus: a person's open goes through focus (S39)", () => {
  it('should send the request focus kept for the project and not move', () => {
    const harness = createFocusHarness({
      kernel: { kernelName: 'Native', runtimeKernelId: 'native', available: true },
    });
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.facts('b', 'live');
    harness.settleOpen('live');

    expect(harness.state()).toBe('focused');

    harness.send({ type: 'openRequested', projectId: 'a' });

    expect(harness.lastOpen()).toMatchObject({
      projectId: 'a',
      request: { workspace: 'w', nativeKernelId: 'native', epoch: 0 },
    });
    expect(harness.state()).toBe('focused');
    expect(harness.context().on).toBe('b');
    expect(harness.ofType('flush', 'leaveFlushAsked')).toHaveLength(1);
  });

  it('should join the facts again when the person reopens the project focus is on', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });

    expect(routeState(harness, 'a')).toBe('closed');

    harness.send({ type: 'openRequested', projectId: 'a' });

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');
    harness.facts('a', 'live');

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });

  it('should ask the library for a project it keeps no request for, open on ready and refuse otherwise', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 1);
    harness.send({ type: 'openRequested', projectId: 'b' });

    const asked = harness.lastAsked();

    expect(asked.projectId).toBe('b');

    harness.answer(asked.requestId, { status: 'trashed', project: projectFixture('b') }, 1);

    expect(harness.emitted).toEqual([
      { type: 'openRefused', projectId: 'b', answer: { status: 'trashed', project: projectFixture('b') } },
    ]);

    // A kept request from an older epoch is not usable: the person's open asks first.
    harness.send({ type: 'libraryChanged', revision: 2 });
    harness.send({ type: 'openRequested', projectId: 'a' });
    const reasked = harness.lastAsked();

    expect(reasked.projectId).toBe('a');
  });

  it('should open a project it holds slugs for on a ready answer', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.answer('r2', { status: 'unavailable' });
    harness.route('r3', 'a');
    harness.send({ type: 'openRequested', projectId: 'b' });
    const asked = harness.lastAsked();
    harness.ready(asked.requestId, 'b');

    expect(harness.lastOpen()).toMatchObject({ projectId: 'b', request: { workspace: 'w', epoch: 0 } });
  });
});

describe('focus: slugs, the retained route and the URL markers (S29, S30, S34)', () => {
  it('should resolve slugs before it asks access, and hold `missing` for slugs that name nothing', () => {
    const harness = createFocusHarness();
    harness.route('r1', undefined);

    expect(harness.state()).toBe('resolving');
    expect(harness.ofType('library', 'accessAsked')).toEqual([]);

    harness.route('r2', undefined, { slugsMissing: true });

    expect(harness.state()).toBe('held');
    expect(
      selectProjectRouteState(harness.focus.getSnapshot(), registryWith(), {
        slugs: slugsOf('unresolved'),
        projectId: undefined,
        chatId: undefined,
      })?.kind,
    ).toBe('missing');
  });

  it('should keep the project on its path while its slug stops resolving (the retained route)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.send({ type: 'routeRequested', requestId: 'r2', slugs: slugsOf('a') });

    expect(harness.state()).toBe('focused');
    expect(harness.context().request?.projectId).toBe('a');
  });

  it('should take the cloudOpen marker once', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { cloudOpen: true });
    harness.route('r1', 'a', { cloudOpen: true });

    expect(harness.sent.route).toEqual([{ type: 'cloudOpenTaken', projectId: 'a' }]);
  });

  it('should keep the native kernel id a project was opened with after focus moves on (S34)', () => {
    const harness = createFocusHarness({
      kernel: { kernelName: 'Native', runtimeKernelId: 'native', available: false },
    });
    harness.route('r1', 'a');
    harness.ready('r1', 'a');

    expect(harness.lastOpen().request.nativeKernelId).toBe('native');
    expect(routeState(harness, 'a')).toBe('native-kernel');

    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.loaded();
    harness.route('r2', 'b');

    expect(harness.context().kept['a']?.nativeKernelId).toBe('native');
  });
});

describe('focus: the window and the person', () => {
  it('should touch the project focus is on when the window regains focus', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.send({ type: 'windowFocused' });

    expect(registryOf(harness, 'touch')).toEqual([{ type: 'touch', projectId: 'a' }]);
  });

  it('should never send close', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.home('r3');

    expect(harness.sent.registry.map((command) => command.type)).not.toContain('close');
  });
});
