import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrashReportPrompt } from '#components/crash-report-prompt.js';
import { offerCrashFeedback, resetCrashFeedback, submitCrashFeedback } from '#lib/crash-feedback.js';
import type * as CrashFeedbackModule from '#lib/crash-feedback.js';
import type { DetectedMemoryKill } from '#lib/memory-kill-signal.js';

vi.mock('#lib/crash-feedback.js', async (importOriginal) => {
  const original = await importOriginal<typeof CrashFeedbackModule>();
  return { ...original, submitCrashFeedback: vi.fn(original.submitCrashFeedback) };
});
vi.mock('#lib/error-reporting.js', () => ({ reportUiFeedback: vi.fn(async () => true) }));

const foregroundKill: DetectedMemoryKill = {
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
};

afterEach(() => {
  resetCrashFeedback();
  vi.mocked(submitCrashFeedback).mockClear();
});

describe('CrashReportPrompt (SB12, D9)', () => {
  it('shows nothing until a kill is offered', () => {
    render(<CrashReportPrompt />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('asks what the person was doing, and sends only what they typed', async () => {
    const person = userEvent.setup();
    offerCrashFeedback(foregroundKill, 'event-1');
    render(<CrashReportPrompt />);

    expect(screen.getByRole('heading')).toHaveTextContent('ran out of memory');
    /* Nothing is pre-filled, and nothing can be sent until they write something. */
    expect(screen.getByRole('textbox', { name: /what were you doing/iu })).toHaveValue('');
    expect(screen.getByLabelText(/email/iu)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await person.type(screen.getByRole('textbox', { name: /what were you doing/iu }), 'exporting a STEP file');
    await person.click(screen.getByRole('button', { name: 'Send' }));

    expect(submitCrashFeedback).toHaveBeenCalledWith({ message: 'exporting a STEP file', email: '' });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('sends nothing when the person closes it', async () => {
    const person = userEvent.setup();
    offerCrashFeedback(foregroundKill, 'event-1');
    render(<CrashReportPrompt />);

    await person.click(screen.getByRole('button', { name: 'Not now' }));

    expect(submitCrashFeedback).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
