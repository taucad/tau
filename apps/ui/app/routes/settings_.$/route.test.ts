import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { settingsSectionSchema } from '@taucad/settings-ui/components/settings/settings-section';
import { loader } from '#routes/settings_.$/route.js';

const redirectFor = (splat: string, search = ''): string | undefined => {
  const request = new Request(`https://tau.new/settings/${splat}${search}`);
  const response = loader({
    request,
    url: new URL(request.url),
    pattern: '/settings/*',
    params: { '*': splat },
    context: new RouterContextProvider(),
  });
  return response.headers.get('Location') ?? undefined;
};

describe('settings_.$ loader', () => {
  it('reaches the Models section, which the hand-copied allow-set had dropped', () => {
    expect(redirectFor('models')).toBe('/?settings=models');
  });

  it('reaches every section the dialog can show', () => {
    for (const section of settingsSectionSchema.options) {
      expect(redirectFor(section)).toBe(`/?settings=${section}`);
    }
  });

  it('falls back to General for a segment that is not a section', () => {
    expect(redirectFor('api-keys')).toBe('/?settings=general');
    expect(redirectFor('')).toBe('/?settings=general');
  });

  it('should keep the rest of the query, such as a returned payment action', () => {
    expect(redirectFor('billing', '?payment_action=action_1')).toBe('/?settings=billing&payment_action=action_1');
  });

  it('should replace a settings parameter in the query rather than repeat it', () => {
    expect(redirectFor('billing', '?settings=account&payment_action=action_1')).toBe(
      '/?settings=billing&payment_action=action_1',
    );
  });
});
