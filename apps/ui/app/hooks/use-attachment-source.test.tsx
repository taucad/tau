// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { attachmentAbsentLabel, useAttachmentSource } from '#hooks/use-attachment-source.js';
import type { AttachmentSource } from '#hooks/use-attachment-source.js';
import { AttachmentFileChip } from '#components/chat/attachment-preview.js';

const files = new Map<string, Uint8Array<ArrayBuffer>>();
const readFile = vi.fn(async (path: string) => {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  }
  return bytes;
});

// One context value, as the real provider keeps one client for its lifetime.
const fileManager = { client: { readFile } };
vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => fileManager,
}));

const directory = '/projects/p1/.tau/chats/c1/attachments';
const imageHash = 'a'.repeat(64);
const pdfHash = 'b'.repeat(64);
const imagePart = { url: `attachments/${imageHash}.png`, mediaType: 'image/png' };
const pdfPart = { url: `attachments/${pdfHash}.pdf`, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' };

const createObjectURL = vi.fn((_blob: Blob) => `blob:object-${createObjectURL.mock.calls.length}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  files.clear();
  files.set(`${directory}/${imageHash}.png`, new Uint8Array([137, 80, 78, 71]));
  files.set(`${directory}/${pdfHash}.pdf`, new Uint8Array(2048));
  readFile.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe({ id, part }: { readonly id: string; readonly part: { url: string; mediaType: string } }) {
  const source: AttachmentSource = useAttachmentSource(directory, part);
  return (
    <output data-testid={id}>
      {source.status}
      {source.status === 'ready' ? ` ${source.src}` : ''}
    </output>
  );
}

describe('useAttachmentSource', () => {
  it('should create one object URL per path and share it across consumers', async () => {
    render(
      <>
        <Probe id='first' part={imagePart} />
        <Probe id='second' part={imagePart} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('first')).toHaveTextContent('ready blob:object-1');
    });
    expect(screen.getByTestId('second')).toHaveTextContent('ready blob:object-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(`${directory}/${imageHash}.png`);
  });

  it('should revoke the object URL only after the last consumer unmounts', async () => {
    const first = render(<Probe id='first' part={imagePart} />);
    const second = render(<Probe id='second' part={imagePart} />);
    await waitFor(() => {
      expect(screen.getByTestId('second')).toHaveTextContent('ready blob:object-1');
    });

    first.unmount();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    second.unmount();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:object-1');
  });

  it('should pass a data URL through without reading or creating anything', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    render(<Probe id='legacy' part={{ url, mediaType: 'image/png' }} />);

    expect(screen.getByTestId('legacy')).toHaveTextContent(`ready ${url}`);
    expect(readFile).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('should resolve from a later directory when an earlier one lacks the bytes (F5)', async () => {
    const composer = '/.tau/composers/chats/p1/c1/attachments';
    function OrderedProbe() {
      const source = useAttachmentSource([composer, directory], imagePart);
      return <output data-testid='ordered'>{source.status}</output>;
    }

    render(<OrderedProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('ordered')).toHaveTextContent('ready');
    });
    expect(readFile.mock.calls.map(([path]) => path)).toEqual([
      `${composer}/${imageHash}.png`,
      `${directory}/${imageHash}.png`,
    ]);
  });

  it('should stay absent when no listed directory holds the bytes', async () => {
    files.clear();
    function OrderedProbe() {
      const source = useAttachmentSource(['/a/attachments', directory], imagePart);
      return <output data-testid='ordered'>{source.status}</output>;
    }

    render(<OrderedProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('ordered')).toHaveTextContent('absent');
    });
  });

  it('should report absent bytes as the placeholder state', async () => {
    files.clear();
    render(<Probe id='missing' part={imagePart} />);

    await waitFor(() => {
      expect(screen.getByTestId('missing')).toHaveTextContent('absent');
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

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
