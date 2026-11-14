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

  it('should ignore a resolution of the old chat while the starting session has not been given the new one (I18)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-x' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.settleOpen('live');
    harness.facts('a', 'starting', { chatReady: false, availability: 'pending' });
    harness.route('r2', 'a', { chatId: 'chat-y' });
    harness.send({ type: 'focusedChatResolved', projectId: 'a', requestedChatId: 'chat-x', chatId: 'chat-x' });

    expect(harness.sent.route).toEqual([]);
    expect(harness.context().kept['a']?.chatId).toBe('chat-y');
  });

  it('should ignore a resolution of the old chat while its open is still unanswered (I18)', () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-x' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.facts('a', 'live', { chatReady: false, availability: 'pending' });
    harness.route('r2', 'a', { chatId: 'chat-y' });
    harness.send({ type: 'focusedChatResolved', projectId: 'a', requestedChatId: 'chat-x', chatId: 'chat-x' });

    expect(harness.sent.route).toEqual([]);
  });

  it("should show a chat the person picks in the editor after the URL took the session's chat", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.send({ type: 'focusedChatResolved', projectId: 'a', chatId: 'chat-9' });
    harness.route('r2', 'a', { chatId: 'chat-9' });
    harness.send({ type: 'focusedChatResolved', projectId: 'a', requestedChatId: 'chat-9', chatId: 'chat-10' });

    expect(harness.sent.route.at(-1)).toEqual({ type: 'chatShown', projectId: 'a', chatId: 'chat-10' });
    expect(harness.context().kept['a']?.chatId).toBe('chat-10');
  });

  it("should show the editor's correction of the route's chat before the session was given that chat", () => {
    const harness = createFocusHarness();
    harness.route('r1', 'a', { chatId: 'chat-x' });
    harness.ready('r1', 'a');
    harness.loaded();
    harness.route('r2', 'a', { chatId: 'chat-y' });
    harness.send({ type: 'focusedChatResolved', projectId: 'a', requestedChatId: 'chat-y', chatId: 'chat-z' });

    expect(harness.sent.route).toEqual([{ type: 'chatShown', projectId: 'a', chatId: 'chat-z' }]);
  });

  it("should take a same-project request's workspace into the request it keeps", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'a', { slugs: { workspaceSlug: 'moved', projectSlug: 'a' } });

    expect(harness.context().kept['a']?.workspace).toBe('moved');
  });
});
