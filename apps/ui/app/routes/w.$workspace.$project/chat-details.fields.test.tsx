// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

// The main-file picker reads the project's file tree; these tests are about the field labels around it.
vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({ selectedFile, title }: { selectedFile: string; title: string }) => (
    <button type='button' aria-label={title}>
      {selectedFile}
    </button>
  ),
}));

const { DetailsPanelContent } = await import('#routes/w.$workspace.$project/chat-details.js');

const renderFields = (isReadOnly: boolean): void => {
  render(
    <TooltipProvider>
      <DetailsPanelContent
        projectName='Desk lamp'
        projectDescription='A compact task light'
        projectTags={['lighting']}
        mainFile='main.ts'
        isReadOnly={isReadOnly}
        hasManifestIssue={false}
        backendType='memory'
        onNameChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onTagsChange={vi.fn()}
        onMainFileChange={vi.fn()}
      />
    </TooltipProvider>,
  );
};

/** PN-DET-1 and I6 against the real Tags field: each field's visible label is its accessible name. */
describe('Details fields', () => {
  it('names the real Tags combobox and the Main file group by their visible labels', () => {
    renderFields(false);

    const tags = screen.getByRole('combobox', { name: 'Tags' });
    expect(tags).toHaveAttribute('id', 'project-tags');
    expect(screen.getByText('Tags', { selector: 'label' })).toHaveAttribute('for', 'project-tags');
    expect(tags).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove lighting' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Main file' })).toContainElement(
      screen.getByRole('button', { name: 'Select Main File' }),
    );
  });

  it('keeps read-only Tags a labelled, disabled field like Name and Description', () => {
    renderFields(true);

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeDisabled();
    expect(screen.getByText('lighting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove lighting' })).toBeNull();
  });
});
