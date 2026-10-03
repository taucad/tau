// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compareRevisionFile } from '@taucad/revisions/algorithms';
import { FileRows } from '#routes/w.$workspace.$project/revision-marker.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: 'light', isHighContrast: false }) }));
vi.mock('#lib/shiki.lib.js', () => ({ getHighlighter: async () => undefined }));
beforeEach(() => {
  revisionStatusHarness.reset();
  revisionStatusHarness.diff = [{ path: 'empty.ts', kind: 'added' }];
});
describe('Revision file comparison with the actual line renderer', () => {
  it('should explain an empty file addition without hashes or an empty diff', async () => {
    revisionStatusHarness.comparison = {
      original: '',
      modified: '',
      kind: 'text',
      change: 'added',
      notices: ['empty-added'],
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FileRows
          revision={{
            revisionId: 'rev-1',
            n: 1,
            createdAt: 0,
            summary: '',
            actor: '',
            turnId: undefined,
            conflicted: false,
            trigger: 'save',
          }}
          compareAgainst='parent'
        />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Compare empty.ts' }));
    const comparison = await screen.findByRole('region', { name: 'Comparison for empty.ts' });
    expect(within(comparison).getByText('Empty file added.')).toBeVisible();
    expect(comparison).not.toHaveTextContent(/Original bytes|Current bytes|sha256/u);
    expect(screen.queryByText('No changes in this file.')).not.toBeInTheDocument();
  });
  it.each([
    { original: [], modified: undefined, message: 'Empty file deleted.' },
    { original: [65], modified: [0xef, 0xbb, 0xbf, 65], message: 'File encoding changed.' },
    { original: [65], modified: [65], executable: true, message: 'File is now executable.' },
    { original: [65, 0, 66], modified: undefined, message: 'Binary file deleted.' },
    {
      original: [0x80],
      modified: [0x81],
      message: 'Text comparison is unavailable: a version of this file has an unsupported encoding or invalid text.',
    },
    { original: [65], modified: [65, 10], message: 'Final newline changed.' },
    { original: [65, 13, 10], modified: [65, 10], message: 'Line endings changed.' },
  ])(
    'should show $message using the shared comparison and real renderer',
    async ({ original, modified, executable, message }) => {
      revisionStatusHarness.comparison = compareRevisionFile({
        original: { content: new Uint8Array(original), mode: '100644' },
        modified:
          modified === undefined
            ? undefined
            : { content: new Uint8Array(modified), mode: executable ? '100755' : '100644' },
      });
      render(
        <QueryClientProvider client={new QueryClient()}>
          <FileRows
            revision={{
              revisionId: 'rev-1',
              n: 1,
              createdAt: 0,
              summary: '',
              actor: '',
              turnId: undefined,
              conflicted: false,
              trigger: 'save',
            }}
            compareAgainst='parent'
          />
        </QueryClientProvider>,
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Compare empty.ts' }));
      const comparison = await screen.findByRole('region', { name: 'Comparison for empty.ts' });
      expect(within(comparison).getByText(message)).toBeVisible();
      expect(comparison).not.toHaveTextContent(/Original bytes|Current bytes|sha256/u);
    },
  );
  it('should render the actual deleted and added lines for a normal text edit', async () => {
    revisionStatusHarness.comparison = {
      original: 'const before = 1;',
      modified: 'const after = 2;',
      kind: 'text',
      change: 'modified',
      notices: [],
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FileRows
          revision={{
            revisionId: 'rev-1',
            n: 1,
            createdAt: 0,
            summary: '',
            actor: '',
            turnId: undefined,
            conflicted: false,
            trigger: 'save',
          }}
          compareAgainst='parent'
        />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Compare empty.ts' }));
    const comparison = await screen.findByRole('region', { name: 'Comparison for empty.ts' });
    expect(within(comparison).getByText('const before = 1;')).toHaveClass('diff', 'remove');
    expect(within(comparison).getByText('const after = 2;')).toHaveClass('diff', 'add');
    expect(comparison).not.toHaveTextContent(/Original bytes|Current bytes|sha256/u);
  });
});
