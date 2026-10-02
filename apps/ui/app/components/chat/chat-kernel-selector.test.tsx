// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { KernelConfiguration, KernelId } from '@taucad/types/constants';
import { kernelConfigurations } from '@taucad/types/constants';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

// The chat kernel selector reads AND writes through the unified composer
// context (`useChatComposer().kernel`). The active provider's strategy
// (composer-only → cookie; session-backed → chat row + cookie dual-write)
// decides whether the patch hits the chat row. Tests here lock the
// component's contract: it must never touch raw cookie state via
// `useKernel` — a throwing mock guarantees a loud failure on regression.

const stubKernel: KernelConfiguration = kernelConfigurations.find((k) => k.id === 'manifold')!;

const chatKernelState: { current: KernelConfiguration | undefined } = { current: stubKernel };
const setActiveKernel = vi.fn();

const useChatComposerMock = vi.fn(
  (): ChatComposerContextValue =>
    ({
      draftActorRef: { send: vi.fn() },
      model: { modelId: 'm', model: undefined, setActiveModel: vi.fn() },
      kernel: {
        kernelId: chatKernelState.current?.id as KernelId,
        kernel: chatKernelState.current,
        setActiveKernel,
      },
      status: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
    }) as unknown as ChatComposerContextValue,
);

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => useChatComposerMock(),
}));

// The selector must NOT import `useKernel` anymore — guard with a
// throwing mock so any regression is caught at module load.
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => {
    throw new Error('chat-kernel-selector should no longer call useKernel — switch to useChatComposer().kernel');
  },
}));

const capturedComboBox: {
  onSelect?: (id: string) => void;
  value?: unknown;
  renderLabel?: (item: KernelConfiguration, selected?: KernelConfiguration) => React.ReactNode;
} = {};
vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: (properties: {
    readonly onSelect?: (id: string) => void;
    readonly value?: unknown;
    readonly children?: React.ReactNode;
    readonly renderLabel?: (item: KernelConfiguration, selected?: KernelConfiguration) => React.ReactNode;
  }): React.JSX.Element => {
    capturedComboBox.onSelect = properties.onSelect;
    capturedComboBox.value = properties.value;
    capturedComboBox.renderLabel = properties.renderLabel;
    return <div data-testid='combobox'>{properties.children}</div>;
  },
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

const { ChatKernelSelector } = await import('#components/chat/chat-kernel-selector.js');

function renderSelector(onSelect?: (id: KernelId) => void) {
  return render(
    <ChatKernelSelector onSelect={onSelect}>
      {({ selectedKernel }) => <span data-testid='child'>{selectedKernel.name}</span>}
    </ChatKernelSelector>,
  );
}

describe('ChatKernelSelector — chat-scoped read + dual-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatKernelState.current = stubKernel;
    capturedComboBox.onSelect = undefined;
    capturedComboBox.value = undefined;
  });

  it('renders the selected kernel from useChatComposer().kernel (not useKernel)', () => {
    renderSelector();
    expect(useChatComposerMock).toHaveBeenCalled();
    expect(capturedComboBox.value).toBe(stubKernel);
  });

  it('reflects the chat-local active kernel when it diverges from the cookie default', () => {
    const chatLocal = kernelConfigurations.find((k) => k.id === 'jscad')!;
    chatKernelState.current = chatLocal;
    renderSelector();
    expect(capturedComboBox.value).toBe(chatLocal);
  });

  it('routes the picked kernel id through setActiveKernel (dual-write to chat + cookie)', () => {
    const onSelect = vi.fn();
    renderSelector(onSelect);
    capturedComboBox.onSelect?.('replicad');

    expect(setActiveKernel).toHaveBeenCalledTimes(1);
    expect(setActiveKernel).toHaveBeenCalledWith('replicad');
    expect(onSelect).toHaveBeenCalledWith('replicad');
  });

  it('ignores selections that do not resolve to a known kernel id', () => {
    renderSelector();
    capturedComboBox.onSelect?.('does-not-exist');
    expect(setActiveKernel).not.toHaveBeenCalled();
  });
});

describe('ChatKernelSelector — pro tier badge', () => {
  beforeEach(() => {
    chatKernelState.current = stubKernel;
    capturedComboBox.renderLabel = undefined;
  });

  it('renders KernelTierBadge for pro-tier kernels in the combobox label', () => {
    const zooKernel = kernelConfigurations.find((k) => k.id === 'zoo')!;
    render(<ChatKernelSelector>{() => null}</ChatKernelSelector>);

    const label = capturedComboBox.renderLabel?.(zooKernel, undefined);
    const { getByText } = render(<div>{label}</div>);
    expect(getByText('Pro')).toBeInTheDocument();
  });

  it('does not render KernelTierBadge for free-tier kernels in the combobox label', () => {
    const openscadKernel = kernelConfigurations.find((k) => k.id === 'openscad')!;
    render(<ChatKernelSelector>{() => null}</ChatKernelSelector>);

    const label = capturedComboBox.renderLabel?.(openscadKernel, undefined);
    const { queryByText } = render(<div>{label}</div>);
    expect(queryByText('Pro')).not.toBeInTheDocument();
  });
});
