/*
 * The scripts test sets that `vitest.config.ts` selects with `TAU_SCRIPTS_TEST_SET`. Paths are relative to `scripts/`.
 */

/**
 * Suites that launch Playwright Chromium or run Pandoc. `scripts:test:e2e` sets
 * `TAU_SCRIPTS_TEST_SET=browser` to run only these on the Browser end-to-end lane, which
 * provides both; `scripts:test` excludes them and stays hermetic.
 */
export const browserTests = ['src/canvas-vite.config.test.ts', 'src/reference-html.test.ts'];

/**
 * Suites that read other projects' files outside `scripts`' dependency closure: the Nx project
 * graph, every project's configuration or sources, or a sibling-directory listing. No input list
 * short of the whole workspace keys them, and a `{workspaceRoot}` input would make every file in the
 * workspace select `scripts`. `scripts:validate-workspace-tests` runs them uncached in Validate
 * workspace on every landing instead; `scripts:test` excludes them.
 *
 * A suite that reads only `scripts`, its dependencies and the workspace files `scripts:test` lists
 * as inputs belongs in `scripts:test`.
 */
export const workspaceTests = [
  'src/affected-selection.test.ts',
  'src/api-shard-union.test.ts',
  'src/billing-stripe-lanes.test.ts',
  'src/check-cadmpeg-engine-mirror.test.ts',
  'src/check-standalone-project.test.ts',
  'src/check-viewer-shell-parity.test.ts',
  'src/ci-affected-lanes.test.ts',
  'src/desktop-platform-scope-workflow.test.ts',
  'src/desktop-split-graph.test.ts',
  'src/docs-links-workflow.test.ts',
  'src/end-to-end-ratchet.test.ts',
  'src/formal-plugin-target.test.ts',
  'src/nx-cache-inputs.test.ts',
  'src/paseo-absence.test.ts',
  'src/readme-shape.test.ts',
  'src/release-publish-workflow.test.ts',
  'src/shell-evidence.test.ts',
  'src/shell-split-graph.test.ts',
  'src/telemetry-grafana-contract.test.ts',
  'src/telemetry-release-partition.test.ts',
  'src/telemetry-runtime-vocabulary.test.ts',
  'src/telemetry-usage-coverage.test.ts',
  'src/telemetry-vocabulary-contract.test.ts',
  'src/test-shard-dealer.test.ts',
  'src/tsgo-plugin-target.test.ts',
  'src/validate-cross-root-reads.test.ts',
  'src/validate-project-tags.test.ts',
  'src/validate-workflows.test.ts',
  'src/viewer-parity-graph.test.ts',
  'src/vitest-browser-ownership.test.ts',
];
