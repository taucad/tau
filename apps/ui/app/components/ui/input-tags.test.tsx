// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tags, TagsTrigger } from '#components/ui/input-tags.js';

type TagsHarnessProps = {
  readonly initialTags?: string[];
  readonly isDisabled?: boolean;
  readonly onTagsChange?: (tags: string[]) => void;
  readonly shouldRenderNextFocusable?: boolean;
};

const TagsHarness = ({
  initialTags = [],
  isDisabled,
  onTagsChange,
  shouldRenderNextFocusable,
}: TagsHarnessProps): React.JSX.Element => {
  const [tags, setTags] = useState(initialTags);

  return (
    <>
      <Tags
        tags={tags}
        onTagsChange={(nextTags) => {
          setTags(nextTags);
          onTagsChange?.(nextTags);
        }}
      >
        <TagsTrigger inputAriaLabel='Tags' placeholder='Add people' disabled={isDisabled} />
      </Tags>
      {shouldRenderNextFocusable ? <button type='button'>Next field</button> : null}
    </>
  );
};

afterEach(() => {
  cleanup();
});

describe('Tags', () => {
  it('adds normalized tags with Enter', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness onTagsChange={onTagsChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'Friend@Example.com{Enter}');

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(onTagsChange).toHaveBeenLastCalledWith(['friend@example.com']);
  });

  it('adds normalized tags when tabbing away from active input text', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness onTagsChange={onTagsChange} shouldRenderNextFocusable />);

    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'Friend@Example.com');
    await user.tab();

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus();
    expect(onTagsChange).toHaveBeenLastCalledWith(['friend@example.com']);
  });

  it('deduplicates normalized tags', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness initialTags={['friend@example.com']} onTagsChange={onTagsChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'Friend@Example.com{Enter}');

    expect(screen.getAllByText('friend@example.com')).toHaveLength(1);
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it('removes a tag from the remove button', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness initialTags={['friend@example.com', 'team@example.com']} onTagsChange={onTagsChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove friend@example.com' }));

    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('team@example.com')).toBeInTheDocument();
    expect(onTagsChange).toHaveBeenLastCalledWith(['team@example.com']);
  });

  it('removes the last tag with Backspace on an empty input', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness initialTags={['friend@example.com', 'team@example.com']} onTagsChange={onTagsChange} />);

    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(input);
    await user.keyboard('{Backspace}');

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.queryByText('team@example.com')).not.toBeInTheDocument();
    expect(onTagsChange).toHaveBeenLastCalledWith(['friend@example.com']);
  });

  it('does not mutate tags while disabled', async () => {
    const user = userEvent.setup();
    const onTagsChange = vi.fn();
    render(<TagsHarness initialTags={['friend@example.com']} isDisabled onTagsChange={onTagsChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'team@example.com{Enter}');
    await user.click(screen.getByRole('button', { name: 'Remove friend@example.com' }));

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.queryByText('team@example.com')).not.toBeInTheDocument();
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
