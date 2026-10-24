/**
 * Application document policy. Netlify TOML headers cover static files only;
 * SSR must send this itself. entry.server.test.tsx checks parity with netlify.toml.
 */
export const reportOnlyContentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.taucad.dev https://cdn.tau.new https://github.com https:; font-src 'self' data:; connect-src 'self' https://tau-prod-content-private.271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com https://tau-staging-content-private.271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com https://api.taucad.dev wss://api.taucad.dev https://cdn.taucad.dev https://cdn.tau.new https://api.github.com https://api.zoo.dev https://api.kittycad.io https://api.tau.new wss://api.tau.new https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://registry.npmjs.org wss:; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";
