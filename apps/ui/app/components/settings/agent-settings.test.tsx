import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AgentSettings } from '#components/settings/agent-settings.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetShowModelCost = vi.fn();
const mockSetIncludeFileSystem = vi.fn();
const mockSetIncludeActiveFile = vi.fn();
const mockSetIncludeOpenFiles = vi.fn();
const mockSetTestingEnabled = vi.fn();

let mockCookieValues: Record<string, boolean>;

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (name: string, defaultValue: boolean) => {
    const value = mockCookieValues[name] ?? defaultValue;
    const setterMap: Record<string, ReturnType<typeof vi.fn>> = {
      'chat-model-cost': mockSetShowModelCost,
      'chat-ctx-fs': mockSetIncludeFileSystem,
      'chat-ctx-active': mockSetIncludeActiveFile,
      'chat-ctx-open': mockSetIncludeOpenFiles,
      'chat-testing-enabled': mockSetTestingEnabled,
    };
    return [value, setterMap[name] ?? vi.fn()];
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderAgentSettings(): ReturnType<typeof render> {
  return render(<AgentSettings />);
}

/**
 * Switches render in this order within AgentSettings:
 * 0 - Show credits
 * 1 - Testing tools
 * 2 - Project files
 * 3 - Active file
 * 4 - Open tabs
 */
const switchIndex = {
  showModelCost: 0,
  testing: 1,
  filesystem: 2,
  activeFile: 3,
  openTabs: 4,
} as const;

function getAllSwitches(): HTMLElement[] {
  return screen.getAllByRole('switch');
}

function getSwitchAt(index: number): HTMLElement {
  return getAllSwitches()[index]!;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieValues = {
      'chat-model-cost': true,
      'chat-ctx-fs': true,
      'chat-ctx-active': true,
      'chat-ctx-open': true,
      'chat-testing-enabled': true,
    };
  });

  // ── Card rendering ─────────────────────────────────────────────────────

  it('should toggle a switch when its row text is tapped', async () => {
    renderAgentSettings();

    await userEvent.click(screen.getByText('Include every open editor tab.'));

    expect(mockSetIncludeOpenFiles).toHaveBeenCalledTimes(1);
    expect(mockSetIncludeOpenFiles).toHaveBeenCalledWith(false);
  });

  it('should toggle a switch once when the switch itself is tapped inside its row', async () => {
    renderAgentSettings();

    await userEvent.click(screen.getByRole('switch', { name: 'Open tabs' }));

    expect(mockSetIncludeOpenFiles).toHaveBeenCalledTimes(1);
    expect(mockSetIncludeOpenFiles).toHaveBeenCalledWith(false);
  });

  it('should render all setting groups', () => {
    renderAgentSettings();

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show credits' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Testing tools' })).toBeInTheDocument();
  });

  it('should toggle a switch when its title is tapped', async () => {
    renderAgentSettings();

    await userEvent.click(screen.getByText('Testing tools'));

    expect(mockSetTestingEnabled).toHaveBeenCalledTimes(1);
    expect(mockSetTestingEnabled).toHaveBeenCalledWith(false);
  });

  it('should omit obsolete image controls', () => {
    renderAgentSettings();

    expect(screen.queryByText('Analysis Images')).not.toBeInTheDocument();
    expect(screen.queryByText('Screenshot Quality')).not.toBeInTheDocument();
  });

  it('should omit the retired code-preview control', () => {
    renderAgentSettings();

    expect(screen.queryByText('Tool Display')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Code Preview' })).not.toBeInTheDocument();
  });

  it('should render all switch toggles', () => {
    renderAgentSettings();

    const switches = getAllSwitches();
    expect(switches).toHaveLength(5);
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it('should render all switches as checked when cookies are true', () => {
    renderAgentSettings();

    const switches = getAllSwitches();
    for (const switchElement of switches) {
      expect(switchElement).toHaveAttribute('data-state', 'checked');
    }
  });

  it('should render switches as unchecked when cookies are false', () => {
    mockCookieValues = {
      'chat-model-cost': false,
      'chat-ctx-fs': false,
      'chat-ctx-active': false,
      'chat-ctx-open': false,
      'chat-testing-enabled': false,
    };

    renderAgentSettings();

    const switches = getAllSwitches();
    for (const switchElement of switches) {
      expect(switchElement).toHaveAttribute('data-state', 'unchecked');
    }
  });

  // ── Toggle interactions ────────────────────────────────────────────────

  it('should call setter when toggling Show Model Cost', async () => {
    renderAgentSettings();
    const user = userEvent.setup();

    await user.click(getSwitchAt(switchIndex.showModelCost));
    expect(mockSetShowModelCost).toHaveBeenCalledWith(false);
  });

  it('should call setter when toggling Filesystem context', async () => {
    renderAgentSettings();
    const user = userEvent.setup();

    await user.click(getSwitchAt(switchIndex.filesystem));
    expect(mockSetIncludeFileSystem).toHaveBeenCalledWith(false);
  });

  it('should call setter when toggling Active File context', async () => {
    renderAgentSettings();
    const user = userEvent.setup();

    await user.click(getSwitchAt(switchIndex.activeFile));
    expect(mockSetIncludeActiveFile).toHaveBeenCalledWith(false);
  });

  it('should call setter when toggling Open Tabs context', async () => {
    renderAgentSettings();
    const user = userEvent.setup();

    await user.click(getSwitchAt(switchIndex.openTabs));
    expect(mockSetIncludeOpenFiles).toHaveBeenCalledWith(false);
  });

  it('should call setter when toggling Testing', async () => {
    renderAgentSettings();
    const user = userEvent.setup();

    await user.click(getSwitchAt(switchIndex.testing));
    expect(mockSetTestingEnabled).toHaveBeenCalledWith(false);
  });
});
