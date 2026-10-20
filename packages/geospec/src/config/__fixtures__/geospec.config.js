/** @type {import('geospec/config').GeoSpecConfig} */
const config = {
  include: ['cases/**/*.geospec.ts'],
  exclude: ['**/skip.geospec.ts'],
  testNamePattern: 'ordinary',
  testTimeout: 1200,
  bail: true,
};

export default config;
