import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { turnIntentOf } from '#chat-clients/turn-intent.js';

const message = (id: string, role: 'user' | 'assistant'): MyUIMessage =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a transcript row is `id` and `role` as far as the rewind point is concerned.
  ({ id, role, parts: [{ type: 'text', text: id }] }) as MyUIMessage;

/** One completed turn, then a second whose user message the provider refused. */
const refusedSecondTurn = [message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user')];

describe('turnIntentOf', () => {
  it('should admit a fresh send as a submit that leases its own message', () => {
    expect(turnIntentOf([], { kind: 'send', messageId: 'u1' })).toEqual({ trigger: 'submit', leaseTurnId: 'u1' });
  });

  it('should admit a seeded first turn as a submit', () => {
    expect(turnIntentOf([message('u1', 'user')], { kind: 'regenerate' })).toEqual({
      trigger: 'submit',
      leaseTurnId: 'u1',
    });
  });

  it('should admit an empty transcript as a submit with no lease', () => {
    expect(turnIntentOf([], { kind: 'regenerate' })).toEqual({ trigger: 'submit', leaseTurnId: undefined });
  });

  it('should rewind a completed tail to its own user message', () => {
    expect(turnIntentOf([message('u1', 'user'), message('a1', 'assistant')], { kind: 'regenerate' })).toEqual({
      trigger: 'regenerate',
      leaseTurnId: 'u1',
      retainedMessageIds: [],
    });
  });

  it('should rewind a refused later turn to that turn, not to the previous reply', () => {
    /* The defect this row exists for: deriving from the last *assistant*
     * message leased `u1` and retained nothing, so the host was handed a
     * transcript ending in `u2` over a prefix it had already moved past. */
    expect(turnIntentOf(refusedSecondTurn, { kind: 'regenerate' })).toEqual({
      trigger: 'regenerate',
      leaseTurnId: 'u2',
      retainedMessageIds: ['u1', 'a1'],
    });
  });

  it('should retain nothing when the first message is edited', () => {
    expect(turnIntentOf(refusedSecondTurn, { kind: 'edit', messageId: 'u1' })).toEqual({
      trigger: 'edit',
      leaseTurnId: 'u1',
      retainedMessageIds: [],
    });
  });

  it('should retain the whole prefix when a later message is edited', () => {
    expect(turnIntentOf(refusedSecondTurn, { kind: 'edit', messageId: 'u2' })).toEqual({
      trigger: 'edit',
      leaseTurnId: 'u2',
      retainedMessageIds: ['u1', 'a1'],
    });
  });

  /* T3-D5: an edit is admitted seconds after the gesture — a reattach rebuilds
   * the transcript and a stop truncates its tail. Clamping the missing index to
   * 0 leased a checkout and minted a run id for a rewind point that does not
   * exist, and the dispatcher then returned silently: lifecycle wedged in
   * `invoking`, lease held forever. A turn with no rewind point is refused. */
  it('should refuse an edit for a message the transcript no longer holds', () => {
    expect(() => turnIntentOf(refusedSecondTurn, { kind: 'edit', messageId: 'gone' })).toThrow(
      /no longer in this chat/u,
    );
  });
});
