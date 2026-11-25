// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ShellOutput, ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolShell } from '#routes/w.$workspace.$project/chat-message-tool-shell.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({ ChatToolError: () => <div role='alert' /> }));
vi.mock('@taucad/files-ui/components/files/file-link', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

type ShellInvocation = ToolInvocation<typeof toolName.shell>;

const stream = { text: '', bytes: 0, truncated: false, undecodable: false };

const ran = (output: ShellOutput): ShellInvocation => ({
  toolCallId: 'shell-1',
  state: 'output-available',
  input: { command: 'pnpm test', cwd: '' },
  output,
});

afterEach(cleanup);

describe('ChatMessageToolShell', () => {
  it('should rest closed and say Ran for a command that exited 0', () => {
    render(
      <ChatMessageToolShell
        part={ran({ status: 'completed', exitCode: 0, stdout: stream, stderr: stream, durationMs: 1 })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ran pnpm test' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('should name a command that did not succeed in the verb of its closed row', () => {
    const exited = render(
      <ChatMessageToolShell
        part={ran({ status: 'completed', exitCode: 1, stdout: stream, stderr: stream, durationMs: 1 })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Attempted pnpm test' })).toHaveAttribute('aria-expanded', 'false');
    exited.unmount();

    render(<ChatMessageToolShell part={ran({ status: 'cancelled', stdout: stream, stderr: stream, durationMs: 1 })} />);
    expect(screen.getByRole('button', { name: 'Attempted pnpm test' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('should keep the refusal title for a command that never started', () => {
    render(<ChatMessageToolShell part={ran({ status: 'not-started', code: 'access-denied', message: 'No.' })} />);

    expect(screen.getByRole('button', { name: 'Access denied pnpm test' })).toHaveAttribute('aria-expanded', 'false');
  });
});
