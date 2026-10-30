import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissCrashFeedback,
  isPromptableKill,
  offerCrashFeedback,
  readCrashFeedbackOffer,
  resetCrashFeedback,
  submitCrashFeedback,
  subscribeCrashFeedback,
  crashFeedbackMessageLimit,
} from '#lib/crash-feedback.js';
import { reportUiFeedback } from '#lib/error-reporting.js';
import type { DetectedMemoryKill } from '#lib/memory-kill-signal.js';

vi.mock('#lib/error-reporting.js', () => ({ reportUiFeedback: vi.fn(async () => true) }));

const kill = (over: Partial<DetectedMemoryKill> = {}): DetectedMemoryKill => ({
  id: '1000-9000',
  classification: 'foreground',
  route: 'routes/w.$workspace.$project',
  path: '/w/a/b',
  buildId: '1793324757615',
  deviceClass: 'constrained',
  liveProjectCount: 1,
  chatCount: 0,
  lastActivity: 'render',
  aliveForMilliseconds: 8000,
  consecutiveKills: 1,
  trail: [],
  ...over,
});

afterEach(() => {
  resetCrashFeedback();
  vi.mocked(reportUiFeedback).mockClear();
});

describe('crash feedback offer (SB12, D9)', () => {
  it('asks only about a kill the person was looking at, and never during a kill loop', () => {
    expect(isPromptableKill(kill())).toBe(true);
    expect(isPromptableKill(kill({ classification: 'background' }))).toBe(false);
    expect(isPromptableKill(kill({ classification: 'unknown' }))).toBe(false);
    expect(isPromptableKill(kill({ consecutiveKills: 2 }))).toBe(false);
  });

  it('offers the prompt once per tab, however many kills follow', () => {
    const seen = vi.fn();
    subscribeCrashFeedback(seen);

    offerCrashFeedback(kill(), 'event-1');
    expect(readCrashFeedbackOffer()).toEqual({ classification: 'foreground', eventId: 'event-1' });
    expect(seen).toHaveBeenCalledTimes(1);

    dismissCrashFeedback();
    offerCrashFeedback(kill({ id: '2000-3000' }), 'event-2');

    expect(readCrashFeedbackOffer()).toBeUndefined();
  });

  it('does not offer the prompt for a kill it should not ask about', () => {
    offerCrashFeedback(kill({ classification: 'background' }), 'event-1');

    expect(readCrashFeedbackOffer()).toBeUndefined();
  });

  it('sends the message as feedback on that kill’s event, with an email only when one was given', async () => {
    offerCrashFeedback(kill(), 'event-1');

    await expect(submitCrashFeedback({ message: '  rendering a big assembly  ' })).resolves.toBe(true);

    expect(reportUiFeedback).toHaveBeenCalledWith({
      message: 'rendering a big assembly',
      associatedEventId: 'event-1',
    });
    /* Answered: the prompt is gone. */
    expect(readCrashFeedbackOffer()).toBeUndefined();
  });

  it('sends the email when the person chose to leave one', async () => {
    offerCrashFeedback(kill(), 'event-1');

    await submitCrashFeedback({ message: 'export froze', email: ' someone@example.com ' });

    expect(reportUiFeedback).toHaveBeenCalledWith({
      message: 'export froze',
      email: 'someone@example.com',
      associatedEventId: 'event-1',
    });
  });

  it('sends nothing for an empty message, and nothing at all once dismissed', async () => {
    offerCrashFeedback(kill(), 'event-1');

    await expect(submitCrashFeedback({ message: '   ' })).resolves.toBe(false);
    await expect(submitCrashFeedback({ message: 'too late' })).resolves.toBe(false);

    expect(reportUiFeedback).not.toHaveBeenCalled();
  });

  it('bounds the message, so one answer cannot carry a file’s worth of text', async () => {
    offerCrashFeedback(kill(), undefined);

    await submitCrashFeedback({ message: 'x'.repeat(crashFeedbackMessageLimit + 500) });

    const [sent] = vi.mocked(reportUiFeedback).mock.calls[0] ?? [];
    expect(sent?.message).toHaveLength(crashFeedbackMessageLimit);
    /* No event to attach it to: the feedback still goes, unassociated. */
    expect(sent).not.toHaveProperty('associatedEventId');
  });
});
