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

const liveStatus = {
  state: 'live',
  runs: 0,
  dirty: false,
  pushed: true,
  pending: 0,
  chatReady: true,
  availability: 'settled',
} as const;

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
  it('should send its open again from the fresh answer when the registry drops it, and when another open displaces it', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    // The registry drops a stale request before focus hears the library change: focus waits for that change.
    harness.settleOpen('dropped');

    expect(harness.opens()).toHaveLength(1);

    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 1);

    expect(harness.opens()).toHaveLength(2);
    expect(harness.lastOpen().request.epoch).toBe(1);

    harness.settleOpen('waiting');
    harness.focus.send({ type: 'openRequested', projectId: 'a' });

    // A person's open of the project focus is opening takes the slot in place of focus's own (`FocusPending`).
    expect(harness.opens()).toHaveLength(3);
    expect(harness.context().open.openId).toBe(harness.lastOpen().requestId);
  });

  it('should wait for a person open of the project it is opening, and join when that open goes live', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.send({ type: 'openRequested', projectId: 'a' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', person.requestId);
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live', person.requestId);

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');

    // A move withdraws the person's open waiting in the slot for the project focus was opening.
    const second = createFocusHarness();
    second.route('r1', 'a');
    second.ready('r1', 'a');
    second.settleOpen('waiting');
    second.send({ type: 'openRequested', projectId: 'a' });
    second.settleOpen('waiting', second.lastOpen().requestId);
    second.route('r2', 'b');

    expect(registryOf(second, 'cancelPendingOpen')).toHaveLength(1);
  });

  it('should withdraw its open from before a move when the registry says it waits after the move', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    const open = harness.lastOpen();
    harness.route('r2', 'b');
    harness.settleOpen('waiting', open.requestId);

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.context().pending).toBeUndefined();
  });

  it('should send its open again when its wait reply arrives after another open displaced the slot', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'b');
    harness.route('r2', 'a');
    harness.ready('r2', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', own.requestId);

    expect(harness.opens()).toHaveLength(3);

    // The person's touch answers after focus's wait on the ordered channel: that wait was displaced.
    harness.settleOpen('live', person.requestId);

    expect(harness.context().pending).toBeUndefined();
    expect(harness.lastOpen()).toMatchObject({ projectId: 'a' });
    expect(harness.lastOpen().requestId).not.toBe(own.requestId);
    expect(harness.context().open.openId).toBe(harness.lastOpen().requestId);
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
    harness.route('r1', 'a', { chatId: 'c1' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.facts('b', 'live');
    harness.settleOpen('live');

    expect(harness.state()).toBe('focused');

    harness.send({ type: 'openRequested', projectId: 'a' });

    // The kept request carries the chat the route last named for that project (plan A0.2).
    expect(harness.lastOpen()).toMatchObject({
      projectId: 'a',
      request: { workspace: 'w', nativeKernelId: 'native', chatId: 'c1', epoch: 0 },
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
    // The committed route has slugs but no project for that moment: the selector keeps the editor by slugs.
    expect(
      selectProjectRouteState(harness.focus.getSnapshot(), registryWith('a'), {
        slugs: slugsOf('a'),
        projectId: undefined,
        chatId: undefined,
      })?.kind,
    ).toBe('editor');
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

describe('focus: replies that arrive out of turn', () => {
  it('should take one answer per question: a re-delivery, or the answer to a replaced ask, changes nothing', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 1);
    harness.settleOpen('start-failed');

    expect(harness.state()).toBe('held');

    harness.ready('r1', 'a', 1);

    expect(harness.state()).toBe('held');
    expect(harness.opens()).toHaveLength(1);

    // The answer to the ask a library change replaced, given at the older epoch, is not taken either.
    const replaced = createFocusHarness();
    replaced.route('r1', 'a');
    replaced.send({ type: 'libraryChanged', revision: 1 });
    replaced.ready('r1', 'a', 0);

    expect(replaced.state()).toBe('resolving');
  });

  it('should not read a session record from before its open as the session going away (rule 11)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });
    harness.focusOn('r2', 'b');
    harness.route('r3', 'a');
    harness.ready('r3', 'a');
    harness.settleFlush(true);
    harness.settleOpen('live');

    expect(harness.state()).toEqual({ opening: 'pending' });
    expect(routeState(harness, 'a')).toBe('resolving');

    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });

    expect(harness.state()).toEqual({ opening: 'live' });
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');
  });

  it('should join again on a reopen of the focused project that asked the library first (rule 13)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 1);
    harness.send({ type: 'libraryChanged', revision: 2 });
    harness.send({ type: 'openRequested', projectId: 'a' });
    const asked = harness.lastAsked();
    harness.ready('r1', 'a', 2);
    harness.ready(asked.requestId, 'a', 2);

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');

    harness.settleOpen('live');
    harness.facts('a', 'live');

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });

  it('should give the session a chat the route switched to while its open waited', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'c1' });
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.route('r2', 'a', { chatId: 'c2' });
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live', harness.opens()[0]?.requestId);

    expect(harness.state()).toBe('focused');
    expect(registryOf(harness, 'chatRequested')).toEqual([{ type: 'chatRequested', projectId: 'a', chatId: 'c2' }]);
  });

  it('should flush again on a later leave when the running flush started before focus joined the session again', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    const first = harness.lastFlush();
    harness.route('r3', 'a');
    harness.ready('r3', 'a');
    harness.settleOpen('live');
    harness.facts('a', 'live');

    expect(harness.state()).toBe('focused');

    harness.route('r4', 'b');
    harness.ready('r4', 'b');

    expect(harness.state()).toBe('leaving');
    expect(harness.ofType('flush', 'leaveFlushAsked')).toHaveLength(1);

    harness.settleFlush(true, first.requestId);

    expect(harness.state()).toBe('leaving');
    expect(harness.ofType('flush', 'leaveFlushAsked')).toHaveLength(2);

    harness.settleFlush(true);

    expect(harness.state()).toEqual({ opening: 'pending' });
    expect(harness.lastOpen()).toMatchObject({ projectId: 'b' });
  });

  it("should ask again when a person's open is answered from before a library change", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.answer('r2', { status: 'unavailable' });
    harness.route('r3', 'a');
    harness.send({ type: 'openRequested', projectId: 'b' });
    const asked = harness.lastAsked();
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready(asked.requestId, 'b', 0);

    expect(harness.emitted).toEqual([]);
    expect(harness.lastAsked()).toMatchObject({ projectId: 'b' });
    expect(harness.lastAsked().requestId).not.toBe(asked.requestId);
  });

  it("should withdraw a person's waiting open when an answer from a newer epoch replaces its kept request", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.settleOpen('live');
    harness.facts('b', 'live');
    harness.route('r3', 'a');
    harness.ready('r3', 'a');
    harness.settleFlush(true);
    harness.settleOpen('live');
    harness.facts('b', 'absent', { chatReady: false, availability: 'pending' });
    harness.send({ type: 'openRequested', projectId: 'b' });
    harness.settleOpen('waiting', harness.lastOpen().requestId);

    expect(harness.context().pending).toMatchObject({ projectId: 'b', person: true, epoch: 0 });

    harness.route('r4', 'b');
    harness.ready('r4', 'b', 1);

    expect(harness.context().pending).toBeUndefined();
    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
  });
});

describe('focus: replies around a library change or a blocked move', () => {
  it('should ask again after retry when the answer landed while a failed leave flush blocked the move', () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.settleFlush(false);

    expect(harness.state()).toBe('flushFailed');

    harness.ready('r2', 'b', 1);
    harness.send({ type: 'retry' });
    harness.settleFlush(true);

    expect(harness.lastAsked()).toMatchObject({ requestId: 'r2', projectId: 'b' });
    expect(harness.ofType('library', 'accessAsked')).toHaveLength(4);

    harness.ready('r2', 'b', 1);

    expect(harness.lastOpen()).toMatchObject({ projectId: 'b', request: { epoch: 1 } });
  });

  it('should not read a session absent while its open waits as the session going away (rule 11)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('waiting');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });
    harness.settleOpen('live');

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.facts('a', 'starting', { chatReady: false, availability: 'pending' });
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });

    expect(harness.state()).toEqual({ opening: 'live' });
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');
  });

  it('should withdraw its open when the wait reply arrives after the re-ask for a library change', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.settleOpen('waiting');

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.context().pending).toBeUndefined();

    harness.ready('r1', 'a', 1);

    expect(harness.opens()).toHaveLength(2);
    expect(harness.lastOpen().request.epoch).toBe(1);
  });

  it("should withdraw a person's open the registry refused", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.settleOpen('live');
    harness.facts('b', 'live');
    harness.send({ type: 'openRequested', projectId: 'a' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', person.requestId);
    harness.settleOpen('refused', person.requestId);

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.context().pending).toBeUndefined();
  });
});

describe('focus: a session that leaves before the join, and person opens around it', () => {
  it.each([
    ['fails to start', ['starting', 'failed']],
    ['closes while still starting', ['starting', 'closing', 'absent']],
  ] as const)('should settle on the closed view when a spawned session %s (rules 10, 11)', (_how, statuses) => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    harness.settleOpen('live');
    for (const status of statuses) {
      harness.facts('a', status, { chatReady: false, availability: 'pending' });
    }

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a')).toBe('closed');
  });

  it('should not count a live record from before the open, read at a resume, as the session going live', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.facts('a', 'live');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    harness.facts('a', 'closing');
    harness.settleOpen('waiting');
    harness.facts('a', 'absent');
    harness.settleOpen('live');

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.facts('a', 'starting', { chatReady: false, availability: 'pending' });
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');
  });

  it('should join again when the person reopens the project focus is opening while its session closes', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.loaded();
    harness.settleOpen('live');
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.facts('a', 'closing', { chatReady: false, availability: 'pending' });
    harness.send({ type: 'openRequested', projectId: 'a' });
    harness.settleOpen('waiting');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });

    expect(harness.state()).toEqual({ opening: 'pending' });

    harness.settleOpen('live');
    harness.facts('a', 'starting', { chatReady: false, availability: 'pending' });
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });

    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');
  });

  it('should keep the editor when the person opens the focused project whose session is live (rule 13)', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'a');
    harness.send({ type: 'openRequested', projectId: 'a' });

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('editor');
  });

  it("should not let a person's open after a drop re-send focus's stale open", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'c');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    harness.settleOpen('waiting');
    harness.settleOpen('dropped');
    harness.send({ type: 'openRequested', projectId: 'c' });

    expect(harness.opens().filter((open) => open.projectId === 'a')).toHaveLength(1);

    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.ready('r1', 'a', 1);

    expect(harness.lastOpen()).toMatchObject({ projectId: 'a', request: { epoch: 1 } });
  });

  it("should keep a person's open built from an answer newer than focus's epoch", () => {
    const harness = createFocusHarness();
    harness.route('r1', 'd');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.loaded();
    harness.facts('b', 'live');
    harness.settleOpen('live');
    harness.send({ type: 'openRequested', projectId: 'd' });
    harness.send({
      type: 'accessAnswered',
      requestId: harness.lastAsked().requestId,
      epoch: 1,
      answer: { status: 'ready', project: projectFixture('d') },
    });
    const open = harness.lastOpen();
    const cancels = registryOf(harness, 'cancelPendingOpen').length;
    harness.settleOpen('waiting', open.requestId);

    expect(open).toMatchObject({ projectId: 'd', request: { epoch: 1 } });
    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(cancels);
    expect(harness.context().pending).toMatchObject({ projectId: 'd', person: true, epoch: 1 });
  });

  it("should not withdraw focus's open on a late refusal of an earlier person's open", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'c');
    harness.focusOn('r1', 'b');
    harness.settleFlush(true);
    harness.facts('b', 'live');
    harness.settleOpen('live');
    harness.facts('c', 'closing');
    harness.send({ type: 'openRequested', projectId: 'c' });
    const person = harness.lastOpen().requestId;
    harness.settleOpen('waiting', person);
    harness.route('r2', 'a');
    harness.ready('r2', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen().requestId;
    harness.settleOpen('waiting', own);
    const cancels = registryOf(harness, 'cancelPendingOpen').length;
    harness.settleOpen('refused', person);

    expect(registryOf(harness, 'cancelPendingOpen')).toHaveLength(cancels);
    expect(harness.context().pending).toMatchObject({ openId: own, projectId: 'a' });
  });
});

describe('focus: two replies to one open, and drops before the library change is heard', () => {
  const unsettled = { chatReady: false, availability: 'pending' } as const;

  it("should start a reopened session's open bound afresh when the person reopens the project focus is opening", () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('live');
    harness.facts('a', 'starting', unsettled);
    harness.facts('a', 'live', unsettled);
    harness.clock.increment(openPatienceMilliseconds + 500);
    harness.facts('a', 'closing', unsettled);
    harness.send({ type: 'openRequested', projectId: 'a' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', person.requestId);
    harness.facts('a', 'absent', unsettled);
    harness.settleOpen('live', person.requestId);
    harness.facts('a', 'starting', unsettled);
    harness.facts('a', 'live', unsettled);
    harness.loaded();

    expect(harness.state()).toEqual({ opening: 'live' });
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');

    harness.clock.increment(openPatienceMilliseconds);

    expect(harness.state()).toBe('focused');
  });

  it('should open again from the fresh answer when its dropped open had an older epoch than a later person open', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'c');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.send({ type: 'openRequested', projectId: 'c' });
    harness.ready(harness.lastAsked().requestId, 'c', 1);
    const person = harness.lastOpen();
    harness.settleOpen('dropped', own.requestId);
    harness.settleOpen('waiting', own.requestId);
    harness.settleOpen('live', person.requestId);
    harness.ready('r1', 'a', 1);

    expect(harness.lastOpen()).toMatchObject({ projectId: 'a', request: { epoch: 1 } });
  });

  it("should ignore a wait reply that arrives after the same open's live reply", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.settleOpen('live', own.requestId);
    harness.facts('a', 'starting', unsettled);
    harness.settleOpen('waiting', own.requestId);

    expect(harness.context().pending).toBeUndefined();

    harness.facts('a', 'live', unsettled);
    harness.send({ type: 'openRequested', projectId: 'b' });

    expect(harness.opens().filter((open) => open.projectId === 'a')).toHaveLength(1);
    expect(harness.context().open).toMatchObject({ openId: own.requestId, live: true });
  });

  it("should ask the library first for a person's open whose kept request is at a dropped epoch", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'c');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    harness.settleOpen('waiting');
    harness.facts('c', 'absent');
    harness.settleOpen('dropped');
    const opens = harness.opens().length;
    harness.send({ type: 'openRequested', projectId: 'c' });

    expect(harness.opens()).toHaveLength(opens);
    expect(harness.lastAsked()).toMatchObject({ projectId: 'c' });
  });

  it("should ignore a late wait reply for its live open after a person's open was sent", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.settleOpen('live', own.requestId);
    harness.facts('b', 'absent', unsettled);
    harness.facts('a', 'live', unsettled);
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', person.requestId);
    harness.settleOpen('waiting', own.requestId);

    expect(harness.opens().filter((open) => open.projectId === 'a')).toHaveLength(1);
    expect(harness.context().pending).toMatchObject({ openId: person.requestId, projectId: 'b' });

    harness.clock.increment(openPatienceMilliseconds);

    expect(harness.state()).toBe('focused');
  });
});

describe('focus: touches the close outran, displaced waits and the slot focus mirrors', () => {
  const unsettled = { chatReady: false, availability: 'pending' } as const;

  /** Focused on `b` with `a` still live, then routed back to `a`: the open is a touch of `a`. */
  const touchingA = (): FocusHarness => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'a');
    harness.route('r1', 'b');
    harness.ready('r1', 'b');
    harness.settleFlush(true);
    harness.facts('b', 'live');
    harness.settleOpen('live');
    harness.route('r2', 'a');
    harness.ready('r2', 'a');
    harness.settleFlush(true);
    return harness;
  };

  it('should settle on the closed project when the touch replies live while the session closes', () => {
    const harness = touchingA();
    const touch = harness.lastOpen();
    harness.settleOpen('live', touch.requestId);
    harness.facts('a', 'closing');
    harness.facts('a', 'absent');

    expect(harness.state()).toBe('focused');
    expect(routeState(harness, 'a', { live: [] })).toBe('closed');
  });

  it('should open again when a new session of the project it is focused on starts behind a stale record', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'a');
    // The record still says live when the person opens `a`, so focus takes the open for a touch and stays.
    harness.send({ type: 'openRequested', projectId: 'a' });
    harness.facts('a', 'closing');
    harness.facts('a', 'absent');
    harness.settleOpen('live', harness.lastOpen().requestId);
    harness.facts('a', 'starting', unsettled);

    expect(harness.state()).toEqual({ opening: 'pending' });
    expect(routeState(harness, 'a', { live: ['a'] })).toBe('resolving');

    harness.settleOpen('live', harness.lastOpen().requestId);
    harness.facts('a', 'live');

    expect(harness.state()).toBe('focused');
  });

  it('should withdraw its open on a move when a record from before the open arrives after it was sent', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    // Emitted before the registry took the open, delivered after focus sent it.
    harness.facts('a', 'live');
    harness.facts('a', 'closing');
    harness.route('r2', 'c');

    expect(harness.ofType('registry', 'cancelPendingOpen')).toHaveLength(1);
  });

  it('should open again when a person open displaced its wait behind a record from before the open', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.facts('a', 'live');
    harness.facts('a', 'closing');
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', own.requestId);
    harness.settleOpen('live', person.requestId);

    expect(harness.lastOpen()).toMatchObject({ projectId: 'a' });
    expect(harness.lastOpen().requestId).not.toBe(own.requestId);
    expect(harness.context().open.openId).toBe(harness.lastOpen().requestId);
  });

  it('should withdraw its open when it moves before the wait reply arrives', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.facts('b', 'closing');
    harness.route('r2', 'c');

    expect(harness.ofType('registry', 'cancelPendingOpen')).toHaveLength(1);

    harness.settleOpen('waiting', own.requestId);

    expect(harness.ofType('registry', 'cancelPendingOpen')).toHaveLength(1);
    expect(harness.context().pending).toBeUndefined();
  });

  it('should withdraw its unanswered open from an older epoch when the library changes', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleFlush(true);
    harness.facts('b', 'closing');
    harness.send({ type: 'libraryChanged', revision: 1 });

    expect(harness.ofType('registry', 'cancelPendingOpen')).toHaveLength(1);
  });

  it("should clear the slot it mirrors when a person's open from an older epoch waits again", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'c');
    harness.home('r1');
    harness.settleFlush(true);
    harness.facts('c', 'closing');
    harness.send({ type: 'openRequested', projectId: 'c' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', person.requestId);
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.settleOpen('waiting', person.requestId);

    expect(harness.context().pending).toBeUndefined();
  });

  it("should not open the project a second time when its resumed open's wait reply arrives late", () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'x');
    harness.ready('r1', 'x');
    harness.settleFlush(true);
    harness.facts('x', 'live');
    harness.settleOpen('live');
    harness.facts('b', 'absent');
    harness.route('r2', 'a');
    harness.ready('r2', 'a');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    harness.facts('a', 'starting', unsettled);
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen();
    // In the registry's order: the wait, the resume, then the person's open.
    harness.settleOpen('waiting', own.requestId);
    harness.settleOpen('live', own.requestId);
    harness.settleOpen('waiting', person.requestId);

    expect(harness.opens().filter((open) => open.projectId === 'a')).toHaveLength(1);
  });

  it('should open again when a later open displaced its wait before the session it waited on revived', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'b');
    harness.route('r1', 'c');
    harness.facts('c', 'closing');
    harness.ready('r1', 'c');
    harness.settleFlush(true);
    const own = harness.lastOpen();
    // A person's touch of `b` displaces the slot before `c`'s close fails and leaves it live.
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen();
    harness.settleOpen('waiting', own.requestId);
    harness.settleOpen('live', person.requestId);
    harness.facts('c', 'live');

    expect(harness.lastOpen()).toMatchObject({ projectId: 'c' });
    expect(harness.lastOpen().requestId).not.toBe(own.requestId);
  });

  it('should forget a wait reply for an adopted open it withdrew when it moved', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a');
    harness.ready('r1', 'a');
    harness.settleOpen('live');
    harness.facts('a', 'closing');
    harness.send({ type: 'openRequested', projectId: 'a' });
    harness.ready(harness.lastAsked().requestId, 'a');
    const person = harness.lastOpen();
    harness.route('r2', 'b');
    harness.settleOpen('waiting', person.requestId);

    expect(harness.context().pending).toBeUndefined();
  });

  it('should empty the slot it mirrors when it withdraws a wait for a request it left', () => {
    const harness = createFocusHarness();
    harness.focusOn('r0', 'a');
    harness.route('r1', 'b');
    harness.ready('r1', 'b');
    harness.settleFlush(true);
    harness.facts('a', 'closing');
    harness.send({ type: 'openRequested', projectId: 'b' });
    harness.ready(harness.lastAsked().requestId, 'b');
    harness.settleOpen('waiting', harness.lastOpen().requestId);
    harness.home('r2');
    harness.settleOpen('waiting');

    expect(harness.context().pending).toBeUndefined();
  });
});

describe('focus: a session replaced by a resume no snapshot showed absent', () => {
  const unsettled = { chatReady: false, availability: 'pending' } as const;

  /** Opening `b` with chat `x`, live and past the open bound, the join held by the import. */
  const heldPastBound = (): FocusHarness => {
    const harness = createFocusHarness();
    harness.route('r1', 'b', { chatId: 'x' });
    harness.ready('r1', 'b');
    harness.settleOpen('live');
    harness.facts('b', 'starting', unsettled);
    harness.facts('b', 'live', unsettled);
    harness.clock.increment(openPatienceMilliseconds);
    return harness;
  };

  /** The person reopens `b` behind a stale live record; the close frees `b` and resumes that open at once. */
  const reopenedBehindClose = (harness: FocusHarness, between?: () => void): void => {
    harness.send({ type: 'openRequested', projectId: 'b' });
    const person = harness.lastOpen().requestId;
    // Focus still reads `b` live here, so a chat switch now reaches the session that is closing.
    between?.();
    harness.facts('b', 'closing', unsettled);
    harness.settleOpen('waiting', person);
    harness.settleOpen('live', person);
    harness.facts('b', 'starting', unsettled);
    harness.facts('b', 'live', unsettled);
  };

  it('should not join the new session on the open bound the old one passed', () => {
    const harness = heldPastBound();

    expect(harness.context().open.patience).toBe(true);

    reopenedBehindClose(harness);
    harness.loaded();

    expect(harness.state()).toEqual({ opening: 'live' });
    expect(routeState(harness, 'b', { live: ['b'] })).toBe('resolving');

    harness.clock.increment(openPatienceMilliseconds);

    expect(harness.state()).toBe('focused');
  });

  it('should give the new session the chat the route switched to after the person open was sent', () => {
    const harness = heldPastBound();
    let forwardedBeforeResume = 0;
    reopenedBehindClose(harness, () => {
      harness.route('r2', 'b', { chatId: 'y' });
      forwardedBeforeResume = registryOf(harness, 'chatRequested').length;
    });
    harness.loaded();
    harness.clock.increment(openPatienceMilliseconds);

    // The resumed open carried chat `x`, so `y` goes to the new session again.
    expect(harness.state()).toBe('focused');
    expect(registryOf(harness, 'chatRequested').slice(forwardedBeforeResume)).toEqual([
      { type: 'chatRequested', projectId: 'b', chatId: 'y' },
    ]);
  });
});
