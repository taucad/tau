import { act, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fns ──────────────────────────────────────────────────────────────────

const mockContentServiceWriteFiles =
  vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>, source: string) => Promise<void>>();
const mockClientWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockMount = vi.fn<(prefix: string, config: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
// Drives the `fmProjectId` branch in prepareFiles. `undefined` ≈ root FM /
// app shell (the `import-viewer.tsx` and `project-grid.tsx` bug surface).
// A concrete `proj_X` ≈ surrounding `FileManagerProvider rootDirectory=/projects/proj_X`
// (the publication / preview-route cases).
let mockFmProjectId: string | undefined = undefined;

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
        contentService: {
          writeFiles: mockContentServiceWriteFiles,
        },
        projectId: mockFmProjectId,
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
      invalidateStandaloneProvider: vi.fn(async () => undefined),
    },
    backendType: 'indexeddb',
  }),
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
          geometries: unknown[];
          kernelIssues: Map<string, unknown>;
          defaultParameters: Record<string, unknown>;
          jsonSchema: undefined;
          units: undefined;
          kernelClient: undefined;
          lastSettledRenderId: number;
        },
      },
    })
    .createMachine({
      id: 'cad',
      initial: 'idle',
      context: {
        geometries: [],
        kernelIssues: new Map(),
        defaultParameters: {},
        jsonSchema: undefined,
        units: undefined,
        kernelClient: undefined,
        lastSettledRenderId: 0,
      },
      states: { idle: {} },
    });
  return { cadMachine };
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
const { CadPreviewProvider } = await import('#hooks/use-cad-preview.js');

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

describe('CadPreviewProvider filesystem two-mode contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFmProjectId = undefined;
    mockContentServiceWriteFiles.mockResolvedValue(undefined);
    mockClientWriteFiles.mockResolvedValue(undefined);
    mockMount.mockResolvedValue(undefined);
    mockUnmount.mockReturnValue(undefined);
  });

  // Case B (root FM): regression for the user's reported
  // `WorkspaceScopeViolationError` on `/import/github.com/<owner>/<repo>`.
  // No surrounding project FM ⇒ preview owns the mount lifecycle.
  it('mounts memory + writes via client.writeFiles + unmounts on teardown when no surrounding FM matches projectId (root FM)', async () => {
    mockFmProjectId = undefined;

    const result = render(
      <CadPreviewProvider
        projectId='import-preview-X'
        mainFile='main.scad'
        files={makeFiles([['main.scad', [1, 2, 3]]])}
      >
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    await vi.waitFor(() => {
      expect(mockClientWriteFiles).toHaveBeenCalledTimes(1);
    });

    expect(mockMount).toHaveBeenCalledWith('/projects/import-preview-X', {
      backend: 'memory',
      preservePath: true,
    });
    const writtenFiles = mockClientWriteFiles.mock.calls[0]?.[0];
    expect(writtenFiles && Object.keys(writtenFiles)).toEqual(['/projects/import-preview-X/main.scad']);
    expect(mockContentServiceWriteFiles).not.toHaveBeenCalled();

    result.unmount();
    expect(mockUnmount).toHaveBeenCalledWith('/projects/import-preview-X');
  });

  // Case A (project-scoped FM): existing behavior for
  // `projects_.$id_.preview/route.tsx` and `v.$id/route.tsx`. The FM machine
  // already mounted the prefix; writing via `contentService.writeFiles`
  // keeps the FM's cache + tree refresh coherent.
  it('writes through contentService.writeFiles only when surrounding FM is scoped to the same projectId', async () => {
    mockFmProjectId = 'proj_X';

    const result = render(
      <CadPreviewProvider projectId='proj_X' mainFile='main.scad' files={makeFiles([['main.scad', [1, 2, 3]]])}>
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    await vi.waitFor(() => {
      expect(mockContentServiceWriteFiles).toHaveBeenCalledTimes(1);
    });

    const writtenFiles = mockContentServiceWriteFiles.mock.calls[0]?.[0];
    expect(writtenFiles && Object.keys(writtenFiles)).toEqual(['/projects/proj_X/main.scad']);
    expect(mockContentServiceWriteFiles.mock.calls[0]?.[1]).toBe('machine');
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockClientWriteFiles).not.toHaveBeenCalled();

    result.unmount();
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  // Cross-scope: surrounding FM is project-scoped but to a different
  // projectId than the preview's. The preview prefix is NOT mounted, so the
  // preview must own the mount lifecycle (same as the root-FM case).
  it('preview owns mount lifecycle when surrounding FM projectId does not match preview projectId', async () => {
    mockFmProjectId = 'proj_X';

    const result = render(
      <CadPreviewProvider
        projectId='import-preview-Y'
        mainFile='main.scad'
        files={makeFiles([['main.scad', [1, 2, 3]]])}
      >
        <div data-testid='child' />
      </CadPreviewProvider>,
    );

    await vi.waitFor(() => {
      expect(mockClientWriteFiles).toHaveBeenCalledTimes(1);
    });

    expect(mockMount).toHaveBeenCalledWith('/projects/import-preview-Y', {
      backend: 'memory',
      preservePath: true,
    });
    expect(mockContentServiceWriteFiles).not.toHaveBeenCalled();

    result.unmount();
    expect(mockUnmount).toHaveBeenCalledWith('/projects/import-preview-Y');
  });

  // When `files` is absent, the prepareFiles actor short-circuits — neither
  // branch should fire, and the cleanup unmount must be a no-op.
  it('makes no filesystem calls when `files` prop is omitted', async () => {
    mockFmProjectId = undefined;

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
    expect(mockContentServiceWriteFiles).not.toHaveBeenCalled();

    result.unmount();
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  // Mirrors the unmount-safety guarantee in `use-project-manager.test.ts`
  // ("should call unmount even when writeFiles throws"). The preview-owned
  // mount must not leak when the worker rejects the write.
  it('still unmounts the preview-owned prefix when client.writeFiles rejects', async () => {
    mockFmProjectId = undefined;
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

    expect(mockMount).toHaveBeenCalledWith('/projects/import-preview-Z', {
      backend: 'memory',
      preservePath: true,
    });

    result.unmount();
    expect(mockUnmount).toHaveBeenCalledWith('/projects/import-preview-Z');
  });
});
