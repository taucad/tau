import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type * as ReactRouterModule from 'react-router';
import type * as XStateReactModule from '@xstate/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForkAction } from '#routes/v.$id/fork-action.js';

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

const createProject = vi.fn();

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject }),
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
    createProject.mockResolvedValue({ id: 'new_proj' });
    forkCadMocks.defaultParameters = {};
    forkCadMocks.parameterOverrides = {};
  });

  it('creates an IndexedDB-backed project and navigates to /projects/:id', async () => {
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

    expect(navigateMock).toHaveBeenCalledWith('/projects/new_proj');
    expect(createProject.mock.calls[0]?.[0]?.project?.forkedFrom).toBe('pub_1');
  });

  it('passes deepmerged defaultParameters and cad overrides into fork mechanical.parameters', async () => {
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

    expect(createProject.mock.calls[0]?.[0]?.project?.assets?.mechanical?.parameters).toEqual({
      width: 10,
      height: 99,
    });
  });
});
