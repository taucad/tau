// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatMessageToolDeleteFile } from '#routes/w.$workspace.$project/chat-message-tool-delete-file.js';

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [false, vi.fn(), vi.fn()],
}));
vi.mock('#components/icons/file-extension-icon.js', () => ({ FileExtensionIcon: () => undefined }));
vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer: ({ originalContent }: { readonly originalContent: string }) => <pre>{originalContent}</pre>,
  getFirstChangedLine: () => 1,
}));
vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText }: { readonly errorText: string }) => <div role='alert'>{errorText}</div>,
}));

type DeleteInvocation = ToolInvocation<typeof toolName.deleteFile>;
type DeleteOutputAvailable = Extract<DeleteInvocation, { state: 'output-available' }>;
const completed = (targetFile = 'lib/skids.ts'): DeleteOutputAvailable => ({
  toolCallId: 'delete-1',
  state: 'output-available',
  input: { targetFile },
  output: { message: 'deleted' },
});
const renderDelete = (part: DeleteInvocation) =>
  render(
    <TooltipProvider>
      <ChatMessageToolDeleteFile part={part} />
    </TooltipProvider>,
  );
afterEach(cleanup);

describe('ChatMessageToolDeleteFile', () => {
  it('should render a minimal deletion row without an empty toggle when no snapshot exists', () => {
    renderDelete(completed());
    expect(screen.getByText('Deleted')).toBeVisible();
    expect(screen.getByText('skids.ts')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('should reveal captured removed content without offering to open the deleted file', async () => {
    const user = userEvent.setup();
    const part = completed();
    part.output.diffStats = { linesAdded: 0, linesRemoved: 1, originalContent: 'removed content', modifiedContent: '' };
    renderDelete(part);
    await user.click(screen.getByRole('button', { name: 'Deleted skids.ts -1' }));
    const card = screen.getByRole('region', { name: 'Deleted lib/skids.ts' });
    expect(within(card).getByText('removed content')).toBeVisible();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('should show the active verb and preserve its disclosure through deletion completion', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDelete({
      toolCallId: 'delete-1',
      state: 'input-available',
      input: { targetFile: 'skids.ts' },
    });
    const trigger = screen.getByRole('button', { name: 'Deleting skids.ts' });
    await user.click(trigger);
    await user.click(trigger);
    const part = completed('skids.ts');
    part.output.diffStats = { linesAdded: 0, linesRemoved: 1, originalContent: 'old', modifiedContent: '' };
    rerender(
      <TooltipProvider>
        <ChatMessageToolDeleteFile part={part} />
      </TooltipProvider>,
    );
    expect(trigger).toBe(screen.getByRole('button', { name: 'Deleted skids.ts -1' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('should preserve the shared deletion error', () => {
    renderDelete({
      toolCallId: 'delete-1',
      state: 'output-error',
      input: { targetFile: 'skids.ts' },
      errorText: 'Permission denied',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Permission denied');
  });
});
