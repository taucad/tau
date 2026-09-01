// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResolvedModel } from '#hooks/use-models.js';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';

const manifoldKernel = kernelConfigurations.find((k) => k.id === 'manifold')!;
const jscadKernel = kernelConfigurations.find((k) => k.id === 'jscad')!;
// Holds the kernel that the (mocked) ChatKernelSelector will hand back
// via its render-prop. The mobile component no longer reads
// `useChatComposer().kernel` directly — the kernel flows in through the
// selector's children-as-function signature, which post-tightening
// guarantees a non-nullable `KernelConfiguration`. This test mirrors
// that contract.
const mockKernel: { current: KernelConfiguration } = { current: manifoldKernel };

vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({})}</div>
  ),
}));

vi.mock('#components/chat/chat-kernel-selector.js', () => ({
  ChatKernelSelector: ({
    children,
  }: {
    readonly children: (props: { selectedKernel: KernelConfiguration }) => React.ReactNode;
  }) => <div>{children({ selectedKernel: mockKernel.current })}</div>,
}));

vi.mock('#components/chat/chat-tool-selector.js', () => ({
  ChatToolSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({ selectedMode: undefined, selectedTools: [], toolMetadata: {} })}</div>
  ),
}));

vi.mock('#components/chat/chat-context-actions.js', () => ({
  ChatContextActions: () => <div data-testid='context-actions' />,
}));

vi.mock('#components/chat/chat-textarea-mobile-images.js', () => ({
  ChatTextareaMobileImages: () => <div data-testid='mobile-images' />,
}));

vi.mock('#components/chat/chat-textarea-submit-button.js', () => ({
  ChatTextareaSubmitButton: () => (
    <button type='button' data-testid='submit'>
      submit
    </button>
  ),
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

vi.mock('#components/ui/textarea.js', () => ({
  Textarea: () => <textarea data-testid='textarea' />,
}));

vi.mock('#components/ui/button.js', () => ({
  Button: ({ children }: { readonly children: React.ReactNode }) => <button type='button'>{children}</button>,
}));

vi.mock('#components/ui/menu.variants.js', () => ({
  menuItemVariants: () => '',
}));

vi.mock('#components/ui/drawer.js', () => ({
  Drawer: ({ children }: { readonly children: React.ReactNode }) => <div data-testid='drawer'>{children}</div>,
  DrawerContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='drawer-content'>{children}</div>
  ),
  DrawerDescription: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DrawerTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/command.js', () => ({
  Command: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatTextareaMobile } = await import('#components/chat/chat-textarea-mobile.js');

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const stubModel: ResolvedModel = {
  id: 'm',
  name: 'M',
  family: 'gpt',
  provider: { id: 'openai', name: 'OpenAI' },
  isResolved: true,
};
// oxlint-disable @typescript-eslint/no-restricted-types -- React ref objects are typed with `null` upstream
const stubInputRef: React.RefObject<HTMLInputElement | null> = { current: null };
const stubTextareaRef: React.RefObject<HTMLTextAreaElement | null> = { current: null };
const stubContainerRef: React.RefObject<HTMLDivElement | null> = { current: null };
// oxlint-enable @typescript-eslint/no-restricted-types

function renderMobile() {
  return render(
    <ChatTextareaMobile
      dragKind={undefined}
      showContextMenu={false}
      contextSearchQuery=''
      selectedMenuIndex={0}
      isSubmitting={false}
      inputText=''
      images={[]}
      selectedToolChoice='auto'
      setDraftToolChoice={noop}
      status='idle'
      selectedModel={stubModel}
      formattedCancelKeyCombination='Ctrl+Backspace'
      textareaReference={stubTextareaRef}
      fileInputReference={stubInputRef}
      containerReference={stubContainerRef}
      handleSubmit={asyncNoop}
      handleCancelClick={noop}
      handleTextareaKeyDown={noop}
      handleDragOver={noop}
      handleDragLeave={noop}
      handleDrop={asyncNoop}
      handleFileSelect={noop}
      handleFileChange={noop}
      handleTextChange={noop}
      handleContextMenuSelect={noop}
      handleContextImageAdd={noop}
      handleAddText={noop}
      handleAddImage={noop}
      handleTextareaBlur={noop}
      handlePointerDown={noop}
      focusInput={noop}
      removeImage={noop}
      setShowContextMenu={noop}
      setAtSymbolPosition={noop}
      setContextSearchQuery={noop}
      setSelectedMenuIndex={noop}
    />,
  );
}

describe('ChatTextareaMobile — chat-scoped kernel resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKernel.current = manifoldKernel;
  });

  it('renders the kernel handed back by ChatKernelSelector (no hardcoded openscad fallback)', () => {
    renderMobile();
    expect(screen.getAllByText('Manifold').length).toBeGreaterThan(0);
  });

  it('reflects the chat-active kernel name in the drawer label, not "OpenSCAD"', () => {
    mockKernel.current = jscadKernel;
    renderMobile();
    expect(screen.getAllByText('JSCAD').length).toBeGreaterThan(0);
    expect(screen.queryByText('OpenSCAD')).toBeNull();
  });
});
