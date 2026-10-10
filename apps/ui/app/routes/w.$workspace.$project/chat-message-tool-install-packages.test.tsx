// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolInstallPackages } from '#routes/w.$workspace.$project/chat-message-tool-install-packages.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText, noun }: { readonly errorText: string; readonly noun: string }) => (
    <div role='alert'>
      {noun}: {errorText}
    </div>
  ),
}));

type InstallPackagesInvocation = ToolInvocation<typeof toolName.installPackages>;

afterEach(cleanup);

describe('ChatMessageToolInstallPackages', () => {
  it('should fold an install with no issues and disclose the locked packages by keyboard', async () => {
    const part: InstallPackagesInvocation = {
      toolCallId: 'install-1',
      state: 'output-available',
      input: { add: { alea: '^1.0.1', 'simplex-noise': '^4.0.3' } },
      output: {
        manifestChanged: true,
        lockChanged: true,
        packages: [
          { name: 'alea', version: '1.0.1', path: 'node_modules/alea' },
          { name: 'simplex-noise', version: '4.0.3', path: 'node_modules/simplex-noise' },
        ],
        issues: [],
      },
    };
    render(<ChatMessageToolInstallPackages part={part} />);

    const toggle = screen.getByRole('button', { name: 'Packages · 2 packages' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await userEvent.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('simplex-noise').parentElement).toHaveTextContent('simplex-noise 4.0.3');
  });

  it('should open on a refusal and show its recovery message', () => {
    const message = "No published version of 'simplex-noise' matches '^9.0.0'. Change the range in package.json.";
    render(
      <ChatMessageToolInstallPackages
        part={{
          toolCallId: 'install-1',
          state: 'output-available',
          input: { add: { 'simplex-noise': '^9.0.0' } },
          output: {
            manifestChanged: false,
            lockChanged: false,
            packages: [],
            issues: [{ code: 'no-matching-version', name: 'simplex-noise', message }],
          },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Packages · 0 packages · 1 issue' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(message, { exact: false }).parentElement).toHaveTextContent(
      `no-matching-version: ${message}`,
    );
  });

  it('should show the active verb while installing', () => {
    render(<ChatMessageToolInstallPackages part={{ toolCallId: 'install-1', state: 'input-available', input: {} }} />);
    expect(screen.getByText('Installing')).toBeVisible();
    expect(screen.getByText('packages…')).toBeVisible();
  });

  it('should hand a failure to the shared tool error with its noun', () => {
    render(
      <ChatMessageToolInstallPackages
        part={{ toolCallId: 'install-1', state: 'output-error', input: {}, errorText: 'EROFS' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('package install: EROFS');
  });
});
