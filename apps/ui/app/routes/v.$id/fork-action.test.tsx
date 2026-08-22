import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type * as ReactRouterModule from 'react-router';
import type * as XStateReactModule from '@xstate/react';
import { parameterEntryPath } from '@taucad/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreatedProject, CreateProjectOptions } from '#hooks/use-project-manager.js';
import { ForkAction } from '#routes/v.$id/fork-action.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { parseParameterEntry } from '#utils/parameter-config.utils.js';

const navigateMock = vi.fn();

type ParameterRecord = Record<string, unknown>;
const forkCadMocks = vi.hoisted(() => {
  const defaultParameters: ParameterRecord = {};
  const parameterOverrides: ParameterRecord = {};
  return { defaultParameters, parameterOverrides };
});

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

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    cadRef: {},
    get defaultParameters(): Record<string, unknown> {
      return forkCadMocks.defaultParameters;
    },
  }),
}));

vi.mock('@xstate/react', async (importOriginal) => {
  const actual = await importOriginal<typeof XStateReactModule>();
  return {
    ...actual,
    useSelector: vi.fn(
      (_actorRef: unknown, selector: (s: { context: { parameters: Record<string, unknown> } }) => unknown) => {
        return selector({ context: { parameters: forkCadMocks.parameterOverrides } });
      },
    ),
  };
});

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
    forkCadMocks.defaultParameters = {};
    forkCadMocks.parameterOverrides = {};
  });

  it('uses the creation preference and navigates to the returned canonical URL', async () => {
    const files = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1, 2, 3]) }]]);

    render(
      <MemoryRouter>
        <ForkAction publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }} files={files} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    expect(navigateMock).toHaveBeenCalledWith('/w/home/new-proj');
    expect(createProject.mock.calls[0]?.[0]).not.toHaveProperty('location');
  });

  it('writes deepmerged defaultParameters and cad overrides to the parameter file', async () => {
    forkCadMocks.defaultParameters = { width: 10, height: 20 };
    forkCadMocks.parameterOverrides = { height: 99 };

    const files = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1, 2, 3]) }]]);

    render(
      <MemoryRouter>
        <ForkAction publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }} files={files} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));

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
        <ForkAction publication={{ id: 'pub_1', title: 'Shared', entryPath: 'main.ts' }} files={files} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^remix$/iu }));

    await waitFor(() => {
      expect(presentLocationError).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole('button', { name: /^remix$/iu })).toBeEnabled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
