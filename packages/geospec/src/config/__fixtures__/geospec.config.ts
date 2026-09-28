import type { GeoSpecConfig } from 'geospec/config';
// oxlint-disable-next-line no-restricted-imports -- Native config fixtures require project-relative JSON imports.
import manifest from './tau.json' with { type: 'json' };

export default {
  include: ['cases/**/*.geospec.ts'],
  exclude: ['**/skip.geospec.ts'],
  testNamePattern: 'ordinary',
  testTimeout: 1200,
  matcherWallBackstop: 2400,
  bail: true,
  forensic: true,
  cache: true,
  cacheDirectory: '.tau/config-cache',
  subjects: {
    part: { kind: 'tau-project', manifestPath: 'tau.json', manifest, format: 'step', parameters: { width: 4 } },
  },
} satisfies GeoSpecConfig;
