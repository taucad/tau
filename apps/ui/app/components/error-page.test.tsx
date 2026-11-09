// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type * as BuildSkew from '#filesystem/build-skew.js';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import type { ReloadState, StaleBuildOutcome } from '#lib/stale-build-recovery.js';
import { ChatSessionStore } from '#services/chat-session-store.js';

const mocks = vi.hoisted(() => ({
  routeError: undefined as unknown,
  reportUiError: vi.fn(async () => undefined),
  recoverFromStaleBuild: vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'current'),
  reloadState: 'idle' as ReloadState,
  reloadStateListeners: new Set<() => void>(),
  outcomes: new Map<unknown, StaleBuildOutcome>(),
  outcomeListeners: new Set<() => void>(),
  verdict: 'unknown' as ServerVerdict,
  verdictListeners: new Set<() => void>(),
}));

/** `build-skew`'s live verdict changes, as the confirmed server answers move it. */
const setVerdict = (verdict: ServerVerdict): void => {
  mocks.verdict = verdict;
  for (const listener of mocks.verdictListeners) {
    listener();
  }
};

/** The recovery settles (or later changes) a failure's outcome, as `createStaleBuildRecovery` does. */
const setOutcome = (failure: unknown, outcome: StaleBuildOutcome): void => {
  mocks.outcomes.set(failure, outcome);
  for (const listener of mocks.outcomeListeners) {
    listener();
  }
};

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouteError: () => mocks.routeError,
}));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.reportUiError }));
vi.mock('#lib/stale-build-recovery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StaleBuildRecovery>()),
  recoverFromStaleBuild: async (failure: unknown) => {
    const outcome = await mocks.recoverFromStaleBuild(failure);
    setOutcome(failure, outcome);
    return outcome;
  },
  readStaleBuildOutcome: (failure: unknown) => mocks.outcomes.get(failure),
  subscribeStaleBuildOutcomes: (listener: () => void) => {
    mocks.outcomeListeners.add(listener);
    return () => {
      mocks.outcomeListeners.delete(listener);
    };
  },
  readReloadState: () => mocks.reloadState,
  subscribeReloadState: (listener: () => void) => {
    mocks.reloadStateListeners.add(listener);
    return () => {
      mocks.reloadStateListeners.delete(listener);
    };
  },
}));
vi.mock('#filesystem/build-skew.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BuildSkew>()),
  readServerVerdict: () => mocks.verdict,
  subscribeServerVerdict: (listener: () => void) => {
    mocks.verdictListeners.add(listener);
    return () => {
      mocks.verdictListeners.delete(listener);
    };
  },
}));
vi.mock('#components/ui/collapsible-code-block.js', () => ({
  CollapsibleCodeBlock: ({ title }: { readonly title: string }) => <pre aria-label='Stack trace'>{title}</pre>,
}));

const { ErrorPage } = await import('#components/error-page.js');
const { BuildSkewBanner } = await import('#components/build-skew-banner.js');
const { buildId, offerReload } = await import('#filesystem/build-skew.js');
const { useReloadPromptOwned } = await import('#components/nav/browser-update.js');

/** A deploy explains the failure: the recovery offers the reload, as `recoverFromStaleBuild` does, and says so. */
const supersededOutcome = (): void => {
  mocks.recoverFromStaleBuild.mockImplementation(async () => {
    offerReload(buildId + 1);
    return 'superseded';
  });
};

/** The error WebKit raised for TAU-UI-6; a stack is set so the code block would be eligible. */
const moduleImportFailure = (): TypeError => new TypeError('Importing a module script failed.');

/** An outcome the test settles by hand, to observe the page while the check is pending. */
const deferredOutcome = (): { readonly settle: (outcome: StaleBuildOutcome) => Promise<void> } => {
  let resolveOutcome: (outcome: StaleBuildOutcome) => void = () => undefined;
  const pending = new Promise<StaleBuildOutcome>((resolve) => {
    resolveOutcome = resolve;
  });
  mocks.recoverFromStaleBuild.mockReturnValue(pending);
  return {
    async settle(outcome) {
      await act(async () => {
        resolveOutcome(outcome);
        await pending;
      });
    },
  };
};

/** Every value the page handed the error tracker's report, in order. */
const reportedValues = (): unknown[] =>
  (mocks.reportUiError.mock.calls as unknown as Array<[unknown]>).map(([value]) => value);

const renderPage = (error: unknown): ReturnType<typeof render> => {
  mocks.routeError = error;
  return render(
    <MemoryRouter>
      <ErrorPage />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.reloadState = 'idle';
  mocks.outcomes.clear();
  // `recoverFromStaleBuild` answers every report of one failure alike, so a test sets one outcome for all of them.
  mocks.recoverFromStaleBuild.mockResolvedValue('current');
});

afterEach(() => {
  cleanup();
  sessionStorage.removeItem('tau.chat-observation-quarantine');
  mocks.verdict = 'unknown';
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ErrorPage', () => {
  it('should show a neutral check, not the crash page, while it asks whether a deploy explains the failure', async () => {
    const outcome = deferredOutcome();
    const error = moduleImportFailure();

    renderPage(error);

    expect(screen.getByRole('status')).toHaveTextContent('Checking for a newer version of Tau');
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByText(/Our team has been notified/u)).not.toBeInTheDocument();
    expect(mocks.recoverFromStaleBuild).toHaveBeenCalledWith(error);
    expect(mocks.reportUiError).not.toHaveBeenCalled();
    await outcome.settle('current');
  });

  it.each<StaleBuildOutcome>(['reloading', 'superseded'])(
    'should not report a module import failure a deploy explains (%s)',
    async (outcome) => {
      if (outcome === 'superseded') {
        supersededOutcome();
      } else {
        mocks.recoverFromStaleBuild.mockResolvedValue(outcome);
        mocks.reloadState = 'pending';
      }

      renderPage(moduleImportFailure());

      expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
      expect(mocks.reportUiError).not.toHaveBeenCalled();
    },
  );

  it('should offer the reload when the update control took over', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    supersededOutcome();

    renderPage(moduleImportFailure());
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Our team has been notified/u)).not.toBeInTheDocument();
  });

  it('should own the reload prompt, so the floating banner does not repeat it', async () => {
    supersededOutcome();
    mocks.routeError = moduleImportFailure();
    render(
      <MemoryRouter>
        <ErrorPage />
        <BuildSkewBanner />
      </MemoryRouter>,
    );
    act(() => {
      offerReload(buildId + 1);
    });

    expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should enable the reload once the recovery calls its own reload stalled, with no timer of its own', async () => {
    mocks.recoverFromStaleBuild.mockResolvedValue('reloading');
    mocks.reloadState = 'pending';

    renderPage(moduleImportFailure());
    const button = await screen.findByRole('button', { name: 'Reload' });
    expect(button).toBeDisabled();

    act(() => {
      mocks.reloadState = 'stalled';
      offerReload(buildId + 1);
      for (const listener of mocks.reloadStateListeners) {
        listener();
      }
    });

    expect(button).toBeEnabled();
  });

  it('should withdraw the update prompt once the server confirms this build live, reporting nothing itself', async () => {
    supersededOutcome();
    const error = moduleImportFailure();
    const Owned = (): React.JSX.Element => <output aria-label='Prompt owned'>{String(useReloadPromptOwned())}</output>;
    mocks.routeError = error;
    render(
      <MemoryRouter>
        <ErrorPage />
        <Owned />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Prompt owned' })).toHaveTextContent('true');

    // The rollback ends: `build-skew` confirms this build live, and the page claims no update.
    act(() => {
      setVerdict('live');
    });

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Prompt owned' })).toHaveTextContent('false');
    expect(mocks.reportUiError).not.toHaveBeenCalled();
  });

  it('should switch a failure first called genuine to the update prompt once the server confirms another build', async () => {
    const error = moduleImportFailure();
    renderPage(error);
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();

    act(() => {
      setVerdict('replaced');
    });

    expect(screen.getByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
  });

  it('should show a module import failure the live build still has without reporting it or loading another chunk', async () => {
    const error = moduleImportFailure();

    renderPage(error);

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Importing a module script failed.')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(screen.queryByLabelText('Stack trace')).not.toBeInTheDocument();
    // The recovery reports a genuine failure a boundary caught (`onGenuineFailure`); a second report would double it.
    expect(mocks.reportUiError).not.toHaveBeenCalled();
  });

  it('should still show the stack of any other error', async () => {
    renderPage(new Error('controlled render failure'));

    expect(await screen.findByLabelText('Stack trace')).toHaveTextContent('controlled render failure');
  });

  it('should offer a retry of the failed navigation, not the crash page, for a request that never reached the server', async () => {
    const failure = new TypeError('Failed to fetch (taucad.dev)');
    const navigations: string[] = [];
    const LocationProbe = (): undefined => {
      const { key } = useLocation();
      navigations.push(key);
      return undefined;
    };
    mocks.routeError = failure;
    render(
      <MemoryRouter initialEntries={['/w/home/turbofan-engine-fork']}>
        <ErrorPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Couldn’t reach Tau' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Stack trace')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(reportedValues()).toEqual([failure]);
    });

    const before = new Set(navigations).size;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => {
      expect(new Set(navigations).size).toBe(before + 1);
    });
    act(() => {
      globalThis.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(new Set(navigations).size).toBe(before + 2);
    });
  });

  it('should judge each error on its own outcome', async () => {
    supersededOutcome();
    const view = renderPage(moduleImportFailure());
    expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();

    const outcome = deferredOutcome();
    mocks.routeError = moduleImportFailure();
    view.rerender(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading', { name: 'Tau has been updated' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking for a newer version of Tau');
    await outcome.settle('current');
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });

  it('should report any other error as the same value however often the page renders', async () => {
    const error = new Error('controlled render failure');
    const view = renderPage(error);
    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });

    view.rerender(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>,
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    // The same value each time: the error tracker's report deduplicates it (`reportUiError`).
    expect(new Set(reportedValues())).toStrictEqual(new Set([error]));
  });

  it('should report an error as the same value when the error page mounts again for it', async () => {
    const error = new Error('controlled render failure');
    const first = renderPage(error);
    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    first.unmount();

    renderPage(error);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    expect(new Set(reportedValues())).toStrictEqual(new Set([error]));
  });

  it('should report a server error response as the same value however often the page mounts for it', async () => {
    const response = { status: 503, statusText: 'Service Unavailable', internal: true, data: '' };
    const first = renderPage(response);
    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalled();
    });
    first.unmount();
    renderPage(response);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    const reported = new Set(reportedValues());
    expect(reported.size).toBe(1);
    expect([...reported][0]).toMatchObject({ name: 'route_error', message: '503 Service Unavailable' });
  });

  it('should report any other error without asking the server', async () => {
    const error = new Error('controlled render failure');

    renderPage(error);

    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    expect(mocks.recoverFromStaleBuild).not.toHaveBeenCalled();
  });

  it('should open home instead of replaying the crashing route when a chat is already observed', () => {
    mocks.routeError = new Error(
      'Chat 00000000-0000-4000-8000-000000000000 is already observed in project proj_cqfNAOB65eDYLOe1Y0h8H.',
    );
    render(
      <MemoryRouter initialEntries={['/w/home/bracket', '/w/disk/bracket']} initialIndex={1}>
        <ErrorPage />
        <ObservedPath />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));

    expect(screen.getByTestId('observed-path').textContent).toBe('/');
    expect(sessionStorage.getItem('tau.chat-observation-quarantine')).toContain('00000000-0000-4000-8000-000000000000');
  });

  it('should remember the conflicting chat before reload so the next launch skips it', () => {
    renderPage(new Error('Chat chat_shared is already observed in project proj_a.'));

    fireEvent.click(screen.getByRole('button', { name: 'Reload Page' }));

    expect(sessionStorage.getItem('tau.chat-observation-quarantine')).toContain('chat_shared');
    const store = new ChatSessionStore();
    const releaseHome = store.observe('chat_shared', 'proj_a');
    const releaseWorkspace = store.observe('chat_shared', 'proj_b');
    expect(store.observedChatIdsOf('proj_a')).toEqual([]);
    expect(store.observedChatIdsOf('proj_b')).toEqual([]);
    releaseHome();
    releaseWorkspace();
  });
});

function ObservedPath(): React.JSX.Element {
  const location = useLocation();
  return <div data-testid='observed-path'>{location.pathname}</div>;
}
