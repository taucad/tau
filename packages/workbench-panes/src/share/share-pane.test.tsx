import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link2 } from 'lucide-react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { WorkbenchPanesHost } from '#host/workbench-host.jsx';
import { SharePane, SharePaneFrame } from '#share/share-pane.jsx';
import type { ShareLinkExtension, ShareLinkMethod, ShareLinkRequest, ShareSource } from '#share/share-source.js';

const directMethod = (overrides: Partial<ShareLinkMethod> = {}): ShareLinkMethod => ({
  kind: 'link',
  id: 'direct',
  label: 'Direct link',
  icon: Link2,
  description: 'Create a self-contained link.',
  notice: {
    icon: <span data-testid='notice-icon' />,
    title: 'No upload through Tau',
    text: 'The project stays in the URL.',
  },
  encryption: {
    minBytes: 4,
    maxBytes: 8,
    notice: { title: 'Password-encrypted', text: 'Share the password apart.' },
  },
  action: { label: 'Copy direct link', icon: Link2 },
  copiedMessage: 'Direct link copied',
  share: vi.fn(async () => ({
    url: 'https://tau.example/s/direct#v=2&zip=abc',
  })),
  ...overrides,
});

const renderPane = (share: ShareSource): ReturnType<typeof render> => {
  const host: WorkbenchPanesHost = { useUnits: () => [], share };
  return render(
    <WorkbenchPanesHostProvider value={host}>
      <TooltipProvider>
        <SharePane />
      </TooltipProvider>
    </WorkbenchPanesHostProvider>,
  );
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

afterEach(() => {
  cleanup();
});

describe('SharePane', () => {
  it('should draw the frame without a picker when the host offers one method', () => {
    renderPane({ methods: [directMethod()] });

    expect(screen.getByRole('heading', { name: 'Share project' })).toBeInTheDocument();
    expect(screen.getByText('Create a self-contained link.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share with/i })).not.toBeInTheDocument();
    expect(screen.getByText('No upload through Tau')).toBeInTheDocument();
  });

  it('should make the link, copy it, announce it and confirm with a tick', async () => {
    const notify = vi.fn<(message: string) => void>();
    const method = directMethod();
    renderPane({ methods: [method], notify });

    await userEvent.click(screen.getByRole('button', { name: 'Copy direct link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://tau.example/s/direct#v=2&zip=abc');
    });
    expect(method.share).toHaveBeenCalledWith(expect.objectContaining({ protection: { kind: 'none' }, options: {} }));
    expect(notify).toHaveBeenCalledWith('Direct link copied');
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue('https://tau.example/s/direct#v=2&zip=abc');
    const copy = screen.getByRole('button', { name: 'Copy link' });
    expect(copy.querySelector('.lucide-check')).not.toBeNull();

    await userEvent.click(copy);
    await waitFor(() => {
      expect(notify).toHaveBeenLastCalledWith('Link copied');
    });
    expect(method.share).toHaveBeenCalledOnce();
  });

  it('should pass the password and its choices, and hold the button until the password fits', async () => {
    const method = directMethod();
    renderPane({ methods: [method] });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Encrypt with a password' }));
    expect(screen.getByText('Password-encrypted')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Copy direct link' });
    await userEvent.type(screen.getByLabelText('Password'), 'toolongpassword');
    expect(button).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include password in the link' }));
    await userEvent.click(button);

    await waitFor(() => {
      expect(method.share).toHaveBeenCalledWith(
        expect.objectContaining({
          protection: {
            kind: 'password',
            password: 'secret',
            includePassword: false,
          },
        }),
      );
    });
  });

  it('should hand on its options and show the warning and error a share answers', async () => {
    const share = vi.fn(async (_request: ShareLinkRequest) => ({
      error: 'This project is too large for a direct URL.',
      warning: 'Shared with 1 unresolved dependency.',
    }));
    renderPane({
      methods: [
        directMethod({
          options: [{ id: 'public-gist', label: 'Publish publicly' }],
          share,
        }),
      ],
    });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Publish publicly' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy direct link' }));

    expect(await screen.findByText('This project is too large for a direct URL.')).toBeInTheDocument();
    expect(screen.getByText('Shared with 1 unresolved dependency.')).toBeInTheDocument();
    expect(share.mock.calls[0]?.[0].options).toEqual({ 'public-gist': true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('should keep the link when the clipboard refuses it', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderPane({ methods: [directMethod()] });

    await userEvent.click(screen.getByRole('button', { name: 'Copy direct link' }));

    expect(
      await screen.findByText('The link was created but clipboard access was denied. Copy it below.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toBeInTheDocument();
  });

  it('should let an extension replace the action, add callouts and actions, and share in its place', async () => {
    const onActivate = vi.fn();
    const connected = { current: false };
    const extensionShare = vi.fn(async () => ({
      url: 'https://tau.example/s/github-gist~abc',
    }));
    const useExtension = (): ShareLinkExtension =>
      connected.current
        ? {
            share: extensionShare,
            actions: <button type='button'>Manage</button>,
          }
        : {
            callouts: <div>Connect GitHub to create a Gist.</div>,
            primary: { label: 'Connect GitHub', onActivate },
          };
    const method = directMethod({ useExtension });
    const { rerender } = renderPane({ methods: [method] });

    expect(screen.getByText('Connect GitHub to create a Gist.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));
    expect(onActivate).toHaveBeenCalledOnce();

    connected.current = true;
    rerender(
      <WorkbenchPanesHostProvider value={{ useUnits: () => [], share: { methods: [method] } }}>
        <SharePane />
      </WorkbenchPanesHostProvider>,
    );
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy direct link' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://tau.example/s/github-gist~abc');
    });
    expect(method.share).not.toHaveBeenCalled();
  });

  it('should draw an element in place of the primary button', () => {
    renderPane({
      methods: [
        directMethod({
          useExtension: () => ({
            primary: { element: <a href='/sign-in'>Sign in</a> },
          }),
        }),
      ],
    });

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy direct link' })).not.toBeInTheDocument();
  });

  it('should list the methods, follow a pick and draw a custom method inside the frame', async () => {
    const onMethodChange = vi.fn<(id: string) => void>();
    renderPane({
      methods: [
        directMethod(),
        {
          kind: 'custom',
          id: 'tau',
          label: 'Hosted link',
          icon: Link2,
          render: () => (
            <SharePaneFrame description='Publish a snapshot.'>
              <p>Hosted body</p>
            </SharePaneFrame>
          ),
        },
      ],
      onMethodChange,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hosted link' }));

    expect(onMethodChange).toHaveBeenCalledWith('tau');
    expect(screen.getByText('Hosted body')).toBeInTheDocument();
    expect(screen.getByText('Publish a snapshot.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share with Hosted link' })).toBeInTheDocument();
  });

  it('should show the method the host keeps, and the first one when that is not offered', () => {
    const tau = {
      kind: 'custom',
      id: 'tau',
      label: 'Hosted link',
      icon: Link2,
      render: () => <p>Hosted body</p>,
    } as const;
    const { unmount } = renderPane({
      methods: [directMethod(), tau],
      method: 'tau',
    });
    expect(screen.getByText('Hosted body')).toBeInTheDocument();
    unmount();

    renderPane({
      methods: [directMethod(), tau],
      method: 'github-gist',
      initialMethod: 'tau',
    });
    expect(screen.getByText('No upload through Tau')).toBeInTheDocument();
  });

  it('should open on the initial method when the host does not keep the choice', () => {
    const tau = {
      kind: 'custom',
      id: 'tau',
      label: 'Hosted link',
      icon: Link2,
      render: () => <p>Hosted body</p>,
    } as const;
    renderPane({ methods: [directMethod(), tau], initialMethod: 'tau' });

    expect(screen.getByText('Hosted body')).toBeInTheDocument();
  });

  it('should disable the picker while a share runs', async () => {
    const pending = Promise.withResolvers<{ url: string }>();
    const share = vi.fn(async () => pending.promise);
    const tau = {
      kind: 'custom',
      id: 'tau',
      label: 'Hosted link',
      icon: Link2,
      render: () => <p>Hosted body</p>,
    } as const;
    renderPane({ methods: [directMethod({ share }), tau] });

    await userEvent.click(screen.getByRole('button', { name: 'Copy direct link' }));

    expect(screen.getByRole('button', { name: 'Share with Direct link' })).toBeDisabled();
    pending.resolve({ url: 'https://tau.example/s/direct#v=2&zip=abc' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share with Direct link' })).toBeEnabled();
    });
  });
});
