import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ChatParameters } from '#routes/builds_.$id/chat-parameters.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

// Test wrapper component that provides necessary providers
function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: 'offlineFirst',
            retry: false,
          },
          mutations: {
            networkMode: 'offlineFirst',
            retry: false,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

// Mock data for testing
const mockState = {
  parameters: {},
  defaultParameters: {
    isHidden: false,
    siteUrl: '',
    password: '',
    phoneNumber: '',
  },
  jsonSchema: {
    type: 'object',
    properties: {
      wifiType: {
        type: 'object',
        title: 'Wifi Type',
        properties: {
          isHidden: { type: 'boolean', title: 'Is Hidden' },
          networkName: { type: 'string', title: 'Network Name' },
          password: { type: 'string', title: 'Password' },
        },
      },
      phoneCallType: {
        type: 'object',
        title: 'Phone Call Type',
        properties: {
          phoneNumber: { type: 'string', title: 'Phone Number' },
        },
      },
      vCardType: {
        type: 'object',
        title: 'V Card Type',
        properties: {
          siteUrl: { type: 'string', title: 'Site Url' },
        },
      },
    },
  },
};

// Mock the XState imports
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn(),
}));

vi.mock('#routes/builds_.$id/cad-actor.js', () => ({
  cadActor: {
    send: vi.fn(),
  },
}));

describe('ChatParameters Search Component', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(async () => {
    user = userEvent.setup();
    vi.clearAllMocks();

    // Dynamic import and mock setup
    const { useSelector } = await import('@xstate/react');
    const { cadActor } = await import('#routes/builds_.$id/cad-actor.js');

    // Fix: Mock useSelector to properly handle selector functions
    vi.mocked(useSelector).mockImplementation((_actor, selector) => {
      // Call the selector function with our mock state structure
      const state = {
        context: mockState,
      };
      return selector(state);
    });

    vi.mocked(cadActor.send).mockImplementation(() => {
      // Noop
    });
  });

  it('shows "Is Hidden" parameter when searching for "hi"', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "hi" in search
    await user.type(searchInput, 'hi');

    // Should show "Is Hidden" parameter since "hi" is in "Is Hidden"
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    // Should NOT show unrelated parameters
    expect(screen.queryByLabelText('Parameter: Site Url')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Password')).toBeNull();
  });

  it('shows "Site Url" parameter when searching for "URL"', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "URL" in search
    await user.type(searchInput, 'URL');

    // Should show "Site Url" parameter since "url" is in "Site Url"
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();

    // Should NOT show unrelated parameters
    expect(screen.queryByLabelText('Parameter: Is Hidden')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Phone Number')).toBeNull();
  });

  it('shows groups when group title matches search', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "type" to match group titles like "wifiType", "phoneCallType"
    await user.type(searchInput, 'type');

    // Should show groups with "type" in their title
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: V Card Type')).toBeTruthy();
  });

  it('shows groups when child parameters match search', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "phone" to match "phoneNumber" parameter inside "phoneCallType" group
    await user.type(searchInput, 'phone');

    // Should show the group containing the matching child parameter
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Phone Number')).toBeTruthy();
  });

  it('is case insensitive', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Test different cases
    await user.type(searchInput, 'HIDDEN');
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, 'url');
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, 'WiFi');
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
  });

  it('preserves case in search input while searching case-insensitively', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type mixed case
    await user.type(searchInput, 'HiDdEn');

    // Input should preserve the exact case typed
    expect((searchInput as HTMLInputElement).value).toBe('HiDdEn');

    // But search should still work (case insensitive)
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
  });

  it('shows "No parameters matching" when no results found', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for something that doesn't exist
    await user.type(searchInput, 'nonexistent');

    // Should show no results message
    expect(screen.getByText('No parameters matching "nonexistent"')).toBeTruthy();

    // Should not show any parameters or groups
    expect(screen.queryByLabelText('Parameter: Is Hidden')).toBeNull();
    expect(screen.queryByLabelText('Group: Wifi Type')).toBeNull();
  });

  it('shows all parameters when search is cleared', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // First search for something specific
    await user.type(searchInput, 'hi');
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
    expect(screen.queryByLabelText('Parameter: Site Url')).toBeNull();

    // Clear the search
    await user.clear(searchInput);

    // All groups and parameters should be visible again
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: V Card Type')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Phone Number')).toBeTruthy();
  });

  it('hides empty groups when no children match search', async () => {
    render(
      <TestWrapper>
        <ChatParameters isExpanded={true} setIsExpanded={() => {}} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for something that only exists in one group
    await user.type(searchInput, 'hidden');

    // Should only show the group with matching content
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy(); // Contains "isHidden"
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    // Should NOT show groups without matching content
    expect(screen.queryByLabelText('Group: Phone Call Type')).toBeNull();
    expect(screen.queryByLabelText('Group: V Card Type')).toBeNull();
  });
});
