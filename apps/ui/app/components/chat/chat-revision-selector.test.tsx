// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatRevisionMode } from '@taucad/chat/schemas';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import { listAgentHostPlacements } from '#lib/agent-host-placement.js';
import type { TauHostDescriptor } from '#lib/agent-host-placement.js';

const setMode = vi.fn();
let activeExecution: ChatComposerContextValue['execution']['execution'] = { kind: 'tau', model: 'gpt-test' };
let mode: ChatRevisionMode = 'direct';

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: (): ChatComposerContextValue =>
    ({
      execution: { execution: activeExecution, setActiveExecution: vi.fn() },
      session: { activeChatId: 'chat_selector' },
    }) as unknown as ChatComposerContextValue,
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useChatRevisionMode: () => ({ mode, setMode }),
}));
// The real discovery pass is driven explicitly below; the hook only has to mount.
vi.mock('#hooks/use-cad-agent-config.js', () => ({ useAgentHostPlacements: () => ({ targets: [], loading: false }) }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const { ChatRevisionSelector, useChatRevisionPlacement } = await import('#components/chat/chat-revision-selector.js');

/** The composer's own predicate, rendered so the real hook decides it. */
function OfferedProbe(): React.JSX.Element {
  const { isOffered, modes } = useChatRevisionPlacement();
  return <span>{`${isOffered ? 'offered' : 'hidden'}:${modes.join(',') || 'none'}`}</span>;
}

/**
 * Fill the capability book from a real discovery pass, so the selector reads
 * what a daemon actually advertised rather than a mocked answer.
 */
const discoverHost = async (revisions: ChatRevisionMode[] | undefined): Promise<void> => {
  const descriptor: TauHostDescriptor = {
    v: 1,
    agent: true,
    label: 'Studio',
    workspaceRoot: '/srv/tau',
    externalAgents: [{ id: 'codex', displayName: 'Codex', models: [] }],
    ...(revisions === undefined ? {} : { revisions }),
  };
  await listAgentHostPlacements({
    discoverOrigin: async () => descriptor,
    listHosts: async () => [],
    desktop: false,
  });
};

const renderSelector = (): void => {
  render(<ChatRevisionSelector>{({ label }) => <button type='button'>Work in: {label}</button>}</ChatRevisionSelector>);
};

describe('ChatRevisionSelector', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    activeExecution = { kind: 'tau', model: 'gpt-test' };
    mode = 'direct';
    globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
    await discoverHost(['direct', 'candidate']);
  });

  it('offers both revision modes under the Work in heading and defaults to Local', async () => {
    const user = userEvent.setup();
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };
    renderSelector();

    await user.click(screen.getByRole('button', { name: 'Work in: Local' }));

    expect(await screen.findByText('Work in')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('New branch')).toBeInTheDocument();
    // Q12.7: the folder and branch icons are gone, here and on the trigger.
    expect(document.querySelectorAll('svg.lucide-folder-open, svg.lucide-git-branch')).toHaveLength(0);
  });

  it('offers the same modes for an external agent on a capable host (V18)', async () => {
    const user = userEvent.setup();
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    renderSelector();

    await user.click(screen.getByRole('button', { name: 'Work in: Local' }));
    await user.click(await screen.findByText('New branch'));

    expect(setMode).toHaveBeenCalledWith('candidate');
  });

  it('offers nothing on a host that advertised no revision capability', async () => {
    await discoverHost(undefined);
    activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    renderSelector();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Work in: Local' }));

    expect(screen.queryByText('New branch')).not.toBeInTheDocument();
  });

  /* A chat carried onto a placement that will not accept its mode must keep the
   * control that gets it back; clamping the mode silently is the downgrade VSC5
   * forbids, and hiding a one-item list is a dead end (3-review S3). */
  it('keeps the control on a one-mode placement the chat is not in', async () => {
    await discoverHost(['direct']);
    mode = 'candidate';
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<OfferedProbe />);

    expect(screen.getByText('offered:direct')).toBeInTheDocument();
  });

  it('hides the control when the placement offers the mode the chat is already in', async () => {
    await discoverHost(['direct']);
    mode = 'direct';
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<OfferedProbe />);

    expect(screen.getByText('hidden:direct')).toBeInTheDocument();
  });

  it('offers nothing at all where there is no placement to offer', async () => {
    await discoverHost(undefined);
    mode = 'candidate';
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };

    render(<OfferedProbe />);

    expect(screen.getByText('hidden:none')).toBeInTheDocument();
  });

  it('returns a candidate selection to the live tree', async () => {
    const user = userEvent.setup();
    mode = 'candidate';
    activeExecution = { kind: 'tau', model: 'gpt-test', hostId: 'origin' };
    renderSelector();

    await user.click(screen.getByRole('button', { name: 'Work in: New branch' }));
    await user.click(await screen.findByText('Local'));

    expect(setMode).toHaveBeenCalledWith('direct');
  });
});
