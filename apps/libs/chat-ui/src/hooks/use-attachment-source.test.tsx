// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render as renderBare, screen, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import { FileManagerContext } from '@taucad/ui-core/contexts/file-manager-context';
import type { FileManagerContextValue } from '@taucad/ui-core/contexts/file-manager-context';
import { useAttachmentSource } from '#hooks/use-attachment-source.js';
import type { AttachmentSource } from '#hooks/use-attachment-source.js';

const files = new Map<string, Uint8Array<ArrayBuffer>>();
const readFile = vi.fn(async (path: string) => {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  }
  return bytes;
});

const fileManagerWith = (read: FileManagerContextValue['recordFiles']['readFile']): FileManagerContextValue =>
  mock<FileManagerContextValue>({ recordFiles: mock<FileManagerContextValue['recordFiles']>({ readFile: read }) });

// One context value, as the real provider keeps one client for its lifetime.
let fileManager = fileManagerWith(readFile);

function FileManagerWrapper({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <FileManagerContext.Provider value={fileManager}>{children}</FileManagerContext.Provider>;
}

const render = (ui: React.ReactElement) => renderBare(ui, { wrapper: FileManagerWrapper });

const directory = '/projects/p1/.tau/chats/c1/attachments';
const imageHash = 'a'.repeat(64);
const imagePart = { url: `attachments/${imageHash}.png`, mediaType: 'image/png' };

const createObjectURL = vi.fn((_blob: Blob) => `blob:object-${createObjectURL.mock.calls.length}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  files.clear();
  files.set(`${directory}/${imageHash}.png`, new Uint8Array([137, 80, 78, 71]));
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

  it('should replace a same-path URL when the source capability changes', async () => {
    const original = fileManager;
    const view = render(<Probe id='source' part={imagePart} />);
    await screen.findByText('ready blob:object-1');
    const replacementRead = vi.fn(async () => new Uint8Array([1, 2]));
    fileManager = fileManagerWith(replacementRead);
    try {
      view.rerender(<Probe id='source' part={imagePart} />);
      await screen.findByText('ready blob:object-2');
      expect(replacementRead).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:object-1');
    } finally {
      view.unmount();
      fileManager = original;
    }
  });

  it('should dispose a late URL after the final release without replacing a new lease', async () => {
    let resolveBytes: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
    readFile.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveBytes = resolve;
        }),
    );
    const first = render(<Probe id='first' part={imagePart} />);
    first.unmount();
    const second = render(<Probe id='second' part={imagePart} />);
    await screen.findByText('ready blob:object-1');
    await act(async () => {
      resolveBytes?.(new Uint8Array([1]));
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:object-2');
    expect(screen.getByTestId('second')).toHaveTextContent('ready blob:object-1');
    second.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:object-1');
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
});
