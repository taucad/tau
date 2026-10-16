// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
    { optionId: 'deny', kind: 'reject_once', name: 'Deny once' },
    { optionId: 'block', kind: 'reject_always', name: 'Always deny' },
  ],
};
beforeEach(() => {
  isDebug = false;
  machinesEnabled = true;
});
describe('compact permission requests', () => {
  it.each([
    { optionId: 'always-allow', kind: 'allow_always', name: 'always allow', label: 'Always allow', allowed: true },
    { optionId: 'allow-once', kind: 'allow_once', name: 'allow once', label: 'Allow once', allowed: true },
    { optionId: 'reject-once', kind: 'reject_once', name: 'reject once', label: 'Deny', allowed: false },
  ] as const)(
    'should label Grok $optionId clearly without changing its decision',
    async ({ optionId, kind, name, label, allowed }) => {
      const respond = vi.fn(async () => undefined);
      render(
        <ChatPermissionRequest
          approval={{ ...approval, agentId: 'grok', options: [{ optionId, kind, name }] }}
          name='Grok Build'
          onRespond={respond}
        />,
      );
      const user = userEvent.setup();
      const button = screen.getByRole('button', { name: label });
      button.focus();
      await user.keyboard('{Enter}');
      expect(respond).toHaveBeenCalledExactlyOnceWith(allowed, optionId);
      expect(button).toBeDisabled();
    },
  );
  it('should preserve scoped and other agents’ permission labels', () => {
    const request = {
      ...approval,
      agentId: 'grok',
      options: [{ optionId: 'always-allow', kind: 'allow_always', name: 'Allow this tool for this project' }],
    };
    const respond = vi.fn(async () => undefined);
    const { rerender } = render(<ChatPermissionRequest approval={request} name='Grok Build' onRespond={respond} />);
    expect(screen.getByRole('button', { name: 'Allow this tool for this project' })).toBeInTheDocument();
    rerender(
      <ChatPermissionRequest
        approval={{
          ...request,
          agentId: 'codex',
          options: [{ optionId: 'allow-once', kind: 'allow_once', name: 'allow once' }],
        }}
        name='Codex'
        onRespond={respond}
      />,
    );
    expect(screen.getByRole('button', { name: 'allow once' })).toBeInTheDocument();
  });
  it.each([
    ['tau__evaluate_model', 'Render model'],
    ['tau__test_model', 'Run tests'],
    ['mcp__tau__screenshot', 'Capture screenshots'],
    ['tau__unknown_tool', 'tau__unknown_tool'],
    ['Review the proposed model', 'Review the proposed model'],
  ])('presents %s without losing the requested file', async (title, expected) => {
    const request = { ...approval, request: { title, input: { targetFile: 'main.py' } } };
    const { rerender } = render(<ChatPermissionRequest approval={request} name='Grok Build' />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'View request' }));
    expect(screen.getByText('main.py')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide request' }));
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
    expect(screen.getByRole('button', { name: 'Deny', busy: true })).toBeDisabled();
  });
  it('keeps exact commands inspectable with raw arguments only behind Debug', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatPermissionRequest approval={approval} name='Codex' />);
    expect(screen.getByText('Run the checks')).toBeInTheDocument();
    expect(screen.queryByText('pnpm test')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View request' }));
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
    expect(screen.getByRole('status')).toHaveTextContent('Sending response…');
    rerender(
      <ChatPermissionRequest
        approval={approval}
        name='Codex'
        outcome={option.kind?.startsWith('allow') ? 'approved' : 'denied'}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View request' })).toBeVisible();
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
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send your response. Try again.");
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
      expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
      expect(screen.getByRole('button', { name: 'View request' })).toBeVisible();
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
        onReview={review}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(screen.getByRole('button', { name: 'Review in the Print pane' })).toBeDisabled();
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
      expect(screen.getByText('Response recorded · saving unverified')).toBeInTheDocument();
      expect(screen.queryByText('Request allowed')).toBeNull();
      expect(screen.queryByText(/response sent|permission saved/iu)).toBeNull();
    },
  );
  it('should retain a session choice as a request when history is reopened', () => {
    const storedApproval: AgentHostApproval = {
      ...approval,
      providerPermission: {
        owner: 'provider',
        persistence: 'unverified',
        options: [{ optionId: 'session', requestedScope: 'session' }],
      },
    };
    render(
      <ChatPermissionRequest
        approval={storedApproval}
        name='Codex'
        outcome='approved'
        resolution={{ outcome: 'approved', optionId: 'session' }}
      />,
    );
    expect(screen.getByText('Session approval requested')).toBeInTheDocument();
    expect(screen.queryByText(/saved|ask again|repeated|session ended/iu)).toBeNull();
  });
  it.each([
    {
      stored: 'present',
      effective: 'allowed',
      reason: 'policy-observed',
      expected: 'Allowed in Codex settings when checked',
    },
    {
      stored: 'present',
      effective: 'unknown',
      reason: 'policy-observed',
      expected: 'Preference found · approval unverified',
    },
    {
      stored: 'present',
      effective: 'overridden',
      reason: 'policy-overridden',
      expected: 'Preference found · overridden when checked',
    },
    {
      stored: 'absent',
      effective: 'unknown',
      reason: 'policy-absent',
      expected: 'Preference not found in Codex settings',
    },
    {
      stored: 'unknown',
      effective: 'unknown',
      reason: 'config-read-failed',
      expected: 'Response recorded · saving unverified',
    },
  ] as const)(
    'should render observed provider policy without claiming a new save: $stored/$effective',
    ({ stored, effective, reason, expected }) => {
      render(
        <ChatPermissionRequest
          approval={{
            ...approval,
            providerPermission: {
              owner: 'provider',
              persistence: 'unverified',
              options: [{ optionId: 'allow_always', requestedScope: 'persistent' }],
            },
          }}
          name='Codex'
          outcome='approved'
          resolution={{
            outcome: 'approved',
            optionId: 'allow_always',
            observation: {
              version: 1,
              provider: 'codex',
              optionId: 'allow_always',
              toolCallId: 'call-1',
              requestedScope: 'persistent',
              stored,
              effective,
              preexisting: 'unknown',
              observation: 'config-readback',
              reason,
            },
          }}
        />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/successfully saved|saved permission/iu)).toBeNull();
    },
  );
  it('should distinguish a stored Grok preference from effective approval', () => {
    render(
      <ChatPermissionRequest
        approval={{
          ...approval,
          providerPermission: {
            owner: 'provider',
            persistence: 'unverified',
            readback: 'permission-file',
            options: [{ optionId: 'always-allow', requestedScope: 'persistent' }],
          },
        }}
        name='Grok'
        resolution={{
          outcome: 'approved',
          optionId: 'always-allow',
          observation: {
            version: 1,
            provider: 'grok',
            optionId: 'always-allow',
            toolCallId: 'call-grok',
            requestedScope: 'persistent',
            stored: 'present',
            effective: 'unknown',
            preexisting: false,
            observation: 'permission-file-readback',
            layerKind: 'project',
            reason: 'policy-observed',
          },
        }}
      />,
    );
    expect(screen.getByText('Preference found · approval unverified')).toBeInTheDocument();
    expect(screen.queryByText(/Allowed in Grok settings|permission saved/iu)).toBeNull();
  });
  it('should retain the selected once scope after remount without suggesting a policy save', () => {
    render(
      <ChatPermissionRequest
        approval={{
          ...approval,
          providerPermission: {
            owner: 'provider',
            persistence: 'unverified',
            options: [{ optionId: 'once', requestedScope: 'once' }],
          },
        }}
        name='Codex'
        resolution={{ outcome: 'approved', optionId: 'once' }}
      />,
    );
    expect(screen.getByText('Allowed once · response recorded')).toBeInTheDocument();
    expect(screen.queryByText(/saving/iu)).toBeNull();
  });
  it('should explain unavailable persistent approval before selection', () => {
    render(
      <ChatPermissionRequest
        approval={{
          ...approval,
          providerPermission: {
            owner: 'provider',
            persistence: 'unverified',
            readback: 'unsupported',
            unsupportedReason: 'unconfigured-mcp-server',
            options: [],
          },
        }}
        name='Codex'
        onRespond={vi.fn()}
      />,
    );
    expect(
      screen.getByText('This temporary connection supports approval for this request or session.'),
    ).toBeInTheDocument();
  });
  it('should not apply an observation to a different selected option', () => {
    render(
      <ChatPermissionRequest
        approval={{
          ...approval,
          providerPermission: {
            owner: 'provider',
            persistence: 'unverified',
            options: [{ optionId: 'once', requestedScope: 'once' }],
          },
        }}
        name='Codex'
        resolution={{
          outcome: 'approved',
          optionId: 'once',
          observation: {
            version: 1,
            provider: 'codex',
            optionId: 'allow_always',
            toolCallId: 'call-1',
            requestedScope: 'persistent',
            stored: 'present',
            effective: 'allowed',
            preexisting: false,
            observation: 'config-readback',
            reason: 'policy-observed',
          },
        }}
      />,
    );
    expect(screen.getByText('Allowed once · response recorded')).toBeInTheDocument();
    expect(screen.queryByText('Allowed in Codex settings when checked')).toBeNull();
  });
  it.each(['approved', 'denied', 'cancelled'])(
    'retains a settled %s record without consent actions or diagnostics',
    (outcome) => {
      render(<ChatPermissionRequest approval={approval} name='Codex' outcome={outcome} />);
      expect(screen.getByText('Run the checks')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
      expect(screen.getByRole('button', { name: 'View request' })).toBeVisible();
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

describe('request inspection disclosure', () => {
  it('keeps exact long requests accessible without Debug and preserves inspection through settlement', async () => {
    const user = userEvent.setup();
    const command = `python3 << 'PY'\n${'print("inspection")\n'.repeat(60)}PY`;
    const request = { ...approval, request: { title: `Execute ${command}`, input: { command, cwd: '/workspace' } } };
    const { rerender } = render(
      <ChatPermissionRequest approval={request} name='Grok' onRespond={async () => undefined} />,
    );
    expect(screen.queryByRole('region', { name: 'Request content' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View request' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Allow' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'View request' }));
    expect(screen.getByRole('region', { name: 'Request content' })).toHaveTextContent('print("inspection")');
    expect(screen.getByRole('region', { name: 'Request content' }).textContent).toContain(command);
    rerender(<ChatPermissionRequest approval={request} name='Grok' outcome='approved' />);
    expect(screen.getByRole('button', { name: 'Hide request' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Request content' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hide request' }));
    expect(screen.queryByRole('region', { name: 'Request content' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request details' })).toBeNull();
  });
  it('does not add an empty disclosure to a short request', () => {
    render(
      <ChatPermissionRequest approval={{ ...approval, request: undefined, prompt: 'Read metadata' }} name='Grok' />,
    );
    expect(screen.getByText('Read metadata')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'View request' })).toBeNull();
  });
});
