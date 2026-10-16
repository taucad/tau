// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';
import { ChatPermissionRequest, permissionContent } from '#components/chat/chat-permission-request.js';

let isDebug = false;
let machinesEnabled = true;
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => (flag === 'machines' ? machinesEnabled : isDebug),
}));
const approval: AgentHostApproval = {
  interruptId: 'request-1',
  kind: 'approval',
  prompt: 'Allow shell with {"cmd":"pnpm test"}?',
  request: { title: 'Run the checks', input: { cmd: 'pnpm test', cwd: '/project', diagnostic: 'private detail' } },
  options: [
    { optionId: 'once', kind: 'allow_once', name: 'Allow' },
    { optionId: 'session', kind: 'allow_always', name: 'Allow for this session' },
  ],
};
beforeEach(() => {
  isDebug = false;
  machinesEnabled = true;
});
describe('compact permission requests', () => {
  it.each([
    ['tau__evaluate_model', 'Render model'],
    ['tau__test_model', 'Run tests'],
    ['mcp__tau__screenshot', 'Capture screenshots'],
    ['tau__unknown_tool', 'tau__unknown_tool'],
    ['Review the proposed model', 'Review the proposed model'],
  ])('presents %s without losing the requested file', (title, expected) => {
    const request = { ...approval, request: { title, input: { targetFile: 'main.py' } } };
    const { rerender } = render(<ChatPermissionRequest approval={request} name='Grok Build' />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByText('main.py')).toBeInTheDocument();
    rerender(<ChatPermissionRequest approval={request} name='Grok Build' outcome='approved' />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByText('Request allowed')).toBeInTheDocument();
  });
  it('offers only denial for a stored machine approval while disabled', async () => {
    machinesEnabled = false;
    const onRespond = vi.fn(async () => undefined);
    const onReview = vi.fn();
    render(
      <ChatPermissionRequest
        approval={{ ...approval, context: { machineId: 'mill', jobId: 'job' } }}
        name='Tau'
        onRespond={onRespond}
        onReview={onReview}
      />,
    );
    expect(screen.getByText('Machines are not available in this release.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Allow|Review/u })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Deny' }));
    expect(onRespond).toHaveBeenCalledWith(false, undefined);
    expect(onReview).not.toHaveBeenCalled();
  });
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
    machinesEnabled = true;
    rerender(<ChatPermissionRequest approval={approval} name='Codex' />);
    expect(screen.queryByText(/private detail/u)).toBeNull();
  });
  it('blocks repeated responses until the durable record settles', async () => {
    const respond = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<ChatPermissionRequest approval={approval} name='Codex' onRespond={respond} />);
    await user.click(screen.getByRole('button', { name: 'Allow for this session' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(true, 'session');
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('waiting for confirmation');
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
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    expect(respond).toHaveBeenCalledTimes(2);
  });
  it.each(['approved', 'denied', 'cancelled'])(
    'retains a settled %s record without consent actions or diagnostics',
    (outcome) => {
      render(<ChatPermissionRequest approval={approval} name='Codex' outcome={outcome} />);
      expect(screen.getByText('Run the checks')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it('preserves generic machine consequences, unknown requests and old payload-free summaries', () => {
    expect(
      permissionContent({ ...approval, context: { machineId: 'printer', fileName: 'bracket.3mf' } }).consequence,
    ).toBe('This changes the machine. Review the action before allowing it.');
    expect(permissionContent({ ...approval, request: undefined }).title).toBe('Allow shell');
    expect(permissionContent({ ...approval, request: undefined, prompt: 'Allow call_unknown?' }).consequence).toContain(
      'describe this action',
    );
  });
});
