import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const { handleQueryError, handleWebSessionRequired, isWebSessionRequiredError } =
  await import('#runtime/root-query-client.js');

/* Desktop sign-in DSI-5: an unanticipated 403 WEB_SESSION_REQUIRED in Tau Desktop offers Tau on the web. */
describe('WEB_SESSION_REQUIRED in Tau Desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TAU_TARGET', 'desktop');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['at the top level', { code: 'WEB_SESSION_REQUIRED', status: 403 }],
    ['in a fetch body', { status: 403, body: { code: 'WEB_SESSION_REQUIRED' } }],
    ['in a Better Fetch error', { error: { code: 'WEB_SESSION_REQUIRED', message: 'This needs Tau on the web.' } }],
    ['as a cause', new Error('refused', { cause: { code: 'WEB_SESSION_REQUIRED' } })],
  ])('should recognise the code %s', (_where, error) => {
    expect(isWebSessionRequiredError(error)).toBe(true);
  });

  it('should not mistake another refusal', () => {
    expect(isWebSessionRequiredError({ status: 403, body: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isWebSessionRequiredError(undefined)).toBe(false);
  });

  it('should offer Open in browser for a query instead of a bare error, once per refusal id', () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    handleQueryError({ error: { code: 'WEB_SESSION_REQUIRED', message: 'This needs Tau on the web.' } }, undefined);

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      'This needs Tau on the web',
      expect.objectContaining({ id: 'WEB_SESSION_REQUIRED' }),
    );
    const options = toast.mock.calls[0]?.[1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe('Open in browser');
    options.action.onClick();
    expect(open).toHaveBeenCalledWith('http://localhost:3000', '_blank', 'noreferrer');
  });

  it('should leave the web build to its usual error handling', () => {
    vi.unstubAllEnvs();

    expect(handleWebSessionRequired({ code: 'WEB_SESSION_REQUIRED' })).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});
