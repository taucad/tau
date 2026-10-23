// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type { StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  reportUiError: vi.fn(async () => undefined),
  recoverFromStaleBuild: vi.fn(async (): Promise<StaleBuildOutcome> => 'current'),
}));

vi.mock('#hooks/use-analytics.js', () => ({
  useAnalytics: () => ({ captureException: mocks.captureException }),
}));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.reportUiError }));
vi.mock('#lib/stale-build-recovery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StaleBuildRecovery>()),
  recoverFromStaleBuild: mocks.recoverFromStaleBuild,
}));

const { ErrorPage } = await import('#components/error-page.js');

/** Render the boundary for a route whose render threw `error`, as a failed `React.lazy` import does. */
const renderBoundary = (error: Error): void => {
  const Thrower = (): never => {
    throw error;
  };
  const router = createMemoryRouter([{ path: '/', Component: Thrower, ErrorBoundary: ErrorPage }]);
  render(<RouterProvider router={router} />);
};

/** The stackless error WebKit raised for TAU-UI-6. */
const moduleImportFailure = (): TypeError => {
  const error = new TypeError('Importing a module script failed.');
  error.stack = undefined;
  return error;
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // `recoverFromStaleBuild` answers every caller on a page alike, so a test sets one outcome for all of them.
  mocks.recoverFromStaleBuild.mockResolvedValue('current');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ErrorPage', () => {
  it.each<StaleBuildOutcome>(['reloading', 'superseded'])(
    'should not report a module import failure a deploy explains (%s)',
    async (outcome) => {
      mocks.recoverFromStaleBuild.mockResolvedValue(outcome);

      renderBoundary(moduleImportFailure());

      await waitFor(() => {
        expect(mocks.recoverFromStaleBuild).toHaveBeenCalled();
      });
      expect(await screen.findByRole('heading', { name: 'Tau has been updated' })).toBeInTheDocument();
      expect(mocks.reportUiError).not.toHaveBeenCalled();
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  it('should offer the reload when the update control took over', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    mocks.recoverFromStaleBuild.mockResolvedValue('superseded');

    renderBoundary(moduleImportFailure());
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Our team has been notified/u)).not.toBeInTheDocument();
  });

  it('should report a module import failure the live build still has', async () => {
    const error = moduleImportFailure();

    renderBoundary(error);

    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    expect(mocks.captureException).toHaveBeenCalledWith(error, { context: { component: 'ErrorPage' } });
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });

  it('should report any other error without asking the server', async () => {
    const error = new Error('controlled render failure');

    renderBoundary(error);

    await waitFor(() => {
      expect(mocks.reportUiError).toHaveBeenCalledWith(error);
    });
    expect(mocks.recoverFromStaleBuild).not.toHaveBeenCalled();
  });
});
