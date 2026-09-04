import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fns ──────────────────────────────────────────────────────────────────

const mockClientWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockMount = vi.fn<(prefix: string, config: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
const mockProjectKernelOptions = vi.fn(() => ({
  kernelOptionsFactory: vi.fn(),
  key: 'local:0',
  isLocal: true,
}));
const mockCadSelection = vi.hoisted(() => ({
  failureIssues: undefined as
    | readonly [
        { readonly message: string; readonly severity: 'error'; readonly code: 'RUNTIME'; readonly type: 'runtime' },
      ]
    | undefined,
}));

// `xstate.waitFor` is what `prepareFiles` uses to read the FM snapshot. The
// real `fileManagerRef` is a heavyweight machine actor we don't need to
// stand up here — short-circuit `waitFor` to a hand-rolled snapshot.
vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    waitFor: vi.fn().mockImplementation(async () => ({
      matches: (state: string) => state === 'ready',
      context: {
        error: undefined,
      },
    })),
  };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef: { id: 'fmRef' },
    client: { writeFiles: mockClientWriteFiles },
    workspace: {
      mount: mockMount,
      unmount: mockUnmount,
      disposeStorageRoot: vi.fn(async () => undefined),
    },
    backendType: 'indexeddb',
  }),
}));

vi.mock('#hooks/use-project-kernel-options.js', () => ({
  useProjectKernelOptions: mockProjectKernelOptions,
}));

// `cadMachine` is invoked via `useActorRef` for its lifecycle but its outputs
// are not under test here. Provide an inert stand-in with the context shape
// that `CadPreviewProvider`'s selectors expect.
vi.mock('#machines/cad.machine.js', async () => {
  const xstate = await import('xstate');
  const cadMachine = xstate
    .setup({
      types: {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup pattern
        context: {} as {
          geometry: unknown | undefined;
          kernelIssues: Map<string, unknown>;
          defaultParameters: Record<string, unknown>;
          jsonSchema: undefined;
          units: undefined;
          kernelClient: undefined;
        },
      },
    })
    .createMachine({
      id: 'cad',
      initial: 'idle',
      context: {
        geometry: undefined,
        kernelIssues: new Map(),
        defaultParameters: {},
        jsonSchema: undefined,
        units: undefined,
        kernelClient: undefined,
      },
      states: { idle: {} },
    });
  return { cadMachine, selectCadFailureIssues: () => mockCadSelection.failureIssues };
});

vi.mock('#machines/graphics.machine.js', async () => {
  const xstate = await import('xstate');
  const graphicsMachine = xstate.setup({}).createMachine({
    id: 'graphics',
    initial: 'idle',
    states: { idle: {} },
  });
  return { graphicsMachine };
});

// Dynamic import after mocks are registered.
const { CadPreviewProvider, useCadPreview } = await import('#hooks/use-cad-preview.js');

const PreviewError = (): React.JSX.Element => {
  const { error } = useCadPreview();
  return <span>{error?.message}</span>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Array-of-tuples instead of object literal: file path keys like `main.scad`
// trip the strict camelCase naming-convention lint when used as inline
// object literal keys, which would otherwise force a `// eslint-disable`
// comment at every call site.
function makeFiles(
  entries: ReadonlyArray<readonly [string, number[]]>,
): Record<string, { content: Uint8Array<ArrayBuffer> }> {
  const result: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  for (const [key, bytes] of entries) {
    result[key] = { content: new Uint8Array(bytes) };
  }
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CadPreviewProvider isolated filesystem contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientWriteFiles.mockResolvedValue(undefined);
    mockMount.mockResolvedValue(undefined);
    mockUnmount.mockReturnValue(undefined);
    mockProjectKernelOptions.mockClear();
    mockCadSelection.failureIssues = undefined;
  });

  it('uses an instance-scoped preview root even when its project id matches a persistent project', async () => {
    const result = render(
      <CadPreviewProvider
        projectId='proj_persistent'
        mainFile='main.scad'
        files={makeFiles([['main.scad', [1, 2, 3]]])}
      >
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    await vi.waitFor(() => {
      expect(mockClientWriteFiles).toHaveBeenCalledTimes(1);
    });

    const previewPrefix = mockMount.mock.calls[0]?.[0];
    expect(previewPrefix).toMatch(/^\/previews\/[^/]+$/);
    const previewInstance = previewPrefix?.slice('/previews/'.length);
    expect(mockMount).toHaveBeenCalledWith(previewPrefix, {
      backend: 'memory',
      storageRootKey: `memory:preview:${previewInstance}`,
    });
    const writtenFiles = mockClientWriteFiles.mock.calls[0]?.[0];
    expect(writtenFiles && Object.keys(writtenFiles)).toEqual([`${previewPrefix}/main.scad`]);

    result.unmount();
    expect(mockUnmount).toHaveBeenCalledWith(previewPrefix);
  });

  it('makes no filesystem calls when `files` prop is omitted', async () => {
    const result = render(
      <CadPreviewProvider projectId='proj_X' mainFile='main.scad'>
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    // Give the previewRef actor a chance to run start → preparingFiles →
    // active. The actor body short-circuits when `input.files` is undefined.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(mockMount).not.toHaveBeenCalled();
    expect(mockClientWriteFiles).not.toHaveBeenCalled();
    expect(mockProjectKernelOptions).toHaveBeenCalledWith({
      projectId: 'proj_X',
      nativeKernelId: undefined,
    });
    result.unmount();
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  it('requests native-code trust placement for a persistent Python project', () => {
    const result = render(
      <CadPreviewProvider projectId='proj_python' mainFile='main.py'>
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    expect(mockProjectKernelOptions).toHaveBeenCalledWith({
      projectId: 'proj_python',
      nativeKernelId: 'build123d',
    });
    result.unmount();
  });

  it('keeps explicit factories authoritative without consulting project placement', () => {
    const explicitFactory = vi.fn();
    const result = render(
      <CadPreviewProvider projectId='proj_explicit' mainFile='main.py' kernelOptionsFactory={explicitFactory}>
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    expect(mockProjectKernelOptions).not.toHaveBeenCalled();
    result.unmount();
  });

  it('still unmounts the preview-owned prefix when client.writeFiles rejects', async () => {
    mockClientWriteFiles.mockRejectedValueOnce(new Error('write failed'));

    const result = render(
      <CadPreviewProvider
        projectId='import-preview-Z'
        mainFile='main.scad'
        files={makeFiles([['main.scad', [1, 2, 3]]])}
      >
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    // The rejected writeFiles transitions the previewRef into the `error`
    // state and assigns `initError`, which triggers a re-render through
    // `useSelector`. Wrap the wait in act() so React drains the update
    // before we assert / unmount; otherwise the testing-library `act()`
    // warning fires (cosmetic — the test passes either way).
    await act(async () => {
      await vi.waitFor(() => {
        expect(mockClientWriteFiles).toHaveBeenCalled();
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    const previewPrefix = mockMount.mock.calls[0]?.[0];
    expect(previewPrefix).toMatch(/^\/previews\/[^/]+$/);

    result.unmount();
    expect(mockUnmount).toHaveBeenCalledWith(previewPrefix);
  });

  it('gives preview initialization failures precedence over selected CAD issues', async () => {
    mockCadSelection.failureIssues = [
      { message: 'CAD issue must not win', severity: 'error', code: 'RUNTIME', type: 'runtime' },
    ];
    mockClientWriteFiles.mockRejectedValueOnce(new Error('preview initialization sentinel'));

    render(
      <CadPreviewProvider
        projectId='import-preview-init-error'
        mainFile='main.scad'
        files={makeFiles([['main.scad', [1, 2, 3]]])}
      >
        <PreviewError />
      </CadPreviewProvider>,
    );

    expect(await screen.findByText('preview initialization sentinel')).toBeInTheDocument();
    expect(screen.queryByText('CAD issue must not win')).not.toBeInTheDocument();
  });
});
