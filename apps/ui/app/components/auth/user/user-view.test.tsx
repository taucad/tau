// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ data: undefined as unknown, isPending: true }));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({ authClient: {} }),
  useSession: () => session,
}));

const { UserView } = await import('#components/auth/user/user-view.js');
const { UserAvatar } = await import('#components/auth/user/user-avatar.js');

const owner = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null };

beforeEach(() => {
  session.data = undefined;
  session.isPending = true;
});

/* The account row (blueprint, app shell): it holds its box and shows what the session already gives, else nothing. */
describe('the account row while the session loads', () => {
  it('draws no skeleton and no avatar block while the session is unknown', () => {
    const html = renderToString(<UserView />);
    expect(html).not.toContain('data-slot="skeleton"');
    expect(html).not.toContain('data-slot="avatar"');
  });

  it('holds the avatar box at its size with nothing in it', () => {
    const { container } = render(<UserAvatar className='size-9' />);
    const box = container.firstElementChild;
    expect(box).toHaveAttribute('data-slot', 'user-avatar-frame');
    expect(box).toHaveClass('size-9');
    expect(box).toBeEmptyDOMElement();
  });

  it('shows the user the session already gives while it still loads', () => {
    session.data = { user: owner };
    render(<UserView />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
