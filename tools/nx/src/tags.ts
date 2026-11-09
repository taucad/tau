/**
 * The workspace tag vocabulary. Tags drive the release train (publishable set,
 * bundle eligibility, license partition) and the staging deploys
 * (`deploy:staging`, which `ci.yml`'s plan selects), so the allowed values live
 * in one place that the `validate-project-tags` gate and the eslint boundary
 * constraints both read. `api:<name>` names each private API server library
 * (`apps/libs/api-<name>`, `scope:api type:app-lib`); `eslint.config.mjs` gives
 * each one the libraries it may depend on, so the dependency direction between
 * them is enforced even where their `layer:` tags are equal. `shell:<role>`
 * names the private libraries the shell split extracts (`sandbox`, `service`,
 * `terminal`), so their dependency direction can be constrained the same way.
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
  api: [
    'core',
    'observability',
    'lifecycle',
    'database',
    'redis',
    'email',
    'auth',
    'hosts',
    'llm-gateway',
    'billing',
    'testing',
    'object-storage',
  ],
  shell: ['sandbox', 'service', 'terminal'],
} as const;
