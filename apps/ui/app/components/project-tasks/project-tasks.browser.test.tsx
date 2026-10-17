import '#styles/global.css';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ProjectInstructions } from '#components/project-tasks/project-instructions.js';

const instructionFiles = vi.hoisted(() => ({ text: '' }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#hooks/use-file-manager.js', () => {
  const manager = {
    recordFiles: {
      exists: async () => true,
      stat: async () => ({
        type: 'file',
        contentKind: 'text',
        size: new TextEncoder().encode(instructionFiles.text).byteLength,
      }),
      readFile: async () => new TextEncoder().encode(instructionFiles.text),
    },
    parameterFiles: { mkdir: async () => undefined },
    workbenchFiles: {
      writeFileChecked: async (input: { data: Uint8Array<ArrayBuffer> }) => {
        instructionFiles.text = new TextDecoder().decode(input.data);
        return { status: 'applied', content: input.data };
      },
    },
  };
  return {
    useFileManager: () => manager,
    useOptionalFileManager: () => manager,
    useSharedFileManagerWorker: () => undefined,
  };
});

afterEach(cleanup);

it('opens project instructions, saves them, and restores trigger focus when closed with Escape', async () => {
  instructionFiles.text = '';
  render(
    <TooltipProvider>
      <ProjectInstructions />
    </TooltipProvider>,
  );
  const trigger = screen.getByRole('button', { name: 'Project instructions' });
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('dialog', { name: 'Project instructions' })).toBeVisible();
  const editor = screen.getByRole('textbox', { name: 'Instructions' });
  await waitFor(() => {
    expect(editor.hasAttribute('disabled')).toBe(false);
  });
  editor.focus();
  await userEvent.keyboard('Use millimeters. Reference knowledge/materials.md');
  screen.getByRole('button', { name: 'Save instructions' }).focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('status')).toHaveTextContent('Instructions saved');
  const dialog = screen.getByRole('dialog', { name: 'Project instructions' });
  const reload = screen.getByRole('button', { name: 'Load instructions again' });
  expect(reload.getBoundingClientRect().right).toBeLessThanOrEqual(dialog.getBoundingClientRect().right);
  await page.screenshot({ fullPage: true });
  expect(instructionFiles.text).toBe('Use millimeters. Reference knowledge/materials.md');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => {
    expect(document.activeElement).toBe(trigger);
  });
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('textbox', { name: 'Instructions' })).toHaveValue(instructionFiles.text);
});
