import type { GeoSpecConfig } from 'geospec/config';

export default {
  include: ['cases/**/*.geospec.ts'],
  exclude: ['**/skip.geospec.ts'],
  testNamePattern: 'ordinary',
  testTimeout: 1200,
  bail: true,
} satisfies GeoSpecConfig;
