// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileProvenance } from '@taucad/types';
import type { ReactNode } from 'react';
import { ProjectContext } from '@taucad/ui-core/contexts/project-context';
import type { ProjectContextValue } from '@taucad/ui-core/contexts/project-context';
import { FileLink } from '#components/files/file-link.js';

const editorSend = vi.fn();
const project: ProjectContextValue = {
  projectId: 'project-1',
  projectRef: { send: vi.fn() },
  editorRef: { send: editorSend },
};

function ProjectWrapper({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <ProjectContext.Provider value={project}>{children}</ProjectContext.Provider>;
}

const systemSkill: FileProvenance = {
  source: 'system-skills',
  versioned: false,
  agentAccess: 'read-only',
  identity: 'skill:cad-openscad@1.4.0#abc123',
};

beforeEach(() => {
  editorSend.mockClear();
});

describe('FileLink', () => {
  it('opens a project file for editing and does not disturb the tree', async () => {
    render(<FileLink path='main.scad'>main.scad</FileLink>, { wrapper: ProjectWrapper });

    await userEvent.click(screen.getByRole('button', { name: 'main.scad' }));

    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', path: 'main.scad' }));
    expect(editorSend.mock.calls[0]?.[0]).not.toHaveProperty('readOnly', true);
    expect(editorSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'revealFileInTree' }));
  });

  it('opens a non-project file read-only and reveals it in the composed tree', async () => {
    const path = '.agents/skills/cad-openscad/SKILL.md';
    render(
      <FileLink path={path} provenance={systemSkill}>
        cad-openscad
      </FileLink>,
      { wrapper: ProjectWrapper },
    );

    await userEvent.click(screen.getByRole('button', { name: 'cad-openscad' }));

    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', path, readOnly: true }));
    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'revealFileInTree', path }));
  });
});
