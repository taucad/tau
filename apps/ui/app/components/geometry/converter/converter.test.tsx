import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { SupportedExportFormat } from '@taucad/converter';
import type * as FileUtilsModule from '@taucad/utils/file';

/* oxlint-disable react-js/boolean-prop-naming -- mocks the controlled Checkbox prop API. */

const { exportFromGlb, downloadBlob } = vi.hoisted(() => ({
  exportFromGlb: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('@taucad/converter', () => ({ exportFromGlb }));
vi.mock('@taucad/utils/file', async (importOriginal) => ({
  ...(await importOriginal<typeof FileUtilsModule>()),
  downloadBlob,
}));
vi.mock('#components/ui/sonner.js', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), promise: vi.fn() },
}));
vi.mock('#components/geometry/converter/format-selector.js', () => ({ FormatSelector: () => null }));
vi.mock('#components/geometry/converter/converter-file-tree.js', () => ({ ConverterFileTree: () => null }));
vi.mock('#components/ui/button.js', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('#components/ui/checkbox.js', () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => (
    <input
      id={id}
      type='checkbox'
      checked={checked}
      onChange={(event) => {
        onCheckedChange(event.target.checked);
      }}
    />
  ),
}));
/* oxlint-enable react-js/boolean-prop-naming */
vi.mock('#components/ui/label.js', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

const { Converter } = await import('#components/geometry/converter/converter.js');

const renderConverter = (format: SupportedExportFormat, onExport = vi.fn()) => {
  render(
    <Converter
      getGlbData={async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])}
      selectedFormats={[format]}
      shouldUseZipForMultiple={false}
      onFormatToggle={vi.fn()}
      onClearSelection={vi.fn()}
      onZipToggle={vi.fn()}
      onExport={onExport}
    />,
  );
  return onExport;
};

describe('Converter dependent export artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each<{ format: SupportedExportFormat; names: string[] }>([
    {
      format: 'gltf',
      names: ['model.gltf', 'buffers/model.bin'],
    },
    {
      format: 'obj',
      names: ['model.obj', 'materials/model.mtl'],
    },
  ])('should ZIP and preserve the complete $format artifact set', async ({ format, names }) => {
    exportFromGlb.mockResolvedValueOnce(
      names.map((name, index) => ({
        name,
        mimeType: 'application/octet-stream',
        bytes: new Uint8Array([index + 1]),
      })),
    );
    renderConverter(format);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await vi.waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledOnce();
    });
    expect(downloadBlob.mock.calls[0]?.[1]).toBe('converted-models.zip');
    const zip = await JSZip.loadAsync(downloadBlob.mock.calls[0]![0] as Blob);
    for (const name of names) {
      expect(zip.file(name)).not.toBeNull();
    }
  });

  it('should pass every dependent artifact to the project-save callback', async () => {
    exportFromGlb.mockResolvedValueOnce([
      { name: 'model.gltf', mimeType: 'model/gltf+json', bytes: new Uint8Array([1]) },
      { name: 'buffers/model.bin', mimeType: 'application/octet-stream', bytes: new Uint8Array([2]) },
    ]);
    const onExport = renderConverter('gltf');
    fireEvent.click(screen.getByLabelText('Save exported files to project'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await vi.waitFor(() => {
      expect(onExport).toHaveBeenCalledWith([
        { filename: 'model.gltf', content: new Uint8Array([1]), format: 'gltf' },
        { filename: 'buffers/model.bin', content: new Uint8Array([2]), format: 'gltf' },
      ]);
    });
  });
});
