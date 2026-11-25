// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render as renderBare, screen } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import { FileManagerContext } from '@taucad/ui-core/contexts/file-manager-context';
import type { FileManagerContextValue } from '@taucad/ui-core/contexts/file-manager-context';
import { attachmentAbsentLabel } from '@taucad/chat-ui/hooks/use-attachment-source';
import { AttachmentFileChip } from '#components/chat/attachment-preview.js';

const files = new Map<string, Uint8Array<ArrayBuffer>>();
const readFile = vi.fn(async (path: string) => {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  }
  return bytes;
});

const fileManager = mock<FileManagerContextValue>({
  recordFiles: mock<FileManagerContextValue['recordFiles']>({ readFile }),
});

function FileManagerWrapper({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <FileManagerContext.Provider value={fileManager}>{children}</FileManagerContext.Provider>;
}

const render = (ui: React.ReactElement) => renderBare(ui, { wrapper: FileManagerWrapper });

const directory = '/projects/p1/.tau/chats/c1/attachments';
const pdfHash = 'b'.repeat(64);
const pdfPart = { url: `attachments/${pdfHash}.pdf`, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' };

const createObjectURL = vi.fn((_blob: Blob) => `blob:object-${createObjectURL.mock.calls.length}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  files.clear();
  files.set(`${directory}/${pdfHash}.pdf`, new Uint8Array(2048));
  readFile.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AttachmentFileChip', () => {
  it('should resolve a PDF to a chip with its filename and size', async () => {
    render(<AttachmentFileChip directory={directory} part={pdfPart} />);

    const link = await screen.findByRole('link', { name: 'bracket-spec.pdf' });
    expect(link).toHaveAttribute('href', 'blob:object-1');
    expect(link).toHaveAttribute('download', 'bracket-spec.pdf');
    expect(screen.getByText('PDF · 2.0 KB')).toBeInTheDocument();
    expect(createObjectURL.mock.calls[0]![0].type).toBe('application/pdf');
  });

  it('should label a document whose bytes are not on this device', async () => {
    files.clear();
    render(<AttachmentFileChip directory={directory} part={pdfPart} />);

    expect(await screen.findByText(attachmentAbsentLabel)).toBeInTheDocument();
    expect(screen.getByText('bracket-spec.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
