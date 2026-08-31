import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type * as ReactRouterModule from 'react-router';
import { parameterEntryPath } from '@taucad/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreatedProject, CreateProjectOptions } from '#hooks/use-project-manager.js';
import { ForkAction } from '#components/share/fork-action.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { parseParameterEntry } from '#utils/parameter-config.utils.js';

const navigateMock = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterModule>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

type CreateFromDataOptions = Extract<CreateProjectOptions, { readonly project: unknown }>;
const createProject = vi.fn<(options: CreateFromDataOptions) => Promise<Pick<CreatedProject, 'id' | 'slugs'>>>();
const presentLocationError = vi.fn(() => false);

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject }),
}));

vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => presentLocationError,
}));

const refreshLocation = vi.fn(async () => undefined);
vi.mock('#hooks/use-project-creation-location.js', () => ({
  useProjectCreationLocation: () => ({
    phase: 'ready',
    value: { kind: 'home' },
    canCreate: true,
    shouldShowPicker: false,
    hasWebAccessCapability: false,
    refresh: refreshLocation,
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ForkAction', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    createProject.mockClear();
    presentLocationError.mockClear();
    presentLocationError.mockReturnValue(false);
    createProject.mockResolvedValue({ id: 'new_proj', slugs: { workspaceSlug: 'home', projectSlug: 'new-proj' } });
  });

  it('uses the creation preference and navigates to the returned canonical URL', async () => {
    const files = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1, 2, 3]) }]]);

    render(
      <MemoryRouter>
        <ForkAction
          publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }}
          files={files}
          parameters={{}}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));
    await userEvent.click(screen.getByRole('button', { name: /create remix/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    expect(navigateMock).toHaveBeenCalledWith('/w/home/new-proj');
    expect(createProject.mock.calls[0]?.[0]).toHaveProperty('location', { kind: 'home' });
  });

  it('writes the current in-memory parameters to the parameter file', async () => {
    const files = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1, 2, 3]) }]]);

    render(
      <MemoryRouter>
        <ForkAction
          publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }}
          files={files}
          parameters={{ width: 10, height: 99 }}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));
    await userEvent.click(screen.getByRole('button', { name: /create remix/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    const creation = createProject.mock.calls[0]?.[0];
    if (!creation) {
      throw new Error('Expected project creation options');
    }
    const parameterFile = creation.files[parameterEntryPath('main.ts')];
    if (!parameterFile) {
      throw new Error('Expected a parameter file');
    }
    const parameterEntry = parseParameterEntry(decodeTextFile(parameterFile.content));
    expect(parameterEntry.groups['default']?.values).toEqual({
      width: 10,
      height: 99,
    });
  });

  it('retains the publication and resets Remix after a creation-location failure', async () => {
    const error = new Error('disconnected');
    createProject.mockRejectedValue(error);
    presentLocationError.mockReturnValue(true);
    const files = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1, 2, 3]) }]]);

    render(
      <MemoryRouter>
        <ForkAction
          publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }}
          files={files}
          parameters={{}}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));
    await userEvent.click(screen.getByRole('button', { name: /create remix/i }));

    await waitFor(() => {
      expect(presentLocationError).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole('button', { name: /create remix/i })).toBeEnabled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
