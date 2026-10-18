// @vitest-environment jsdom
/* oxlint-disable eslint/no-await-in-loop -- The checked-write fixture verifies ordered preconditions before applying bytes. */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { FileSystemProvider } from '@taucad/filesystem';
import { createRootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { RootedContentOwner, RootedFiles } from '@taucad/fs-client/rooted-content-client';
import type { RecordFilesClient, ParameterFilesClient, WorkbenchFilesClient } from '#hooks/use-file-manager.js';
import { ProjectInstructionsEditor } from '#components/project-tasks/project-instructions.js';

const project = vi.hoisted(() => ({ id: 'project-a' }));
let manager: {
  recordFiles: RecordFilesClient;
  parameterFiles: ParameterFilesClient;
  workbenchFiles: WorkbenchFilesClient;
};
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => manager }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: project.id }) }));
let provider: FileSystemProvider;
let owner: RootedContentOwner<'working-copy'>;
let shouldRefuseWrite = false;
const opens: string[] = [];
const reads: string[] = [];
const checkedPaths: string[] = [];
const absolute = (root: string, path: string): string => `${root.slice(1)}/${path}`;
const canonical = 'projects/project-a/.tau/AGENTS.md';
const candidate = 'checkouts/candidate-a/.tau/AGENTS.md';

beforeEach(async () => {
  project.id = 'project-a';
  shouldRefuseWrite = false;
  opens.length = 0;
  reads.length = 0;
  checkedPaths.length = 0;
  provider = await createMemoryProvider();
  owner = createRootedContentClient({
    open: async (root: string) => {
      opens.push(root);
      const files = mock<RootedFiles>();
      async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
      async function readFile(path: string, encoding: 'utf8'): Promise<string>;
      async function readFile(path: string, encoding?: 'utf8'): Promise<Uint8Array<ArrayBuffer> | string> {
        reads.push(absolute(root, path));
        return encoding ? provider.readFile(absolute(root, path), encoding) : provider.readFile(absolute(root, path));
      }
      files.exists.mockImplementation(async (path) => provider.exists(absolute(root, path)));
      files.stat.mockImplementation(async (path, options) => provider.stat(absolute(root, path), options));
      files.mkdir.mockImplementation(async (path, options) => provider.mkdir(absolute(root, path), options));
      files.writeFileChecked.mockImplementation(async (input) => {
        if (shouldRefuseWrite) {
          throw new Error('The canonical project authority is read-only.');
        }
        checkedPaths.push(absolute(root, input.path));
        for (const condition of input.preconditions) {
          const path = absolute(root, condition.path);
          const exists = await provider.exists(path);
          if (condition.expected === null) {
            if (exists) {
              return {
                status: 'conflict',
                conflicts: [{ path: condition.path, actual: await provider.readFile(path) }],
              };
            }
          } else if (
            !exists ||
            Buffer.compare(Buffer.from(await provider.readFile(path)), Buffer.from(condition.expected)) !== 0
          ) {
            return {
              status: 'conflict',
              conflicts: [{ path: condition.path, actual: exists ? await provider.readFile(path) : null }],
            };
          }
        }
        await provider.writeFile(absolute(root, input.path), input.data);
        return { status: 'applied', content: await provider.readFile(absolute(root, input.path)) };
      });
      return { files: { ...files, readFile }, dispose: () => undefined };
    },
  });
  const files = owner.files('working-copy');
  manager = { recordFiles: files, parameterFiles: files, workbenchFiles: files };
});
afterEach(() => {
  cleanup();
  owner.dispose();
  provider.dispose();
});

const editorReady = async (): Promise<HTMLElement> => {
  const editor = screen.getByRole('textbox', { name: 'Instructions' });
  await waitFor(() => {
    expect(editor.hasAttribute('disabled')).toBe(false);
  });
  return editor;
};

describe('Canonical project instructions', () => {
  it('loads and saves the canonical project while the selected candidate file remains unchanged, and survives reopen', async () => {
    await provider.writeFile(canonical, 'Current canonical instructions');
    await provider.writeFile(candidate, 'Old candidate instructions');
    const view = render(<ProjectInstructionsEditor />);
    const editor = await editorReady();
    expect(editor).toHaveProperty('value', 'Current canonical instructions');
    fireEvent.change(editor, { target: { value: 'Use millimeters. Reference knowledge/materials.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    await screen.findByRole('status');
    expect(await provider.readFile(canonical, 'utf8')).toBe('Use millimeters. Reference knowledge/materials.md');
    expect(await provider.readFile(candidate, 'utf8')).toBe('Old candidate instructions');
    expect(opens).toEqual(['/projects/project-a']);
    expect(checkedPaths).toEqual([canonical]);
    view.unmount();
    render(<ProjectInstructionsEditor />);
    const reopened = await editorReady();
    expect(reopened).toHaveProperty('value', 'Use millimeters. Reference knowledge/materials.md');
  });

  it('retargets an open editor when project identity changes without copying the previous project draft', async () => {
    await provider.writeFile(canonical, 'Project A');
    await provider.writeFile('projects/project-b/.tau/AGENTS.md', 'Project B');
    const view = render(<ProjectInstructionsEditor />);
    fireEvent.change(await editorReady(), { target: { value: 'Unsaved A draft' } });
    project.id = 'project-b';
    view.rerender(<ProjectInstructionsEditor />);
    const editor = await editorReady();
    expect(editor).toHaveProperty('value', 'Project B');
    fireEvent.change(editor, { target: { value: 'Updated B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    await screen.findByRole('status');
    expect(await provider.readFile(canonical, 'utf8')).toBe('Project A');
    expect(await provider.readFile('projects/project-b/.tau/AGENTS.md', 'utf8')).toBe('Updated B');
    expect(opens).toEqual(['/projects/project-a', '/projects/project-b']);
  });

  it('retains the draft and does not bypass a canonical authority refusal', async () => {
    await provider.writeFile(canonical, 'Original');
    shouldRefuseWrite = true;
    render(<ProjectInstructionsEditor />);
    const editor = await editorReady();
    fireEvent.change(editor, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('read-only');
    expect(editor).toHaveProperty('value', 'Keep this draft');
    expect(await provider.readFile(canonical, 'utf8')).toBe('Original');
    expect(opens).toEqual(['/projects/project-a']);
  });

  it('checks the exact loaded canonical bytes atomically rather than overwriting an external update', async () => {
    await provider.writeFile(canonical, 'Original');
    render(<ProjectInstructionsEditor />);
    const editor = await editorReady();
    await provider.writeFile(canonical, 'Changed elsewhere');
    fireEvent.change(editor, { target: { value: 'My draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('changed elsewhere');
    expect(await provider.readFile(canonical, 'utf8')).toBe('Changed elsewhere');
  });

  it('refuses a concurrent creation when instructions were absent at load', async () => {
    render(<ProjectInstructionsEditor />);
    const editor = await editorReady();
    await provider.writeFile(canonical, 'Created elsewhere');
    fireEvent.change(editor, { target: { value: 'My draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    await screen.findByRole('alert');
    expect(await provider.readFile(canonical, 'utf8')).toBe('Created elsewhere');
  });

  it.each(['binary', 'oversized'])('keeps %s content out of the text editor before reading its body', async (kind) => {
    await provider.writeFile(
      canonical,
      kind === 'binary' ? new Uint8Array([0, 1, 2]) : new Uint8Array(2 * 1024 * 1024).fill(97),
    );
    render(<ProjectInstructionsEditor />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(kind === 'binary' ? 'binary' : 'too large');
    expect(screen.getByRole('textbox', { name: 'Instructions' }).hasAttribute('disabled')).toBe(true);
    expect(checkedPaths).toEqual([]);
    expect(reads).toEqual([]);
  });
});
