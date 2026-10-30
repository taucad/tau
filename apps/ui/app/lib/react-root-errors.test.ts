// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactRootErrorHooks, reportReactError } from '#lib/react-root-errors.js';

const mocks = vi.hoisted(() => ({
  reportUiError: vi.fn(async () => undefined),
  recoverFromCaughtError: vi.fn(),
}));

vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.reportUiError }));
vi.mock('#lib/stale-build-recovery.js', () => ({
  isStaleModuleError: (error: unknown) => error instanceof TypeError && error.message.includes('module script'),
  recoverFromCaughtError: mocks.recoverFromCaughtError,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.reportUiError.mockClear();
  mocks.recoverFromCaughtError.mockClear();
});

const componentStack = '\n    at Panel\n    at Workspace';

describe('reportReactError', () => {
  it('should report an error with React’s component stack in the react context', () => {
    const error = new Error('render failed');

    reportReactError(error, { componentStack });

    expect(mocks.reportUiError).toHaveBeenCalledExactlyOnceWith(error, { contexts: { react: { componentStack } } });
  });

  it('should report without a react context when React gave no component stack', () => {
    const error = new Error('render failed');

    reportReactError(error, {});

    expect(mocks.reportUiError).toHaveBeenCalledExactlyOnceWith(error, {});
  });

  it('should hand a module load failure to the stale-build recovery instead of reporting it', () => {
    const error = new TypeError('Importing a module script failed.');

    reportReactError(error, { componentStack });

    expect(mocks.recoverFromCaughtError).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.reportUiError).not.toHaveBeenCalled();
  });

  it('should leave a route error response to the route error page', () => {
    reportReactError({ status: 404, statusText: 'Not Found', internal: true, data: '' }, { componentStack });

    expect(mocks.reportUiError).not.toHaveBeenCalled();
  });
});

describe('reactRootErrorHooks', () => {
  it.each(['onCaughtError', 'onUncaughtError', 'onRecoverableError'] as const)(
    'should report through %s and keep React’s console output',
    (hook) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error(hook);

      reactRootErrorHooks[hook](error, { componentStack });

      expect(mocks.reportUiError).toHaveBeenCalledExactlyOnceWith(error, { contexts: { react: { componentStack } } });
      expect(consoleError).toHaveBeenCalledWith(error, componentStack);
    },
  );
});
