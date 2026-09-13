// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileProvenance } from '@taucad/types';
import { FileLink } from '#components/files/file-link.js';

const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: editorSend } }),
}));

const builtIn: FileProvenance = {
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
    render(<FileLink path='main.scad'>main.scad</FileLink>);

    await userEvent.click(screen.getByRole('button', { name: 'main.scad' }));

    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', path: 'main.scad' }));
    expect(editorSend.mock.calls[0]?.[0]).not.toHaveProperty('readOnly', true);
    expect(editorSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'revealFileInTree' }));
  });

  it('opens a non-project file read-only and reveals it in the composed tree', async () => {
    const path = '.agents/skills/cad-openscad/SKILL.md';
    render(
      <FileLink path={path} provenance={builtIn}>
        cad-openscad
      </FileLink>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'cad-openscad' }));

    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', path, readOnly: true }));
    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'revealFileInTree', path }));
  });
});
