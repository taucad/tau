/**
 * Focus machine rows for the chat focus gives a session (plan § 4 A5a; README rules 2 and 13; I18): a late chat
 * resolution is matched to the chat it answers, and a person's open that asked the library first keeps the chat.
 * Split from `focus.machine.test.ts` to keep each file within the line limit.
 */
import { describe, expect, it } from 'vitest';
import { createFocusHarness } from '#machines/focus.machine.test.fixture.js';

describe('focus: the chat a session is given', () => {
  it('should ignore a late chat resolution for a chat the route has already switched away from (I18)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-x' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.route('r2', 'a', { chatId: 'chat-y' });
    harness.send({ type: 'focusedChatResolved', projectId: 'a', requestedChatId: 'chat-x', chatId: 'chat-x' });

    expect(harness.state()).toBe('focused');
    expect(harness.sent.route).toEqual([]);
    expect(harness.context().kept['a']?.chatId).toBe('chat-y');
    expect(harness.context().forwarded['a']?.chatId).toBe('chat-y');
  });

  it("should carry the route's chat in a person's open that asked the library first", () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-y' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.send({ type: 'openRequested', projectId: 'a' });
    const asked = harness.lastAsked();
    harness.ready('r1', 'a', 1);
    harness.ready(asked.requestId, 'a', 1);

    expect(harness.lastOpen().request).toMatchObject({ chatId: 'chat-y', epoch: 1 });
    expect(harness.context().kept['a']?.chatId).toBe('chat-y');
  });

  it("should spawn the reopened session with the route's chat when the person reopens after a library change", () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-y' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live');
    harness.settleOpen('live');
    harness.facts('a', 'absent', { chatReady: false, availability: 'pending' });
    harness.send({ type: 'libraryChanged', revision: 1 });
    harness.send({ type: 'openRequested', projectId: 'a' });
    const asked = harness.lastAsked();
    harness.ready(asked.requestId, 'a', 1);

    expect(harness.lastOpen()).toMatchObject({ projectId: 'a', request: { chatId: 'chat-y', epoch: 1 } });
  });
});
