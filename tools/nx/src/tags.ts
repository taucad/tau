/**
 * The workspace tag vocabulary. Tags drive the release train (publishable set,
 * bundle eligibility, license partition), so the allowed values live in one
 * place that the `validate-project-tags` gate and the eslint boundary
 * constraints both read.
 *
 * @public
 */
export const projectTagVocabulary = {
  type: ['app', 'app-lib', 'lib', 'package', 'tool', 'example', 'e2e'],
  scope: ['shared', 'api', 'ui', 'example'],
  layer: ['feature', 'ui', 'data-access', 'util'],
} as const;
