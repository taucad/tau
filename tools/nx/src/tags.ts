/**
 * The workspace tag vocabulary. Tags drive the release train (publishable set,
 * bundle eligibility, license partition) and the staging deploys
 * (`deploy:staging`, which `ci.yml`'s plan selects), so the allowed values live
 * in one place that the `validate-project-tags` gate and the eslint boundary
 * constraints both read. `api:<name>` names each private API server library
 * (`apps/libs/api-<name>`, `scope:api type:app-lib`); `eslint.config.mjs` gives
 * each one the libraries it may depend on, so the dependency direction between
 * them is enforced even where their `layer:` tags are equal. `ci:<lane>` names
 * the CI lanes that select a project by tag (`nx show projects --projects
 * tag:ci:<lane>`): a project may carry several, one per lane, so it is the one
 * dimension whose values are not exclusive. `ci:desktop` marks the projects the
 * packaged desktop gate keys on; `ci:shell` marks the shell conformance lane's
 * projects once the shell split tags them.
 *
 * @public
 */
export const projectTagVocabulary = {
  type: ['app', 'app-lib', 'lib', 'package', 'tool', 'example', 'e2e'],
  scope: ['shared', 'api', 'ui', 'example'],
  host: ['darwin-arm64'],
  release: ['app'],
  deploy: ['staging'],
  layer: ['feature', 'ui', 'data-access', 'util'],
  api: ['core', 'observability', 'lifecycle', 'database', 'redis', 'email', 'auth', 'hosts', 'llm-gateway', 'billing'],
  ci: ['browser', 'standalone', 'quarantined', 'shell', 'desktop'],
} as const;
