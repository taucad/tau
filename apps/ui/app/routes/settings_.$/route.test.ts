import { describe, expect, it } from 'vitest';
import { settingsSectionSchema } from '#hooks/use-settings-dialog.js';
import { loader } from '#routes/settings_.$/route.js';

const redirectFor = (splat: string): string | undefined =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Route.LoaderArgs has many fields this loader never reads
  loader({ params: { '*': splat } } as Parameters<typeof loader>[0]).headers.get('Location') ?? undefined;

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
});
