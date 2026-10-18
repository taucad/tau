/* eslint-disable @typescript-eslint/naming-convention -- Sentry request fields use the SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/electron/main';
import { scrubDesktopEvent } from '#main/error-reporting.js';

const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock('@sentry/electron/main', () => ({ init: initialize }));

describe('desktop error privacy', () => {
  it('should remove user and request data while retaining the reported error', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'synthetic desktop error',
      request: {
        url: 'https://example.invalid/check?token=private-query',
        headers: { authorization: 'private-header' },
        cookies: { session: 'private-cookie' },
        data: 'private-body',
      },
      user: { email: 'private-user@example.invalid' },
    };

    expect(scrubDesktopEvent(event)).toEqual({ type: undefined, message: 'synthetic desktop error' });
    expect(JSON.stringify(event)).not.toContain('private-');
  });

  it('should preserve an error that contains no user or request data', () => {
    const event: ErrorEvent = { type: undefined, message: 'synthetic desktop error' };

    expect(scrubDesktopEvent(event)).toEqual({ type: undefined, message: 'synthetic desktop error' });
  });

  it('should leave reporting disabled for this unsigned test build', () => {
    expect(initialize).not.toHaveBeenCalled();
  });
});
