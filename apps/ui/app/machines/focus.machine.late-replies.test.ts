/**
 * Focus machine rows for replies that arrive after the answer that ended them (plan § 4 A5a; README rule 9).
 * Split from `focus.machine.test.ts` to keep each file within the line limit.
 */
import { describe, expect, it } from 'vitest';
import { createFocusHarness } from '#machines/focus.machine.test.fixture.js';

describe('focus: a person open whose wait reply follows a held answer', () => {
  it("should withdraw a person's open of a project whose wait reply arrives after a held answer for it (rule 9)", () => {
    const harness = createFocusHarness();
    harness.focusOn('r1', 'a');
    harness.route('r2', 'b');
    harness.ready('r2', 'b');
    harness.settleFlush(true);
    harness.facts('b', 'live');
    harness.settleOpen('live');
    harness.route('r3', 'a');
    harness.send({ type: 'openRequested', projectId: 'a' });
    const personOpen = harness.lastOpen();
    const before = harness.ofType('registry', 'cancelPendingOpen').length;
    harness.answer('r3', { status: 'unavailable' });

    expect(harness.state()).toBe('held');

    harness.settleOpen('waiting', personOpen.requestId);

    expect(harness.ofType('registry', 'cancelPendingOpen')).toHaveLength(before + 1);
    expect(harness.context().pending).toBeUndefined();
  });
});
