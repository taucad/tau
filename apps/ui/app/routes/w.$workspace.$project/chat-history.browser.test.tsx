import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { initialChatProjection, materializeTranscript, reduceChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

vi.doMock('#hooks/use-file-manager.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOptionalFileManager: () => undefined,
}));
vi.doMock('#hooks/use-theme.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ theme: 'light' }),
}));
vi.doMock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));
const { ChatMessageToolExternal } = await import('#routes/w.$workspace.$project/chat-message-tool-external.js');

afterEach(cleanup);

it('should disclose recovered filenames and real highlighted diffs in a browser', async () => {
  const paths = ['main.cs', 'main.geospec.ts'];
  const rows = [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')];
  for (const [index, path] of paths.entries()) {
    const content = [{ type: 'diff', path, oldText: 'before\n', newText: `recovered_${String(index)}\n` }];
    const identity = {
      toolCallId: `call-${String(index)}`,
      toolName: 'applyPatch',
      metadata: { tauInternal: { kind: 'external-tool', origin: 'external' } },
    };
    const call = { toolCallId: `vendor-${String(index)}`, kind: 'edit', content };
    rows.push(
      logRow(rows.length, {
        type: 'message.appended',
        message: {
          ...identity,
          id: `in-${String(index)}`,
          role: 'tool-input',
          content: {},
          call: { ...call, status: 'pending' },
        },
      }),
    );
    rows.push(
      logRow(rows.length, {
        type: 'message.appended',
        message: {
          ...identity,
          id: `out-${String(index)}`,
          role: 'tool-output',
          content,
          call: { ...call, status: 'completed' },
          isError: false,
        },
      }),
    );
  }
  rows.push(lifecycleRow(rows.length, 'completed'));
  const projection = reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: { status: 'batch', cursor: 0, nextCursor: rows.length, endCursor: rows.length, events: rows },
  }).state;
  const messages = await materializeTranscript(projection);
  const tools = messages.flatMap((message) => message.parts).filter((part) => part.type === 'dynamic-tool');
  expect(tools).toHaveLength(2);
  await page.viewport(640, 500);
  render(
    <TooltipProvider>
      <section aria-label='Recovered edits'>
        {tools.map((part) => (
          <ChatMessageToolExternal key={part.toolCallId} part={part} />
        ))}
      </section>
    </TooltipProvider>,
  );
  const disclose = async (index: number, path: string): Promise<void> => {
    const header = page.getByRole('button', { name: new RegExp(path.replaceAll('.', String.raw`\.`), 'u') });
    await expect.element(header).toHaveAttribute('aria-expanded', 'false');
    await header.click();
    await expect.element(page.getByRole('region', { name: `Edited ${path}` })).toBeVisible();
    expect(await screen.findByText(`recovered_${String(index)}`)).toBeVisible();
  };
  await disclose(0, 'main.cs');
  await disclose(1, 'main.geospec.ts');
  await page.screenshot({
    element: screen.getByRole('region', { name: 'Recovered edits' }),
    path: '../../../../../out/research/acp-file-write-chat-history/browser/recovered-edits.png',
  });
});
