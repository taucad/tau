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
 * `ui:<name>` names each UI app library (`scope:ui type:app-lib`) in the
 * layering of `docs/research/ui-app-lib-layering-blueprint.md`: a layered
 * library by its own name, `infra` for the libraries every layer may use and
 * `unlayered` for those no layered library may use; `eslint.config.mjs` gives
 * each layered library the libraries it may depend on.
 * `protocol:agent` marks the agent-protocol projects that the UI foundation
 * libraries may not reach.
 * `ci:<lane>` names the CI lanes that select a project by tag (`nx show
 * projects --projects tag:ci:<lane>`): a project may carry several, one per
 * lane, so it is the one dimension whose values are not exclusive. `ci:desktop`
 * marks the projects the packaged desktop gate keys on; `ci:shell` marks the
 * shell conformance lane's projects once the shell split tags them;
 * `ci:native-hosts` marks the projects whose change selects the Linux native
 * host rows (`native-hosts.yml`, which `ci.yml`'s plan calls in the merge queue).
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
    'git-core',
    'git-mirror',
    'agent-observability',
    'chat',
    'projects',
  ],
  shell: ['sandbox', 'service', 'terminal'],
  ui: [
    'ui-core',
    'ui-kit',
    'chat-ui',
    'files-ui',
    'editor-ui',
    'revisions-ui',
    'publish-ui',
    'settings-ui',
    'billing-ui',
    'chat-surfaces',
    'project-workspace',
    'agent-host-ui',
    'infra',
    'unlayered',
  ],
  protocol: ['agent'],
  ci: ['browser', 'standalone', 'quarantined', 'shell', 'desktop', 'native-hosts'],
} as const;
