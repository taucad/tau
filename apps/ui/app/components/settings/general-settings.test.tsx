import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import { GeneralSettings } from '#components/settings/general-settings.js';
import type { ThemeOption } from '#hooks/use-theme.js';

const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

const mockSetTheme = vi.fn();
const mockSetHue = vi.fn();
const mockResetHue = vi.fn();
const mockUpdatePreferences = vi.fn();
const mockSetCodeInlayHints = vi.fn();

let mockCodeInlayHintsValue: boolean;

vi.mock('react-router', () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }): ReactElement => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: () => ({
    preferences: { allowsAiTraining: false },
    isLoading: false,
    error: undefined,
    updatePreferences: mockUpdatePreferences,
    isUpdating: false,
  }),
}));

vi.mock('#hooks/use-theme.js', () => {
  /* eslint-disable @typescript-eslint/naming-convention -- Mirrors the production Theme values. */
  const Theme = {
    LIGHT: 'light',
    DARK: 'dark',
    BLACK: 'black',
    HIGH_CONTRAST: 'high-contrast',
  } as const;
  /* eslint-enable @typescript-eslint/naming-convention -- Re-enable project naming checks. */

  const systemOption = {
    id: null,
    name: 'System',
    description: 'Follow your system preference',
  };

  return {
    Theme,
    themeOptions: [
      {
        id: Theme.LIGHT,
        name: 'Light',
        description: 'A bright, clean look',
      },
      {
        id: Theme.DARK,
        name: 'Dark',
        description: 'Easy on the eyes',
      },
      {
        id: Theme.BLACK,
        name: 'Black',
        description: 'True black with ultra-dark surfaces',
      },
      {
        id: Theme.HIGH_CONTRAST,
        name: 'High Contrast',
        description: 'Stronger text, borders, and focus indicators',
      },
      systemOption,
    ],
    useTheme: () => ({
      themeWithSystem: null,
      theme: Theme.LIGHT,
      isHighContrast: false,
      setTheme: mockSetTheme,
      currentOption: systemOption,
    }),
  };
});

vi.mock('#hooks/use-color.js', () => ({
  useColor: () => ({
    hue: 180,
    setHue: mockSetHue,
    resetHue: mockResetHue,
  }),
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (name: string, defaultValue: boolean) => {
    const value = name === 'code-inlay-hints' ? mockCodeInlayHintsValue : defaultValue;
    return [value, name === 'code-inlay-hints' ? mockSetCodeInlayHints : vi.fn()];
  },
}));

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({
    children,
    groupedItems,
    renderLabel,
    onSelect,
    value,
  }: {
    children: ReactNode;
    groupedItems: Array<{ items: ThemeOption[] }>;
    renderLabel: (item: ThemeOption, selectedItem?: ThemeOption) => ReactNode;
    onSelect: (value: string) => void;
    value?: ThemeOption;
  }): ReactElement => (
    <div>
      {children}
      {groupedItems.flatMap(({ items }) =>
        items.map((item) => (
          <button
            key={String(item.id)}
            type='button'
            onClick={() => {
              onSelect(String(item.id));
            }}
          >
            {renderLabel(item, value)}
          </button>
        )),
      )}
    </div>
  ),
}));

vi.mock('#components/ui/color-picker.js', () => ({
  ColorPicker: ({ children }: { children: ReactNode }): ReactElement => <div>{children}</div>,
}));

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    mockCodeInlayHintsValue = false;
  });

  it('replaces the consent toggle with the no-train guarantee on paid tiers (T15/AD15)', () => {
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('pro'));

    render(<GeneralSettings />);

    expect(screen.getByText(/no-train guarantee/i)).toBeDefined();
    expect(screen.getByText(/never trains on your data/i)).toBeDefined();
    expect(screen.queryByText(/privacy mode enabled/i)).toBeNull();
    expect(screen.queryByText(/data sharing enabled/i)).toBeNull();
  });

  it('keeps the consent selector for free-tier users', () => {
    render(<GeneralSettings />);

    expect(screen.getByText(/privacy mode enabled/i)).toBeDefined();
    expect(screen.queryByText(/no-train guarantee/i)).toBeNull();
  });

  it('should render code inlay hints disabled by default', () => {
    render(<GeneralSettings />);

    expect(screen.getByText('Code Inlay Hints')).toBeInTheDocument();
    expect(screen.getByText('Show inline parameter names in code editors')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
  });

  it('should persist code inlay hints when toggled', async () => {
    render(<GeneralSettings />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch'));

    expect(mockSetCodeInlayHints).toHaveBeenCalledWith(true);
  });

  it('should render code inlay hints as enabled from the cookie', () => {
    mockCodeInlayHintsValue = true;

    render(<GeneralSettings />);

    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('should expose and select the High Contrast theme', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);

    await user.click(
      screen.getByRole('button', { name: /high contrast stronger text, borders, and focus indicators/i }),
    );

    expect(mockSetTheme).toHaveBeenCalledWith('high-contrast');
  });
});
