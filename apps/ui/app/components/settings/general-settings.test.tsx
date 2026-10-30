import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettings } from '#components/settings/general-settings.js';
import type { ThemeOption } from '#hooks/use-theme.js';

const mockSetTheme = vi.fn();
const mockSetHue = vi.fn();
const mockResetHue = vi.fn();
const mockSetCodeInlayHints = vi.fn();
const mockSetPointerCursors = vi.fn();

let mockCodeInlayHintsValue: boolean;
let mockPointerCursorsValue: boolean;

vi.mock('react-router', () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }): ReactElement => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  /* `useCommercialFeatures` reaches the settings dialog, which is URL state. */
  useSearchParams: (): [URLSearchParams, () => void] => [new URLSearchParams(), vi.fn()],
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
    if (name === 'code-inlay-hints') {
      return [mockCodeInlayHintsValue, mockSetCodeInlayHints];
    }
    if (name === 'pointer-cursors') {
      return [mockPointerCursorsValue, mockSetPointerCursors];
    }
    return [defaultValue, vi.fn()];
  },
}));

vi.mock('@taucad/ui/components/combobox-responsive', () => ({
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
    mockCodeInlayHintsValue = false;
    mockPointerCursorsValue = false;
  });

  it('should render code inlay hints disabled by default', () => {
    render(<GeneralSettings />);

    expect(screen.getByRole('group', { name: 'Code inlay hints' })).toHaveAccessibleDescription(
      'Show parameter names inline in code',
    );
    expect(screen.getByRole('switch', { name: 'Code inlay hints' })).toHaveAttribute('data-state', 'unchecked');
  });

  it('should persist code inlay hints when toggled', async () => {
    render(<GeneralSettings />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: 'Code inlay hints' }));

    expect(mockSetCodeInlayHints).toHaveBeenCalledWith(true);
  });

  it('should render code inlay hints as enabled from the cookie', () => {
    mockCodeInlayHintsValue = true;

    render(<GeneralSettings />);

    expect(screen.getByRole('switch', { name: 'Code inlay hints' })).toHaveAttribute('data-state', 'checked');
  });

  it('should render pointer cursors disabled by default', () => {
    render(<GeneralSettings />);

    expect(screen.getByRole('group', { name: 'Pointer cursors' })).toHaveAccessibleDescription(
      'Show a hand cursor over buttons and links',
    );
    expect(screen.getByRole('switch', { name: 'Pointer cursors' })).toHaveAttribute('data-state', 'unchecked');
  });

  it('should persist the pointer cursor preference when toggled', async () => {
    render(<GeneralSettings />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: 'Pointer cursors' }));

    expect(mockSetPointerCursors).toHaveBeenCalledWith(true);
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
