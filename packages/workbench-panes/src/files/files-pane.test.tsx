import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStaticDataSource } from '#files/file-selector.jsx';
import { FilesPane } from '#files/files-pane.jsx';
import type { FilesSource } from '#files/files-source.js';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { WorkbenchPanesHost } from '#host/workbench-host.jsx';

const projectFiles = [
  { path: 'parts/arm.ts', size: 120, renderable: true },
  { path: 'parts/base.ts', size: 80, renderable: true },
  { path: 'exports/arm.stl', size: 2048, renderable: true },
  { path: 'README.md', size: 10, renderable: false },
];

const renderPane = (files: FilesSource): ReturnType<typeof render> => {
  const host: WorkbenchPanesHost = { useUnits: () => [], files };
  return render(
    <WorkbenchPanesHostProvider value={host}>
      <FilesPane />
    </WorkbenchPanesHostProvider>,
  );
};

const sourceOf = (overrides: Partial<FilesSource> = {}): FilesSource => ({
  ...createStaticDataSource(projectFiles),
  useActivePath: () => 'parts/arm.ts',
  openFile: vi.fn(async () => undefined),
  ...overrides,
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe('FilesPane', () => {
  it('should browse into a folder, mark the shown file and open another', async () => {
    const source = sourceOf();
    renderPane(source);

    await userEvent.click(await screen.findByRole('option', { name: 'parts' }));
    const shown = await screen.findByRole('option', { name: /arm\.ts/u });
    expect(shown).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('option', { name: /base\.ts/u }));

    expect(source.openFile).toHaveBeenCalledWith('parts/base.ts');
  });

  it('should list a file the view cannot show without letting it be chosen', async () => {
    const source = sourceOf();
    renderPane(source);

    const readme = await screen.findByRole('option', { name: /README\.md/u });
    expect(readme).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(readme);
    expect(source.openFile).not.toHaveBeenCalled();
  });

  it('should say why a file did not open', async () => {
    renderPane(
      sourceOf({
        openFile: async () => {
          throw new Error('KERNEL_ERROR: Bad model.');
        },
      }),
    );

    await userEvent.click(await screen.findByRole('option', { name: 'parts' }));
    await userEvent.click(await screen.findByRole('option', { name: /base\.ts/u }));

    expect(await screen.findByRole('alert')).toHaveTextContent('KERNEL_ERROR: Bad model.');
  });

  it('should list the folder again when the source says its files changed', async () => {
    let files = projectFiles;
    const listeners = new Set<() => void>();
    renderPane(
      sourceOf({
        loadDirectory: async (path) => createStaticDataSource(files).loadDirectory(path),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
    );
    await screen.findByRole('option', { name: /README\.md/u });

    files = [...projectFiles, { path: 'notes.ts', size: 5, renderable: true }];
    act(() => {
      for (const listener of listeners) {
        listener();
      }
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /notes\.ts/u })).toBeInTheDocument();
    });
    /* The folder stays on screen while it lists again. */
    expect(screen.getByRole('option', { name: /README\.md/u })).toBeInTheDocument();
  });
});
