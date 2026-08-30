import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextSuggestionDropdown, virtualizationThreshold } from '#components/chat/tiptap/context-suggestion.js';
import type { ContextSuggestionItem, SuggestionPopupState } from '#components/chat/tiptap/suggestion-types.js';
import {
  recentFilesGroup,
  filesFoldersGroup,
  pastChatsGroup,
  takeScreenshotGroup,
  getItemsForCategory,
} from '#components/chat/tiptap/context-suggestion.utils.js';

// ── Mocks ──────────────────────────────────────────────────────────────

Element.prototype.scrollIntoView = vi.fn();

vi.mock('#components/icons/file-extension-icon.js', () => ({
  FileExtensionIcon: ({ className }: { filename: string; className?: string }) => (
    <span data-testid='file-ext-icon' className={className} />
  ),
}));

// ── Factories ──────────────────────────────────────────────────────────

function createItem(
  overrides: Partial<ContextSuggestionItem> & { id: string; label: string; group: string },
): ContextSuggestionItem {
  return { chipType: 'file', ...overrides };
}

function createState(
  overrides: Partial<SuggestionPopupState<ContextSuggestionItem>> = {},
): SuggestionPopupState<ContextSuggestionItem> {
  return {
    query: '',
    items: [],
    command: vi.fn(),
    clientRect: () => new DOMRect(100, 300, 264, 0),
    ...overrides,
  };
}

const recentFileItems: ContextSuggestionItem[] = [
  createItem({ id: 'f1', label: 'main.ts', group: recentFilesGroup, sortKey: 5000 }),
  createItem({ id: 'f2', label: 'utils.ts', group: recentFilesGroup, sortKey: 4000 }),
  createItem({ id: 'f3', label: 'index.ts', group: recentFilesGroup, sortKey: 3000 }),
];

const categoryItems: ContextSuggestionItem[] = [
  createItem({ id: 'ff1', label: 'component.tsx', group: filesFoldersGroup, sortKey: 2000 }),
  createItem({ id: 'ff2', label: 'service.ts', group: filesFoldersGroup, sortKey: 1000 }),
  createItem({ id: 'ff3', label: 'main.ts', group: filesFoldersGroup, sortKey: 5000 }),
  createItem({ id: 'ff4', label: 'utils.ts', group: filesFoldersGroup, sortKey: 4000 }),
  createItem({ id: 'ff5', label: 'index.ts', group: filesFoldersGroup, sortKey: 3000 }),
  createItem({ id: 'c1', label: 'Chat 1', group: pastChatsGroup, chipType: 'chat', sortKey: 5000 }),
  createItem({ id: 'c2', label: 'Chat 2', group: pastChatsGroup, chipType: 'chat', sortKey: 3000 }),
  createItem({
    id: 's1',
    label: 'Current view',
    group: takeScreenshotGroup,
    chipType: 'screenshot',
    isAction: true,
    screenshotAction: { type: 'single' },
  }),
];

const allItems = [...recentFileItems, ...categoryItems];

function generateFileItems(count: number, group = filesFoldersGroup): ContextSuggestionItem[] {
  return Array.from({ length: count }, (_, i) =>
    createItem({ id: `gen-${i}`, label: `file-${i}.ts`, group, sortKey: count - i }),
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

type KeydownRef = React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;

function createKeydownRef(): KeydownRef {
  const ref: KeydownRef = { current: undefined };
  return ref;
}

function renderDropdown(stateOverrides: Partial<SuggestionPopupState<ContextSuggestionItem>> = {}) {
  const keydownRef = createKeydownRef();
  const state = createState({ items: allItems, ...stateOverrides });

  render(<ContextSuggestionDropdown state={state} keydownHandlerRef={keydownRef} />);

  return { state, keydownRef };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('ContextSuggestionDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('root view (empty query)', () => {
    it('uses the shared menu surface and item geometry', () => {
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const scrollArea = screen.getByTestId('context-suggestion-scroll-area');
      const firstItem = within(dropdown).getAllByRole('button')[0]!;

      expect(dropdown).toHaveClass('rounded-md', 'border-0', 'shadow-menu');
      expect(dropdown).not.toHaveClass('scroll-shadows-y', 'overflow-y-auto');
      expect(scrollArea).toHaveClass('scroll-shadows-y', 'overflow-y-auto');
      expect(scrollArea.parentElement).toBe(dropdown);
      expect(firstItem).toHaveClass('rounded-sm');
      expect(firstItem).toHaveAttribute('data-selected', 'true');
    });

    it('should render the 3 recent files at the top sorted by most recently modified', () => {
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const buttons = within(dropdown).getAllByRole('button');

      expect(buttons[0]).toHaveTextContent('main.ts');
      expect(buttons[1]).toHaveTextContent('utils.ts');
      expect(buttons[2]).toHaveTextContent('index.ts');
    });

    it('should render a divider between recent files and categories', () => {
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const separator = dropdown.querySelector('[data-slot="separator-root"]');
      expect(separator).toBeInTheDocument();
    });

    it('should render category rows with labels', () => {
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      expect(within(dropdown).getByText(filesFoldersGroup)).toBeInTheDocument();
      expect(within(dropdown).getByText(pastChatsGroup)).toBeInTheDocument();
      expect(within(dropdown).getByText(takeScreenshotGroup)).toBeInTheDocument();
    });

    it('should hide categories with no items', () => {
      const itemsWithoutChats = allItems.filter((i) => i.group !== pastChatsGroup);
      renderDropdown({ items: itemsWithoutChats });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      expect(within(dropdown).queryByText(pastChatsGroup)).not.toBeInTheDocument();
      expect(within(dropdown).getByText(filesFoldersGroup)).toBeInTheDocument();
    });
  });

  describe('drill-down', () => {
    it('should show category items when clicking a category row', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(pastChatsGroup));

      expect(within(dropdown).getByText('Chat 1')).toBeInTheDocument();
      expect(within(dropdown).getByText('Chat 2')).toBeInTheDocument();
    });

    it('should hide root view items when drilled into a category', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(pastChatsGroup));

      expect(within(dropdown).queryByText(filesFoldersGroup)).not.toBeInTheDocument();
    });

    it('should show a back button with category name when drilled', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      const backButton = within(dropdown).getAllByRole('button')[0]!;
      expect(backButton).toHaveTextContent(filesFoldersGroup);
    });

    it('should render the back button as sticky so it stays visible during scroll', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      const backButton = within(dropdown).getAllByRole('button')[0]!;
      expect(backButton.parentElement!.className).toContain('sticky');
    });

    it('should return to root view when clicking the back button', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(pastChatsGroup));

      expect(within(dropdown).getByText('Chat 1')).toBeInTheDocument();

      const backButton = within(dropdown).getAllByRole('button')[0]!;
      await user.click(backButton);

      expect(within(dropdown).getByText(pastChatsGroup)).toBeInTheDocument();
    });

    it('should include all files in Files & Folders drilled view', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      expect(within(dropdown).getByText('component.tsx')).toBeInTheDocument();
      expect(within(dropdown).getByText('service.ts')).toBeInTheDocument();
    });
  });

  describe('fuzzy search (non-empty query)', () => {
    it('should show matching items via fuzzy search', () => {
      renderDropdown({ query: 'chat' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      expect(within(dropdown).getByText('Chat 1')).toBeInTheDocument();
      expect(within(dropdown).getByText('Chat 2')).toBeInTheDocument();
    });

    it('should show matching section headers at the top when query matches a category name', () => {
      renderDropdown({ query: 'pas' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const buttons = within(dropdown).getAllByRole('button');
      expect(buttons[0]).toHaveTextContent(pastChatsGroup);
    });

    it('should render matched category headers as drillable with chevron', () => {
      renderDropdown({ query: 'fil' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const buttons = within(dropdown).getAllByRole('button');
      const categoryButton = buttons.find((b) => b.textContent.includes(filesFoldersGroup));
      expect(categoryButton).toBeInTheDocument();
    });

    it('should drill into category when clicking a matched category header in search', async () => {
      const user = userEvent.setup();
      renderDropdown({ query: 'pas' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(pastChatsGroup));

      expect(within(dropdown).getByText('Chat 1')).toBeInTheDocument();
      expect(within(dropdown).getByText('Chat 2')).toBeInTheDocument();
    });

    it('should show matched items below matched categories', () => {
      renderDropdown({ query: 'main' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const buttons = within(dropdown).getAllByRole('button');
      const labels = buttons.map((b) => b.textContent);
      expect(labels.some((l) => l.includes('main.ts'))).toBe(true);
    });

    it('should not show separator when query is non-empty', () => {
      renderDropdown({ query: 'chat' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      const separator = dropdown.querySelector('[data-slot="separator-root"]');
      expect(separator).not.toBeInTheDocument();
    });

    it('should show "No results found" when query matches nothing', () => {
      renderDropdown({ query: 'zzzzzzzzz' });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      expect(within(dropdown).getByText('No results found')).toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('should call command when Enter is pressed on a file item', () => {
      const { state, keydownRef } = renderDropdown();

      keydownRef.current!(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', label: 'main.ts' }));
    });

    it('should drill into category when Enter is pressed on a category row', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');

      await user.click(within(dropdown).getByText(filesFoldersGroup));

      expect(within(dropdown).getByText('component.tsx')).toBeInTheDocument();
      expect(within(dropdown).getByText('service.ts')).toBeInTheDocument();
    });

    it('should go back to root on Escape when drilled and consume the event', async () => {
      const user = userEvent.setup();
      const { keydownRef } = renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      expect(within(dropdown).queryByText(pastChatsGroup)).not.toBeInTheDocument();

      let consumed = false;
      act(() => {
        consumed = keydownRef.current!(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(consumed).toBe(true);
      expect(within(dropdown).getByText(filesFoldersGroup)).toBeInTheDocument();
    });

    it('should NOT consume Escape when at root level (allows popup to close)', () => {
      const { keydownRef } = renderDropdown();

      const consumed = keydownRef.current!(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(consumed).toBe(false);
    });
  });

  describe('empty state', () => {
    it('should show "No results found" when items array is empty and no query', () => {
      renderDropdown({ items: [] });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      expect(within(dropdown).getByText('No results found')).toBeInTheDocument();
    });

    it('should return undefined when clientRect returns null', () => {
      const keydownRef = createKeydownRef();
      // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Tiptap returns null
      const state = createState({ clientRect: () => null as unknown as DOMRect });

      const { container } = render(<ContextSuggestionDropdown state={state} keydownHandlerRef={keydownRef} />);

      expect(container.innerHTML).toBe('');
    });
  });

  describe('virtualization', () => {
    const largeFileCount = virtualizationThreshold + 10;
    const largeFileItems = generateFileItems(largeFileCount);
    const largeItems = [...recentFileItems, ...largeFileItems, ...categoryItems];

    it('should render Virtuoso when drilled items exceed the threshold', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: largeItems });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).toBeInTheDocument();
    });

    it('should NOT render Virtuoso when drilled items are below the threshold', async () => {
      const user = userEvent.setup();
      renderDropdown();

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(pastChatsGroup));

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).not.toBeInTheDocument();
    });

    it('should keep the sticky back-header outside Virtuoso in drilled view', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: largeItems });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      const backButton = within(dropdown).getAllByRole('button')[0]!;
      expect(backButton).toHaveTextContent(filesFoldersGroup);
      expect(backButton.parentElement!.className).toContain('sticky');

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).toBeInTheDocument();
      expect(backButton.closest('[data-testid="virtuoso-scroller"]')).toBeNull();
    });

    it('should render Virtuoso when search results exceed the threshold', () => {
      renderDropdown({ items: largeItems, query: 'file' });

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).toBeInTheDocument();
    });

    it('should NOT render Virtuoso when search results are below the threshold', () => {
      renderDropdown({ query: 'chat' });

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).not.toBeInTheDocument();
    });

    it('should never render Virtuoso in root view', () => {
      renderDropdown({ items: largeItems });

      const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(virtuosoScroller).not.toBeInTheDocument();
    });

    it('should navigate with arrow keys when virtualized', async () => {
      const user = userEvent.setup();
      const { state, keydownRef } = renderDropdown({ items: largeItems });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      act(() => {
        keydownRef.current!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      });
      act(() => {
        keydownRef.current!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      });

      act(() => {
        keydownRef.current!(new KeyboardEvent('keydown', { key: 'Enter' }));
      });

      const expectedItem = getItemsForCategory(largeItems, filesFoldersGroup)[2]!;
      expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ id: expectedItem.id }));
    });

    it('should wrap around when navigating past the last item', async () => {
      const user = userEvent.setup();
      const { state, keydownRef } = renderDropdown({ items: largeItems });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      act(() => {
        keydownRef.current!(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      });
      act(() => {
        keydownRef.current!(new KeyboardEvent('keydown', { key: 'Enter' }));
      });

      const expectedLastItem = largeFileItems.at(-1)!;
      expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ id: expectedLastItem.id }));
    });

    it('should return to root view from virtualized drilled view via back button', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: largeItems });

      const dropdown = screen.getByTestId('context-suggestion-dropdown');
      await user.click(within(dropdown).getByText(filesFoldersGroup));

      expect(document.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();

      const backButton = within(dropdown).getAllByRole('button')[0]!;
      await user.click(backButton);

      expect(document.querySelector('[data-testid="virtuoso-scroller"]')).not.toBeInTheDocument();
      expect(within(dropdown).getByText(filesFoldersGroup)).toBeInTheDocument();
    });
  });
});
