// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';
import { ChatPermissionRequest, permissionContent } from '#components/chat/chat-permission-request.js';

let isDebug = false;
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => isDebug }));
const approval: AgentHostApproval = {
  interruptId: 'request-1',
  kind: 'approval',
  prompt: 'Allow shell with {"cmd":"pnpm test"}?',
  request: { title: 'Run the checks', input: { cmd: 'pnpm test', cwd: '/project', diagnostic: 'private detail' } },
  options: [
    { optionId: 'once', kind: 'allow_once', name: 'Allow' },
    { optionId: 'session', kind: 'allow_always', name: 'Allow for this session' },
    { optionId: 'deny', kind: 'reject_once', name: 'Deny once' },
    { optionId: 'block', kind: 'reject_always', name: 'Always deny' },
  ],
};
beforeEach(() => {
  isDebug = false;
});
describe('compact permission requests', () => {
  it('keeps exact commands visible with raw arguments only behind Debug', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatPermissionRequest approval={approval} name='Codex' />);
    expect(screen.getByText('Run the checks')).toBeInTheDocument();
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request details' })).toBeNull();
    expect(screen.queryByText(/private detail/u)).toBeNull();
    isDebug = true;
    rerender(<ChatPermissionRequest approval={approval} name='Codex' />);
    expect(screen.queryByText(/private detail/u)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Request details' }));
    expect(screen.getByText(/private detail/u)).toBeInTheDocument();
    isDebug = false;
    rerender(<ChatPermissionRequest approval={approval} name='Codex' />);
    expect(screen.queryByText(/private detail/u)).toBeNull();
  });
  it.each(approval.options)('should mark only $name busy until the durable record settles', async (option) => {
    const pending = Promise.withResolvers<void>();
    const respond = vi.fn(async () => pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(<ChatPermissionRequest approval={approval} name='Codex' onRespond={respond} />);
    await user.click(screen.getByRole('button', { name: option.name }));
    expect(screen.getByRole('button', { name: option.name, busy: true })).toBeDisabled();
    expect(screen.getAllByRole('button', { busy: true })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: option.name }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(option.kind?.startsWith('allow'), option.optionId);
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(screen.getByRole('button', { name: option.name, busy: true })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('waiting for confirmation');
    rerender(
      <ChatPermissionRequest
        approval={approval}
        name='Codex'
        outcome={option.kind?.startsWith('allow') ? 'approved' : 'denied'}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it.each([
    { label: 'Approve', approved: true },
    { label: 'Deny', approved: false },
  ])('should show busy feedback for the fallback $label action', async ({ label, approved }) => {
    const respond = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<ChatPermissionRequest approval={{ ...approval, options: [] }} name='Tau' onRespond={respond} />);
    await user.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('button', { name: label, busy: true })).toBeDisabled();
    expect(screen.getAllByRole('button', { busy: true })).toHaveLength(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(approved, undefined);
  });
  it('retains the request and permits retry after a failed response', async () => {
    const respond = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('raw host detail'))
      .mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ChatPermissionRequest approval={approval} name='Codex' onRespond={respond} />);
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Try again');
    });
    expect(screen.queryByText(/raw host detail/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Allow', busy: false })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    expect(respond).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Allow', busy: true })).toBeDisabled();
  });
  it('should reset selection when a new interrupt replaces a pending request', async () => {
    const pending = Promise.withResolvers<void>();
    const respond = vi.fn(async () => pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(<ChatPermissionRequest approval={approval} name='Codex' onRespond={respond} />);
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    rerender(
      <ChatPermissionRequest approval={{ ...approval, interruptId: 'request-2' }} name='Codex' onRespond={respond} />,
    );
    expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      pending.reject(new Error('Old request disconnected'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each(['approved', 'denied', 'cancelled'])(
    'should retain durable %s after a late response rejection',
    async (outcome) => {
      const pending = Promise.withResolvers<void>();
      const respond = vi.fn(async () => pending.promise);
      const user = userEvent.setup();
      const { rerender } = render(<ChatPermissionRequest approval={approval} name='Codex' onRespond={respond} />);
      await user.click(screen.getByRole('button', { name: 'Allow' }));
      rerender(<ChatPermissionRequest approval={approval} name='Codex' outcome={outcome} onRespond={respond} />);
      await act(async () => {
        pending.reject(new Error('Response acknowledgement lost'));
      });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it('should keep machine review separate and disable it while Deny is pending', async () => {
    const review = vi.fn();
    const respond = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <ChatPermissionRequest
        approval={{ ...approval, options: [] }}
        name='Tau'
        onRespond={respond}
        review={{ label: 'Review in Print', onClick: review }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(screen.getByRole('button', { name: 'Review in Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny', busy: true })).toBeDisabled();
    expect(review).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledExactlyOnceWith(false, undefined);
  });
  it.each(['approved', 'denied'])(
    'should distinguish recorded provider decisions from saved policy for %s',
    (outcome) => {
      render(
        <ChatPermissionRequest
          approval={{
            ...approval,
            providerPermission: {
              owner: 'provider',
              persistence: 'unverified',
              options: [{ optionId: 'session', requestedScope: 'session' }],
            },
          }}
          name='Codex'
          outcome={outcome}
        />,
      );
      expect(screen.getByText('Response recorded · provider saving unverified')).toBeInTheDocument();
      expect(screen.queryByText('Request allowed')).toBeNull();
      expect(screen.queryByText(/response sent|permission saved/iu)).toBeNull();
    },
  );
  it.each(['approved', 'denied', 'cancelled'])(
    'retains a settled %s record without consent actions or diagnostics',
    (outcome) => {
      render(<ChatPermissionRequest approval={approval} name='Codex' outcome={outcome} />);
      expect(screen.getByText('Run the checks')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it('preserves machine consequences, unknown requests and old payload-free summaries', () => {
    expect(
      permissionContent({ ...approval, context: { machineId: 'printer', jobId: 'job-1', fileName: 'bracket.3mf' } })
        .consequence,
    ).toBe('This starts a job on a physical machine.');
    expect(permissionContent({ ...approval, context: { machineId: 'printer' } }).consequence).toBe(
      'This acts on a physical machine.',
    );
    expect(permissionContent({ ...approval, request: undefined }).title).toBe('Allow shell');
    expect(permissionContent({ ...approval, request: undefined, prompt: 'Allow call_unknown?' }).consequence).toContain(
      'describe this action',
    );
  });
});
