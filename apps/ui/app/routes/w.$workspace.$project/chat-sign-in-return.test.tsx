import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import type { SignInReturnFacts } from '#utils/sign-in-return.js';
import { ChatSignInReturn } from '#routes/w.$workspace.$project/chat-sign-in-return.js';

const continueChat = vi.fn();
const refetch = vi.fn(async () => undefined);
const world = vi.hoisted(() => ({
  chatId: 'chat_1',
  identity: 'verified' as 'verified' | 'unverified' | 'signed-out' | 'unknown',
  /* What the chat's state says, as the two selectors of this owner read it. */
  awaitsSignIn: true,
  failureId: 'run:run_1:1' as string | undefined,
  logRead: true,
  transcript: 'loaded' as 'loading' | 'loaded' | 'empty',
  listeners: new Set<() => void>(),
}));

vi.mock('#hooks/use-identity.js', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useIdentity: () => ({
      state: useSyncExternalStore(
        (listener) => {
          world.listeners.add(listener);
          return () => world.listeners.delete(listener);
        },
        () => world.identity,
      ),
      user: undefined,
    }),
  };
});
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ refetch }) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/active-chat-provider.js', () => ({ useActiveChatSession: () => ({ activeChatId: world.chatId }) }));
vi.mock('#utils/sign-in-return.js', () => {
  return {
    selectAwaitsSignIn: () => world.awaitsSignIn,
    /* The decision itself is `sign-in-return.test.ts`'s; here it is fed this suite's facts in place of a projection. */
    signInReturnStep: (facts: SignInReturnFacts) => {
      if (facts.identity === 'signed-out') {
        return 'drop';
      }
      if (facts.identity !== 'verified' || !facts.chatShown) {
        return 'wait';
      }
      if (!world.awaitsSignIn) {
        return world.logRead ? 'drop' : 'wait';
      }
      if (facts.transcript === 'loading') {
        return 'wait';
      }
      return facts.hasRequest ? 'resume' : 'drop';
    },
  };
});
vi.mock('#utils/run-auto-resume-plan.js', () => ({
  selectVisibleChatErrorEntry: () => (world.failureId === undefined ? undefined : { id: world.failureId }),
}));
vi.mock('#hooks/use-chat.js', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useChatActions: () => ({ continueChat }),
    useChatSelector: <T,>(selector: (state: unknown) => T): T =>
      useSyncExternalStore(
        (listener) => {
          world.listeners.add(listener);
          return () => world.listeners.delete(listener);
        },
        () =>
          selector({
            transcript: world.transcript,
            messages: world.transcript === 'loaded' ? [{ id: 'm1', role: 'user' }] : [],
          }),
      ),
  };
});

const change = (next: Partial<typeof world>): void => {
  act(() => {
    Object.assign(world, next);
    for (const listener of world.listeners) {
      listener();
    }
  });
};

function LocationProbe(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid='location'>{`${pathname}${search}`}</output>;
}

let arrival = 0;
/* Each test arrives at its own history entry, as each return from sign-in does. */
const arriveAt = (url: string) => {
  arrival += 1;
  const [pathname, search = ''] = url.split('?');
  const router = createMemoryRouter(
    [
      {
        path: '/w/home/p',
        element: (
          <>
            <ChatSignInReturn />
            <LocationProbe />
          </>
        ),
      },
    ],
    {
      initialEntries: [
        { pathname: pathname ?? '/', search: search === '' ? '' : `?${search}`, key: `arrival-${String(arrival)}` },
      ],
    },
  );
  return { router, view: render(<RouterProvider router={router} />) };
};

const location = (): string => screen.getByTestId('location').textContent;

describe('ChatSignInReturn (launch audit N-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(world, {
      chatId: 'chat_1',
      identity: 'verified',
      awaitsSignIn: true,
      failureId: 'run:run_1:1',
      logRead: true,
      transcript: 'loaded',
    });
    world.listeners.clear();
  });

  it('should resume the paused turn once and remove the marker, keeping the rest of the search', async () => {
    arriveAt('/w/home/p?chat=chat_1&chatResume=1');

    await vi.waitFor(() => {
      expect(location()).toBe('/w/home/p?chat=chat_1');
    });
    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should do nothing on a URL without the marker', () => {
    arriveAt('/w/home/p?chat=chat_1');

    expect(continueChat).not.toHaveBeenCalled();
    expect(location()).toBe('/w/home/p?chat=chat_1');
  });

  /* The production loop: the card resumed before the transcript was in ("nothing to continue from yet"), then a
   * second time when it mounted again under the loaded transcript. */
  it('should wait for the transcript, then resume once', async () => {
    world.transcript = 'loading';
    arriveAt('/w/home/p?chat=chat_1&chatResume=1');

    expect(continueChat).not.toHaveBeenCalled();
    expect(location()).toContain('chatResume=1');

    change({ transcript: 'loaded' });

    await vi.waitFor(() => {
      expect(location()).toBe('/w/home/p?chat=chat_1');
    });
    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should wait until the session answers, and resume when it says someone is signed in', async () => {
    world.identity = 'unknown';
    arriveAt('/w/home/p?chat=chat_1&chatResume=1');
    expect(continueChat).not.toHaveBeenCalled();

    change({ identity: 'verified' });

    await vi.waitFor(() => {
      expect(continueChat).toHaveBeenCalledTimes(1);
    });
  });

  it('should remove the marker and resume nothing for a person who came back signed out', async () => {
    world.identity = 'signed-out';
    arriveAt('/w/home/p?chat=chat_1&chatResume=1');

    await vi.waitFor(() => {
      expect(location()).toBe('/w/home/p?chat=chat_1');
    });
    expect(continueChat).not.toHaveBeenCalled();
  });

  it('should remove the marker and resume nothing when the chat holds no turn a sign-in resumes', async () => {
    world.awaitsSignIn = false;
    arriveAt('/w/home/p?chat=chat_1&chatResume=1');

    await vi.waitFor(() => {
      expect(location()).toBe('/w/home/p?chat=chat_1');
    });
    expect(continueChat).not.toHaveBeenCalled();
  });

  it('should wait while the URL names a chat the page does not show yet', () => {
    arriveAt('/w/home/p?chat=chat_2&chatResume=1');

    expect(continueChat).not.toHaveBeenCalled();
    expect(location()).toContain('chatResume=1');
  });

  it('should not take the marker again when it mounts again on the same arrival', async () => {
    const { view, router } = arriveAt('/w/home/p?chat=chat_1&chatResume=1');
    await vi.waitFor(() => {
      expect(continueChat).toHaveBeenCalledTimes(1);
    });
    view.unmount();

    /* A second mount that still reads the arrival's URL, as one does before the router's replace is committed. */
    const stale = createMemoryRouter([{ path: '/w/home/p', element: <ChatSignInReturn /> }], {
      initialEntries: [
        { pathname: '/w/home/p', search: '?chat=chat_1&chatResume=1', key: `arrival-${String(arrival)}` },
      ],
    });
    render(<RouterProvider router={stale} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(continueChat).toHaveBeenCalledTimes(1);
    router.dispose();
    stale.dispose();
  });

  describe('a run refused for want of a session while the page believes someone is signed in', () => {
    it('should ask the auth server again, once for that failed attempt', () => {
      const { view, router } = arriveAt('/w/home/p?chat=chat_1');

      expect(refetch).toHaveBeenCalledTimes(1);
      view.rerender(<RouterProvider router={router} />);
      expect(refetch).toHaveBeenCalledTimes(1);

      change({ failureId: 'run:run_1:2' });
      expect(refetch).toHaveBeenCalledTimes(2);
    });

    it('should not ask while signed out, or for a failure that is not a sign-in', () => {
      world.identity = 'signed-out';
      arriveAt('/w/home/p?chat=chat_1');
      expect(refetch).not.toHaveBeenCalled();

      world.identity = 'verified';
      world.awaitsSignIn = false;
      arriveAt('/w/home/p?chat=chat_1');
      expect(refetch).not.toHaveBeenCalled();
    });
  });
});
