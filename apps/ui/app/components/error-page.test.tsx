// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type { StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const mocks = vi.hoisted(() => ({
  routeError: undefined as unknown,
  captureException: vi.fn(),
  reportUiError: vi.fn(async () => undefined),
  recoverFromStaleBuild: vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'current'),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouteError: () => mocks.routeError,
}));
const analytics = { captureException: mocks.captureException };
/** `false` models a provider that hands out a new analytics object on every render. */
let isAnalyticsStable = true;
vi.mock('#hooks/use-analytics.js', () => ({
  useAnalytics: () => (isAnalyticsStable ? analytics : { captureException: mocks.captureException }),
}));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.reportUiError }));
vi.mock('#lib/stale-build-recovery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StaleBuildRecovery>()),
  recoverFromStaleBuild: mocks.recoverFromStaleBuild,
}));
vi.mock('#components/ui/collapsible-code-block.js', () => ({
  CollapsibleCodeBlock: ({ title }: { readonly title: string }) => <pre aria-label='Stack trace'>{title}</pre>,
}));

const { ErrorPage } = await import('#components/error-page.js');

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
  // `recoverFromStaleBuild` answers every report of one failure alike, so a test sets one outcome for all of them.
  mocks.recoverFromStaleBuild.mockResolvedValue('current');
});

afterEach(() => {
  cleanup();
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
      mocks.recoverFromStaleBuild.mockResolvedValue(outcome);

      renderPage(moduleImportFailure());

      expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
      expect(mocks.reportUiError).not.toHaveBeenCalled();
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  it('should offer the reload when the update control took over', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    mocks.recoverFromStaleBuild.mockResolvedValue('superseded');

    renderPage(moduleImportFailure());
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Our team has been notified/u)).not.toBeInTheDocument();
  });

  it('should enable the reload again when the automatic reload did not navigate away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.recoverFromStaleBuild.mockResolvedValue('reloading');

    renderPage(moduleImportFailure());
    const button = await screen.findByRole('button', { name: 'Reload' });
    expect(button).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(button).toBeEnabled();
  });

  it('should report a module import failure the live build still has, without loading another chunk', async () => {
    const error = moduleImportFailure();

    renderPage(error);

    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    expect(mocks.captureException).toHaveBeenCalledWith(error, { context: { component: 'ErrorPage' } });
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Importing a module script failed.')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(screen.queryByLabelText('Stack trace')).not.toBeInTheDocument();
  });

  it('should still show the stack of any other error', async () => {
    renderPage(new Error('controlled render failure'));

    expect(await screen.findByLabelText('Stack trace')).toHaveTextContent('controlled render failure');
  });

  it('should judge each error on its own outcome', async () => {
    mocks.recoverFromStaleBuild.mockResolvedValue('superseded');
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

  it.each([
    ['a module import failure the live build still has', moduleImportFailure],
    ['any other error', () => new Error('controlled render failure')],
  ])('should report %s once, however often the page renders', async (_label, makeError) => {
    isAnalyticsStable = false;
    try {
      const error = makeError();
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

      expect(mocks.reportUiError).toHaveBeenCalledOnce();
      expect(mocks.captureException).toHaveBeenCalledOnce();
    } finally {
      isAnalyticsStable = true;
    }
  });

  it('should report any other error without asking the server', async () => {
    const error = new Error('controlled render failure');

    renderPage(error);

    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    expect(mocks.recoverFromStaleBuild).not.toHaveBeenCalled();
  });
});
