// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appStartUrl, homeAppEntry } from '#lib/route-classes.js';
import { loader } from '#routes/manifest[.webmanifest].js';

describe('manifest.webmanifest', () => {
  it('should launch the installed app into Home under a stable identity (PL7)', async () => {
    const response = (await loader({} as Parameters<typeof loader>[0])) as Response;
    const manifest = (await response.json()) as Record<string, unknown>;

    expect([manifest['start_url'], manifest['id'], manifest['scope']]).toStrictEqual([appStartUrl, '/', '/']);
    // The start URL is Home even for a visitor with no `tau-entry` preference, so the worker answers it offline.
    expect(homeAppEntry(new URL(appStartUrl, 'https://tau.new').searchParams, undefined)).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/manifest+json');
  });
});
