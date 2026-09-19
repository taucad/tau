// @vitest-environment jsdom
/**
 * The browser's offer of the desktop app (R4).
 *
 * Two properties this suite exists to hold: the offer never appears for a link
 * the shell would refuse, and the way out of "opening" is a button the person
 * presses — never a timer that decides for them.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenInDesktop } from '#components/desktop/open-in-desktop.js';

const assign = vi.fn();

const mountAt = (path: string): { unmount: () => void } =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <OpenInDesktop continueLabel='Accept in the browser' />
    </MemoryRouter>,
  );

describe('OpenInDesktop', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    globalThis.localStorage.clear();
    vi.stubGlobal('location', { href: 'https://tau.new/', assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('offers the desktop app and hands it the link the shell admits', async () => {
    mountAt('/invitations/tok_abcdef');

    await userEvent.click(screen.getByRole('button', { name: 'Open in Tau Desktop' }));

    expect(assign).toHaveBeenCalledWith('tau://invitations/tok_abcdef');
    expect(screen.getByText('Opening Tau Desktop')).toBeInTheDocument();
  });

  /* The fallback is a visible button, not a timer: a custom scheme gives the
     page no signal, so only the person can say it did not work. */
  it('shows the way out of opening straight away, with no timer', async () => {
    mountAt('/invitations/tok_abcdef');

    await userEvent.click(screen.getByRole('button', { name: 'Open in Tau Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tau Desktop didn’t open' }));

    expect(screen.getByText('Tau Desktop didn’t open')).toBeInTheDocument();
    expect(
      screen.getByText('Tau Desktop may not be installed on this computer, or the browser did not offer to open it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Tau Desktop' })).toHaveAttribute('href', 'https://docs.tau.new');
  });

  it('opens the same link again on Try again', async () => {
    mountAt('/invitations/tok_abcdef');

    await userEvent.click(screen.getByRole('button', { name: 'Open in Tau Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tau Desktop didn’t open' }));
    assign.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(assign).toHaveBeenCalledWith('tau://invitations/tok_abcdef');
    expect(screen.getByText('Opening Tau Desktop')).toBeInTheDocument();
  });

  /* The canvas's landing carries the browser continuation beside the offer:
     over a full-bleed page (`/s/:slug`) it is the only way to put the card away. */
  it('lets the person decline the offer before ever trying it', async () => {
    mountAt('/invitations/tok_abcdef');

    await userEvent.click(screen.getByRole('button', { name: 'Accept in the browser' }));

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('puts the offer away when the person continues in the browser', async () => {
    mountAt('/invitations/tok_abcdef');

    await userEvent.click(screen.getByRole('button', { name: 'Open in Tau Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tau Desktop didn’t open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept in the browser' }));

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tau Desktop didn’t open')).not.toBeInTheDocument();
  });

  it('remembers the preference and hands off on load, still showing the fallback', async () => {
    const first = mountAt('/invitations/tok_abcdef');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Always open Tau links in the desktop app' }));
    expect(globalThis.localStorage.getItem('tau.open-links-in-desktop')).toBe('true');
    first.unmount();

    mountAt('/import/github.com/taucad/tau-examples');

    expect(assign).toHaveBeenCalledWith('tau://i/github.com/taucad/tau-examples');
    expect(screen.getByRole('button', { name: 'Tau Desktop didn’t open' })).toBeInTheDocument();
  });

  it('hands off nothing on load while the preference is unset', () => {
    mountAt('/invitations/tok_abcdef');

    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open in Tau Desktop' })).toBeInTheDocument();
  });

  /* An import that needs its `?ref=` cannot be represented as a `tau://` link
     the shell will admit, so the page must not pretend it can. */
  it.each([
    ['an import that needs its branch', '/import/github.com/taucad/tau-examples?ref=next'],
    ['a repository path carrying a URL scheme', '/import/https://github.com/taucad/tau-examples'],
    ['a token longer than the shell accepts', `/invitations/${'a'.repeat(257)}`],
    ['a route the shell does not serve', '/projects'],
  ])('offers nothing for %s', (_label, path) => {
    mountAt(path);

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
  });

  it('renders nothing at all on the desktop build', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    mountAt('/invitations/tok_abcdef');

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
  });
});
