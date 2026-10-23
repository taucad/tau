// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ForeignRun } from '@taucad/agent-host';

/**
 * A chat whose run is in flight on another of the person's devices (cross-device chat handoff, XD3): the composer
 * says where it runs and offers nothing, because that run cannot be moved or stopped from here.
 */
const harness = vi.hoisted((): { runElsewhere: ForeignRun | undefined } => ({
  runElsewhere: undefined,
}));

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ runElsewhere: harness.runElsewhere }),
}));

const { ChatRunElsewhereNotice } = await import('#components/chat/chat-run-elsewhere-notice.js');

const running: ForeignRun = {
  deviceId: 'device-desktop',
  runId: 'run-desktop',
  state: 'running',
  lastRecordedAt: Date.parse('2026-10-23T10:00:00.000Z'),
  tip: { leaderEpoch: 'epoch-desktop', sequence: 2 },
};

beforeEach(() => {
  harness.runElsewhere = undefined;
});

describe('ChatRunElsewhereNotice', () => {
  it('should say the chat is running on another device, with no action', () => {
    harness.runElsewhere = running;

    render(<ChatRunElsewhereNotice />);

    const notice = screen.getByRole('status', {
      name: 'Running on another device',
    });
    expect(notice).toHaveTextContent('You can send here once that reply finishes.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should say the other device is waiting for an answer when its run is paused', () => {
    harness.runElsewhere = { ...running, state: 'paused' };

    render(<ChatRunElsewhereNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('waiting for an answer on another of your devices');
  });

  it('should render nothing while no other device runs the chat', () => {
    const { container } = render(<ChatRunElsewhereNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
