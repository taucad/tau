import { defineConfig } from 'geospec/config';

export default defineConfig({
  include: ['cases/**/*.geospec.ts'],
  exclude: ['**/skip.geospec.ts'],
  testNamePattern: 'ordinary',
  testTimeout: 1200,
  bail: true,
});
