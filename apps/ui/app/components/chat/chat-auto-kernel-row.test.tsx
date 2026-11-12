// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { KernelId, KernelPreference } from '@taucad/types/constants';

const composer = vi.hoisted(() => ({
  preference: 'auto' as KernelPreference,
  owner: undefined as KernelId | undefined,
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ kernel: { preference: composer.preference, owner: composer.owner } }),
}));
const flags = vi.hoisted(() => ({ autoKernel: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: string) => flag === 'autoKernel' && flags.autoKernel }));
vi.mock('#components/chat/chat-kernel-selector.js', () => ({
  KernelPreferenceSelector: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatAutoKernelRow } = await import('#components/chat/chat-auto-kernel-row.js');

describe('ChatAutoKernelRow', () => {
  beforeEach(() => {
    composer.preference = 'auto';
    composer.owner = undefined;
    flags.autoKernel = true;
  });

  it('says which kernel Auto is using once one binds, with a way to change it (D2)', () => {
    composer.owner = 'replicad';
    render(<ChatAutoKernelRow />);
    expect(screen.getByRole('note')).toHaveTextContent('Auto is using Replicad.');
    expect(screen.getByRole('button', { name: 'Change kernel' })).toBeInTheDocument();
  });

  it.each([
    { name: 'before a kernel binds', preference: 'auto', owner: undefined, isEnabled: true },
    { name: 'for a manual pick', preference: 'openscad', owner: 'replicad', isEnabled: true },
    { name: 'with the flag off', preference: 'auto', owner: 'replicad', isEnabled: false },
  ] as const)('stays out of the transcript $name', ({ preference, owner, isEnabled }) => {
    composer.preference = preference;
    composer.owner = owner;
    flags.autoKernel = isEnabled;
    const { container } = render(<ChatAutoKernelRow />);
    expect(container).toBeEmptyDOMElement();
  });
});
