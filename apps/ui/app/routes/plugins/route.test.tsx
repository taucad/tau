import { MemoryRouter } from 'react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillMetadata } from '@taucad/chat';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';

const mockReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockExists = vi.fn<(path: string) => Promise<boolean>>();
type TestCatalog = { commands: SkillMetadata[]; prompt: SkillMetadata[] };
const catalogHealth = vi.hoisted(() => ({
  status: 'ready' as 'ready' | 'closed',
  retry: vi.fn(),
  service: undefined as ObservationService<TestCatalog> | undefined,
}));
const mockUseSkillsCatalog = vi.fn<() => SkillMetadata[]>();

const mockWatchReady = vi.fn<() => ObservationWatch>();
const contentService = { watchReady: mockWatchReady };
const openWatch = (): ObservationWatch => ({
  ready: Promise.resolve(),
  closed: new Promise<void>(() => {
    /* Open until this mounted owner is disposed. */
  }),
  dispose: () => undefined,
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    writeFiles: mockWriteFiles,
    exists: mockExists,
    contentService,
  }),
}));

vi.mock('#hooks/use-skills-catalog.js', () => ({
  useSkillsCatalog: mockUseSkillsCatalog,
  useSkillsCatalogState: () => {
    const snapshot = useObservation(catalogHealth.service);
    return catalogHealth.service
      ? {
          commands: snapshot.value?.commands ?? [],
          prompt: snapshot.value?.prompt ?? [],
          status: snapshot.status,
          retry: () => catalogHealth.service?.refresh(),
        }
      : { commands: mockUseSkillsCatalog(), prompt: [], status: catalogHealth.status, retry: catalogHealth.retry };
  },
}));

const { default: PluginsRoute } = await import('#routes/plugins/route.js');

const decoder = new TextDecoder();
const encoder = new TextEncoder();
type FileWrites = Record<string, { content: Uint8Array<ArrayBuffer> }>;
type DecodedManifest = {
  readonly skills?: Record<
    string,
    {
      readonly status?: string;
      readonly source?: string;
      readonly installedPath?: string;
      readonly shadowPath?: string;
      readonly version?: string;
    }
  >;
};

function renderRoute(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <PluginsRoute />
    </MemoryRouter>,
  );
}

function getWrittenContent(writeArgument: FileWrites, path: string): Uint8Array<ArrayBuffer> {
  const write = writeArgument[path];
  if (!write) {
    throw new Error(`Expected write for ${path}`);
  }
  return write.content;
}

function decodeManifest(writeArgument: FileWrites): DecodedManifest {
  return JSON.parse(
    decoder.decode(getWrittenContent(writeArgument, '.agents/plugins/installed.json')),
  ) as DecodedManifest;
}

function getFirstWrite(): FileWrites {
  const call = mockWriteFiles.mock.calls.at(0);
  if (!call) {
    throw new Error('Expected writeFiles to be called');
  }
  const [writeArgument] = call;
  return writeArgument;
}

describe('PluginsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchReady.mockReset().mockImplementation(openWatch);
    catalogHealth.status = 'ready';
    catalogHealth.service = undefined;
    mockReadFile.mockRejectedValue(Object.assign(new Error('manifest missing'), { code: 'ENOENT' }));
    mockWriteFiles.mockResolvedValue(undefined);
    mockExists.mockResolvedValue(false);
    mockUseSkillsCatalog.mockReturnValue([]);
  });

  it('should expose unavailable catalog recovery without marking skill installs authoritative', async () => {
    catalogHealth.status = 'closed';
    renderRoute();
    expect(screen.getByText('Skill updates unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry skill updates' }));
    expect(catalogHealth.retry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
    expect(mockWriteFiles).not.toHaveBeenCalled();
  });

  it('should refuse installs throughout held catalog retry until a fresh settled catalog is ready', async () => {
    const closed = Promise.withResolvers<void>();
    const ready = Promise.withResolvers<void>();
    const fresh = Promise.withResolvers<TestCatalog>();
    const watch = vi
      .fn<() => ObservationWatch>()
      .mockReturnValueOnce({ ready: Promise.resolve(), closed: closed.promise, dispose: vi.fn() })
      .mockReturnValueOnce({
        ready: ready.promise,
        closed: new Promise<void>(() => {
          /* Replacement remains connected until cleanup. */
        }),
        dispose: vi.fn(),
      });
    const read = vi
      .fn<() => Promise<TestCatalog>>()
      .mockResolvedValueOnce({ commands: [], prompt: [] })
      .mockReturnValue(fresh.promise);
    const service = new ObservationService<TestCatalog>({ watch, read });
    catalogHealth.service = service;
    const pane = renderRoute();
    try {
      await waitFor(() => {
        expect(read).toHaveBeenCalledOnce();
      });
      await act(async () => {
        closed.resolve();
      });
      expect(screen.getByText('Skill updates unavailable')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
      expect(mockWriteFiles).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Retry skill updates' }));
      expect(screen.getByText('Skill updates pending')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
      expect(mockWriteFiles).not.toHaveBeenCalled();
      expect(read).toHaveBeenCalledOnce();
      await act(async () => {
        ready.resolve();
      });
      await waitFor(() => {
        expect(read).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByText('Skill updates pending')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
      expect(mockWriteFiles).not.toHaveBeenCalled();
      await act(async () => {
        fresh.resolve({ commands: [], prompt: [] });
      });
      await waitFor(() => {
        expect(screen.queryByText('Skill updates pending')).not.toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
      await waitFor(() => {
        expect(mockWriteFiles).toHaveBeenCalledOnce();
      });
    } finally {
      pane.unmount();
      service.dispose();
      ready.resolve();
      fresh.resolve({ commands: [], prompt: [] });
    }
  });

  it('should retry a closed manifest in the same mounted route only after fresh watch acknowledgement', async () => {
    const firstClosed = Promise.withResolvers<void>();
    const nextReady = Promise.withResolvers<void>();
    const disposeFirst = vi.fn();
    mockWatchReady
      .mockReturnValueOnce({ ready: Promise.resolve(), closed: firstClosed.promise, dispose: disposeFirst })
      .mockReturnValueOnce({
        ready: nextReady.promise,
        closed: new Promise<void>(() => {
          /* Replacement remains connected. */
        }),
        dispose: vi.fn(),
      });
    mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify({ skills: {} })));
    renderRoute();
    const heading = screen.getByRole('heading', { level: 1, name: 'Plugins' });
    await waitFor(() => {
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      firstClosed.resolve();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
    expect(mockWriteFiles).not.toHaveBeenCalled();
    // Recovery uses the existing mounted owner; remounting must not substitute for Retry.
    const retry = await screen.findByRole('button', { name: 'Retry plugin updates' });
    mockReadFile.mockResolvedValue(
      encoder.encode(
        JSON.stringify({
          skills: {
            woodworking: {
              status: 'installed',
              source: 'tau-store',
              installedPath: '.agents/skills/woodworking/SKILL.md',
              version: '1.0.0',
              updatedAt: '2026-10-09T00:00:00.000Z',
            },
          },
        }),
      ),
    );
    await userEvent.click(retry);
    await waitFor(() => {
      expect(mockWatchReady).toHaveBeenCalledTimes(2);
    });
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
    expect(mockWriteFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry plugin updates' })).toBeInTheDocument();
    await act(async () => {
      nextReady.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Woodworking installed' })).toBeInTheDocument();
    });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { level: 1, name: 'Plugins' })).toBe(heading);
    expect(screen.queryByRole('button', { name: 'Retry plugin updates' })).not.toBeInTheDocument();
    expect(mockWriteFiles).not.toHaveBeenCalled();
  });

  it('should lead with the page title inside the shell main', () => {
    renderRoute();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plugins');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search plugins' })).toBeInTheDocument();
  });

  it('reports malformed manifest bytes and prevents a default-state install write', async () => {
    mockReadFile.mockResolvedValue(encoder.encode('{bad json'));
    renderRoute();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));
    expect(mockWriteFiles).not.toHaveBeenCalled();
  });

  it('should install a Tau Plugin Store skill as a visible .agents skill and update the manifest', async () => {
    renderRoute();

    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));

    await waitFor(() => {
      expect(mockWriteFiles).toHaveBeenCalledTimes(1);
    });

    const writeArgument = getFirstWrite();
    expect(writeArgument['.agents/skills/woodworking/SKILL.md']).toBeDefined();
    expect(decoder.decode(getWrittenContent(writeArgument, '.agents/skills/woodworking/SKILL.md'))).toContain(
      'name: woodworking',
    );
    const manifest = decodeManifest(writeArgument);
    const installedSkill = manifest.skills?.['woodworking'];
    expect(installedSkill?.status).toBe('installed');
    expect(installedSkill?.source).toBe('tau-store');
    expect(installedSkill?.installedPath).toBe('.agents/skills/woodworking/SKILL.md');
    expect(installedSkill?.version).toBe('1.0.0');
  });

  it('should preserve an existing user skill by writing the store copy to shadow metadata', async () => {
    mockExists.mockResolvedValue(true);
    mockUseSkillsCatalog.mockReturnValue([
      {
        name: 'woodworking',
        description: 'User-authored woodworking guidance',
        path: '.agents/skills/woodworking',
        source: 'user',
      },
    ]);

    renderRoute();

    await userEvent.click(screen.getByRole('button', { name: 'Install Woodworking' }));

    await waitFor(() => {
      expect(mockWriteFiles).toHaveBeenCalledTimes(1);
    });

    const writeArgument = getFirstWrite();
    expect(writeArgument['.agents/skills/woodworking/SKILL.md']).toBeUndefined();
    expect(writeArgument['.agents/plugins/tau-store/shadowed/woodworking/SKILL.md']).toBeDefined();
    const manifest = decodeManifest(writeArgument);
    const installedSkill = manifest.skills?.['woodworking'];
    expect(installedSkill?.status).toBe('shadowed');
    expect(installedSkill?.shadowPath).toBe('.agents/plugins/tau-store/shadowed/woodworking/SKILL.md');
  });

  it('should render filesystem-backed install state from the manifest', async () => {
    mockReadFile.mockResolvedValue(
      encoder.encode(
        JSON.stringify({
          skills: {
            woodworking: {
              status: 'installed',
              source: 'tau-store',
              installedPath: '.agents/skills/woodworking/SKILL.md',
              version: '1.0.0',
              updatedAt: '2026-06-02T00:00:00.000Z',
            },
          },
        }),
      ),
    );

    renderRoute();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Woodworking installed' })).toBeInTheDocument();
    });
  });

  it('should render create-skill as an installed system skill without an install action', async () => {
    renderRoute();

    await waitFor(() => {
      expect(mockReadFile).toHaveBeenCalledWith('.agents/plugins/installed.json');
    });

    expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByText('Create Skill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Skill installed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install Create Skill' })).not.toBeInTheDocument();
  });
});
