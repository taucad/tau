import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { loader } from '#routes/settings_/route.js';

const redirectFor = (search = ''): string | undefined => {
  const request = new Request(`https://tau.new/settings${search}`);
  const response = loader({
    request,
    url: new URL(request.url),
    pattern: '/settings',
    params: {},
    context: new RouterContextProvider(),
  });
  return response.headers.get('Location') ?? undefined;
};

describe('settings_ loader', () => {
  it('should open the General section', () => {
    expect(redirectFor()).toBe('/?settings=general');
  });

  it('should keep the rest of the query, such as a returned payment action', () => {
    expect(redirectFor('?payment_action=action_1')).toBe('/?settings=general&payment_action=action_1');
  });

  it('should replace a settings parameter in the query rather than repeat it', () => {
    expect(redirectFor('?settings=account&payment_action=action_1')).toBe('/?settings=general&payment_action=action_1');
  });
});
