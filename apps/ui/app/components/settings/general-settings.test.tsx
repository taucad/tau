import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettings } from '#components/settings/general-settings.js';

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
  const Theme = {
    LIGHT: 'light',
    DARK: 'dark',
  } as const;

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
      systemOption,
    ],
    useTheme: () => ({
      themeWithSystem: null,
      theme: Theme.LIGHT,
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
  ComboBoxResponsive: ({ children }: { children: ReactNode }): ReactElement => <div>{children}</div>,
}));

vi.mock('#components/ui/color-picker.js', () => ({
  ColorPicker: ({ children }: { children: ReactNode }): ReactElement => <div>{children}</div>,
}));

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCodeInlayHintsValue = false;
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
});
