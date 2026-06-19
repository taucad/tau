import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillMetadata } from '@taucad/chat';

const mockReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockExists = vi.fn<(path: string) => Promise<boolean>>();
const mockUseSkillsCatalog = vi.fn<() => SkillMetadata[]>();

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    writeFiles: mockWriteFiles,
    exists: mockExists,
  }),
}));

vi.mock('#hooks/use-skills-catalog.js', () => ({
  useSkillsCatalog: mockUseSkillsCatalog,
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

function renderRoute(): void {
  render(
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
    mockReadFile.mockRejectedValue(new Error('manifest missing'));
    mockWriteFiles.mockResolvedValue(undefined);
    mockExists.mockResolvedValue(false);
    mockUseSkillsCatalog.mockReturnValue([]);
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

  it('should render create-skill as an installed System skill without an install action', async () => {
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
