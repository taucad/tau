// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { entitlementsFromTier } from '@taucad/billing';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { KernelPreference } from '@taucad/types/constants';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

/*
 * The composer's + menu on its real combobox: the actions at the top level, then the kernel (Auto-first, blueprint
 * D8) and Home's location as views of their own, every row reachable from the keyboard.
 */

const composer = vi.hoisted(() => ({ preference: 'auto' as KernelPreference, setActivePreference: vi.fn() }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    kernel: { preference: composer.preference, setActivePreference: composer.setActivePreference },
  }),
}));
const flags = vi.hoisted(() => ({ zooCloudDispatch: false }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => flag === 'zooCloudDispatch' && flags.zooCloudDispatch,
}));
vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({ desktopBridge: () => undefined }));
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { info: toastInfo } }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => entitlementsFromTier('pro') }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: vi.fn(), close: vi.fn() }),
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: (_name: string, initial: unknown) => [initial, vi.fn()] }));

const { ChatAddMenu } = await import('#components/chat/chat-add-menu.js');

const workshop = { kind: 'workspace', workspaceId: 'wsp_workshop' } as const;
const location = (): ProjectCreationLocationState => ({
  phase: 'ready',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  value: { kind: 'home' },
  selectedOption: { location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'on your computer' },
  options: [
    { location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'on your computer' },
    { location: workshop, status: 'connected', label: 'Workshop', detail: 'on your disk' },
  ],
  canCreate: true,
  select: vi.fn(),
  connectWorkspace: vi.fn(async () => undefined),
  selectedWorkspaceRecovery: undefined,
  refresh: vi.fn(async () => undefined),
});

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  composer.preference = 'auto';
  flags.zooCloudDispatch = false;
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const handlers = { handleAtButtonClick: vi.fn(), handleFileSelect: vi.fn(), focusEditor: vi.fn() };

const open = async (creationLocation?: ProjectCreationLocationState) => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <ChatAddMenu
        enableContextActions
        enableKernelSelector
        isAttachmentSupported
        {...(creationLocation === undefined ? {} : { creationLocation })}
        {...handlers}
      />
    </TooltipProvider>,
  );
  /* Keyboard only: focus + and open it with Enter. */
  act(() => {
    screen.getByRole('button', { name: 'Add' }).focus();
  });
  await user.keyboard('{Enter}');
  await screen.findByRole('dialog');
  return user;
};

const options = (): string[] =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent);

const openView = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await user.click(screen.getByRole('option', { name }));
  await waitFor(() => {
    expect(screen.getByRole('option', { name: /^Back to/u })).toBeInTheDocument();
  });
};

describe('ChatAddMenu', () => {
  it('lists the actions, then the kernel and the location with what each is set to', async () => {
    await open(location());
    expect(options()).toEqual(['Attach image or PDF', 'Add context@', 'KernelAuto', 'LocationHome']);
  });

  it('offers no location where the composer creates nothing', async () => {
    await open();
    expect(options()).toEqual(['Attach image or PDF', 'Add context@', 'KernelAuto']);
  });

  it('attaches and adds context through the composer, which then owns focus', async () => {
    const user = await open();
    await user.click(screen.getByRole('option', { name: /Attach image or PDF/u }));
    expect(handlers.handleFileSelect).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(handlers.focusEditor).not.toHaveBeenCalled();
  });

  it('keeps the attach row, disabled with its reason, for a model that cannot read files (F14)', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ChatAddMenu enableContextActions={false} enableKernelSelector isAttachmentSupported={false} {...handlers} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const attach = await screen.findByRole('option', { name: /Attach image or PDF/u });
    expect(attach).toHaveAttribute('aria-disabled', 'true');
    expect(attach).toHaveTextContent("This model can't read images or PDFs");
    expect(screen.queryByRole('option', { name: /Add context/u })).toBeNull();
  });

  it('names itself Add in its tooltip, and fills under touch (I6, I3)', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ChatAddMenu enableContextActions enableKernelSelector isAttachmentSupported {...handlers} />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Add' });
    expect(trigger).toHaveClass('pointer-coarse:w-9', 'pointer-coarse:bg-muted');
    await user.hover(trigger);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Add');
  });

  it('lists every kernel, Auto first, in the kernel view and routes a pick through the chat preference', async () => {
    const user = await open();
    await openView(user, /^Kernel/u);
    const rows = options().join('\n');
    for (const { name } of availableKernelConfigurations()) {
      expect(rows).toContain(name);
    }
    expect(options()[1]).toMatch(/^Auto/u);
    await user.click(screen.getByRole('option', { name: /^Replicad/u }));
    expect(composer.setActivePreference).toHaveBeenCalledWith('replicad');
  });

  it('explains a kernel that cannot run here, keeps the menu open and chooses nothing', async () => {
    const user = await open();
    await openView(user, /^Kernel/u);
    await user.click(screen.getByRole('option', { name: /^Zoo/u }));
    expect(composer.setActivePreference).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/ is not available here$/u), {
      description: expect.stringContaining('not open yet') as string,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers Zoo once its cloud engine opens', async () => {
    flags.zooCloudDispatch = true;
    const user = await open();
    await openView(user, /^Kernel/u);
    expect(screen.getByRole('option', { name: /^Zoo/u }).textContent).not.toContain('Unavailable');
  });

  it('chooses where the project is saved, with the folder actions under it', async () => {
    const state = location();
    const user = await open(state);
    await openView(user, /^Location/u);
    expect(options()).toEqual([
      'Back',
      'Homeon your computer',
      'Workshopon your disk',
      'Connect a folder…',
      'Manage locations…',
    ]);
    await user.click(screen.getByRole('option', { name: /^Workshop/u }));
    expect(state.phase === 'ready' && state.shouldShowPicker ? state.select : undefined).toHaveBeenCalledWith(workshop);
  });
});
