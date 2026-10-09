import { describe, expect, it } from 'vitest';
import { loader } from '#routes/settings_/route.js';

const redirectFor = (search = ''): string | undefined => {
  const request = new Request(`https://tau.new/settings${search}`);
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Route.LoaderArgs has many fields this loader never reads
  const response = loader({ request } as Parameters<typeof loader>[0]);
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
