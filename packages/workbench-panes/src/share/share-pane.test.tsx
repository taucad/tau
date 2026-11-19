import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link2 } from 'lucide-react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { WorkbenchPanesHost } from '#host/workbench-host.jsx';
import { SharePane, SharePaneFrame, SharePaneSection } from '#share/share-pane.jsx';
import type { ShareLinkExtension, ShareLinkMethod, ShareLinkRequest, ShareSource } from '#share/share-source.js';

const directMethod = (overrides: Partial<ShareLinkMethod> = {}): ShareLinkMethod => ({
  kind: 'link',
  id: 'direct',
  label: 'Direct link',
  icon: Link2,
  description: 'Create a self-contained link.',
  encryption: { minBytes: 4, maxBytes: 8 },
  action: { label: 'Create link', icon: Link2 },
  share: vi.fn(async () => ({
    url: 'https://tau.example/s/direct#v=2&zip=abc',
  })),
  ...overrides,
});

const renderPane = (share: ShareSource, extraSections?: React.ReactNode): ReturnType<typeof render> => {
  const host: WorkbenchPanesHost = { useUnits: () => [], share };
  return render(
    <WorkbenchPanesHostProvider value={host}>
      <TooltipProvider>
        <SharePane extraSections={extraSections} />
      </TooltipProvider>
    </WorkbenchPanesHostProvider>,
  );
};

const customMethod = (render: () => React.ReactNode) =>
  ({
    kind: 'custom',
    id: 'tau',
    label: 'Cloud link',
    icon: Link2,
    description: 'One link that always shows the version you last published.',
    render,
  }) as const;

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
  it('should name the method and say what it is when the host offers one method', () => {
    renderPane({ methods: [directMethod()] });

    expect(screen.getByRole('region', { name: 'Share project' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Share project' })).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { level: 3, name: 'Direct link' })).toBeInTheDocument();
    expect(screen.getByText('Create a self-contained link.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share with/i })).not.toBeInTheDocument();
  });

  it('should draw the picker, the method and the host sections in one scroll area', () => {
    renderPane(
      { methods: [directMethod(), customMethod(() => <p>Hosted body</p>)] },
      <SharePaneSection title='Collaborators' description='Who opens the project itself.'>
        <p>No collaborators yet.</p>
      </SharePaneSection>,
    );

    const region = screen.getByRole('region', { name: 'Share project' });
    const scroller = region.querySelector('[data-slot=share-pane-scroll]');
    expect(scroller).not.toBeNull();
    expect(scroller).toHaveClass('overflow-y-auto');
    expect(scroller).toContainElement(screen.getByRole('button', { name: 'Share with Direct link' }));
    expect(scroller).toContainElement(screen.getByRole('button', { name: 'Create link' }));
    const people = screen.getByRole('region', { name: 'Collaborators' });
    expect(scroller).toContainElement(people);
    expect(within(people).getByText('Who opens the project itself.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share with Direct link' })).toHaveAccessibleDescription(
      'Create a self-contained link.',
    );
  });

  it('should describe each method in its picker row', async () => {
    renderPane({ methods: [directMethod(), customMethod(() => <p>Hosted body</p>)] });

    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));

    expect(screen.getByRole('option', { name: /^Cloud link/u })).toHaveTextContent(
      'One link that always shows the version you last published.',
    );
  });

  it('should make the link, copy it, announce it and confirm with a tick', async () => {
    const notify = vi.fn<(message: string) => void>();
    const method = directMethod();
    renderPane({ methods: [method], notify });

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://tau.example/s/direct#v=2&zip=abc');
    });
    expect(method.share).toHaveBeenCalledWith(expect.objectContaining({ protection: { kind: 'none' }, options: {} }));
    expect(notify).toHaveBeenCalledWith('Link copied');
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

    await userEvent.click(screen.getByRole('checkbox', { name: 'Protect with a password' }));
    expect(
      screen.getByText('The project is encrypted on this device. People need the password to open it.'),
    ).toBeVisible();
    const button = screen.getByRole('button', { name: 'Create link' });
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAccessibleDescription('Use at least 4 characters.');
    await userEvent.type(field, 'toolongpassword');
    expect(button).toBeDisabled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('This password is too long. Use a shorter one.');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    const include = screen.getByRole('checkbox', { name: 'Include password in the link' });
    expect(include).toHaveAccessibleDescription('Anyone with the link can open the project.');
    await userEvent.click(include);
    expect(include).toHaveAccessibleDescription('People need the link and the password. Send the password separately.');
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

  it('should offer a generated password, make another on request and keep one the person typed', async () => {
    renderPane({ methods: [directMethod({ encryption: { minBytes: 32, maxBytes: 128 } })] });

    const protect = screen.getByRole('checkbox', { name: 'Protect with a password' });
    await userEvent.click(protect);
    const field = screen.getByLabelText<HTMLInputElement>('Password');
    const generated = field.value;
    expect(generated).toMatch(/^[A-HJ-NP-Za-km-z2-9]{32}$/u);
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: 'Create link' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Generate a new password' }));
    expect(field).not.toHaveValue(generated);
    expect(field.value).toHaveLength(32);

    await userEvent.clear(field);
    await userEvent.type(field, 'a password the person chose for this link');
    await userEvent.click(protect);
    await userEvent.click(protect);
    expect(screen.getByLabelText('Password')).toHaveValue('a password the person chose for this link');
  });

  it('should copy the password inside the press and announce it, and say so when the clipboard refuses', async () => {
    const notify = vi.fn<(message: string) => void>();
    renderPane({ methods: [directMethod()], notify });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Protect with a password' }));
    const password = screen.getByLabelText<HTMLInputElement>('Password').value;
    await userEvent.click(screen.getByRole('button', { name: 'Copy password' }));

    expect(writeText).toHaveBeenCalledWith(password);
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Password copied');
    });

    writeText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    expect(await screen.findByText("Couldn't copy the password. Show it, then select it and copy it.")).toBeVisible();
  });

  it('should hold the password once the link exists but still show and copy it', async () => {
    const method = directMethod();
    renderPane({ methods: [method] });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Protect with a password' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include password in the link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByRole('textbox', { name: 'Share link' })).toBeVisible();
    expect(screen.getByText('This link doesn’t include the password. Send the password separately.')).toBeVisible();
    expect(screen.getByLabelText('Password')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Generate a new password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy password' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('should hand on its options and show the warning and error a share answers', async () => {
    const share = vi.fn(async (_request: ShareLinkRequest) => ({
      error: 'This project is too large for a direct URL.',
      warning: 'Shared with 1 unresolved dependency.',
    }));
    renderPane({
      methods: [
        directMethod({
          options: [{ id: 'public-gist', label: 'Publish publicly', description: 'Listed on your profile.' }],
          share,
        }),
      ],
    });

    const option = screen.getByRole('checkbox', { name: 'Publish publicly' });
    expect(option).toHaveAccessibleDescription('Listed on your profile.');
    await userEvent.click(option);
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This project is too large for a direct URL.');
    expect(screen.getByRole('status')).toHaveTextContent('Shared with 1 unresolved dependency.');
    expect(share.mock.calls[0]?.[0].options).toEqual({ 'public-gist': true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('should keep the link, focused and selected, when the clipboard refuses it', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderPane({ methods: [directMethod()] });

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Select the link and copy it.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    const field = screen.getByRole('textbox', { name: 'Share link' });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
  });

  it('should start the copy inside the press while the link is still being made', async () => {
    const write = vi.fn<(items: unknown[]) => Promise<void>>(async () => undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText, write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        declare public readonly items: unknown;

        public constructor(items: unknown) {
          Object.assign(this, { items });
        }
      },
    );
    let finish: (url: string) => void = () => undefined;
    const method = directMethod({
      share: vi.fn(
        async () =>
          new Promise<{ url: string }>((resolve) => {
            finish = (url) => {
              resolve({ url });
            };
          }),
      ),
    });
    renderPane({ methods: [method] });

    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    /* No await between the press and the clipboard: Safari would refuse a write that started later. */
    expect(write).toHaveBeenCalledOnce();
    finish('https://tau.example/s/direct#v=2&zip=late');
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      'https://tau.example/s/direct#v=2&zip=late',
    );
    vi.unstubAllGlobals();
  });

  it('should make a fresh link on every press and never hold the choices when the method remakes its link', async () => {
    const share = vi
      .fn<(request: ShareLinkRequest) => Promise<{ url: string }>>()
      .mockResolvedValueOnce({ url: 'https://tau.example/s/direct#v=2&zip=first' })
      .mockResolvedValueOnce({ url: 'https://tau.example/s/direct#v=2&zip=second' });
    renderPane({ methods: [directMethod({ shouldRemakeLink: true, share })] });

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      'https://tau.example/s/direct#v=2&zip=first',
    );
    const protect = screen.getByRole('checkbox', { name: 'Protect with a password' });
    expect(protect).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('https://tau.example/s/direct#v=2&zip=second');
    });
    expect(share).toHaveBeenCalledTimes(2);

    await userEvent.click(protect);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull();
  });

  it('should say the link could not be made when a share throws', async () => {
    renderPane({
      methods: [
        directMethod({
          share: vi.fn(async () => {
            throw new Error('ECONNRESET');
          }),
        }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the link. Try again.");
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
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
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
    expect(screen.queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument();
  });

  it('should list the methods, follow a pick and draw a custom method inside the frame', async () => {
    const onMethodChange = vi.fn<(id: string) => void>();
    renderPane({
      methods: [
        directMethod(),
        customMethod(() => (
          <SharePaneFrame>
            <SharePaneSection title='Link'>
              <p>Hosted body</p>
            </SharePaneSection>
          </SharePaneFrame>
        )),
      ],
      onMethodChange,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));
    await userEvent.click(screen.getByRole('option', { name: /^Cloud link/u }));

    expect(onMethodChange).toHaveBeenCalledWith('tau');
    expect(within(screen.getByRole('region', { name: 'Link' })).getByText('Hosted body')).toBeVisible();
    expect(screen.getByText('One link that always shows the version you last published.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share with Cloud link' })).toBeInTheDocument();
  });

  it('should show the method the host keeps, and the first one when that is not offered', () => {
    const tau = customMethod(() => <p>Hosted body</p>);
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
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('should open on the initial method when the host does not keep the choice', () => {
    const tau = customMethod(() => <p>Hosted body</p>);
    renderPane({ methods: [directMethod(), tau], initialMethod: 'tau' });

    expect(screen.getByText('Hosted body')).toBeInTheDocument();
  });

  it('should disable the picker while a share runs', async () => {
    const pending = Promise.withResolvers<{ url: string }>();
    const share = vi.fn(async () => pending.promise);
    const tau = customMethod(() => <p>Hosted body</p>);
    renderPane({ methods: [directMethod({ share }), tau] });

    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(screen.getByRole('button', { name: 'Share with Direct link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create link' })).toHaveAttribute('aria-busy', 'true');
    pending.resolve({ url: 'https://tau.example/s/direct#v=2&zip=abc' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share with Direct link' })).toBeEnabled();
    });
  });
});
