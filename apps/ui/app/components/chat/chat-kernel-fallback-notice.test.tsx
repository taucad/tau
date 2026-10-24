// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolveKernel } from '@taucad/types/constants';
import type { KernelEntry } from '@taucad/types/constants';

/**
 * A chat whose kernel this runtime cannot execute runs the device's kernel
 * instead (cross-device chat handoff, XD5): the composer says which, and why.
 */
type Harness = { desktop: boolean; kernel: KernelEntry | undefined; unavailableKernel: KernelEntry | undefined };

const harness = vi.hoisted((): Harness => ({ desktop: false, kernel: undefined, unavailableKernel: undefined }));

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    kernel: { kernel: harness.kernel, unavailableKernel: harness.unavailableKernel },
  }),
}));
vi.mock('#lib/build-target.js', () => ({ isDesktopTarget: () => harness.desktop }));

const { ChatKernelFallbackNotice } = await import('#components/chat/chat-kernel-fallback-notice.js');

beforeEach(() => {
  harness.desktop = false;
  harness.kernel = resolveKernel('openscad');
  harness.unavailableKernel = resolveKernel('build123d');
});

describe('ChatKernelFallbackNotice', () => {
  it('should name the desktop-only kernel and the kernel this chat uses on the web', () => {
    render(<ChatKernelFallbackNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Build123d runs in Tau Desktop, so this chat uses OpenSCAD here.',
    );
  });

  it('should say the kernel is unavailable on a desktop that does not offer it', () => {
    harness.desktop = true;

    render(<ChatKernelFallbackNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Build123d isn’t available on this computer, so this chat uses OpenSCAD here.',
    );
  });

  it('should render nothing when the chat’s own kernel runs here', () => {
    harness.unavailableKernel = undefined;

    const { container } = render(<ChatKernelFallbackNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
