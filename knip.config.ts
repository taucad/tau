import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Blind spot worth knowing before trusting a clean run: this flag plus a broad
  // entry glob hides exports whose only remaining importers are tests. Knip
  // reported neither `consumeSseBody` (re-exported from a non-test file that is
  // itself reachable) nor `TokenBudgetService` (reached from an `apps/api`
  // `*.module.ts` entry) while both were dead. A dead-code sweep still needs a
  // per-export importer scan that partitions test from non-test importers.
  ignoreExportsUsedInFile: true,

  // Build output is not a source of truth. Knip follows published `exports`
  // fields into `dist/`, so a built tree reports every emitted file and export
  // as unused (~970 phantom issues locally). CI checks out fresh and never
  // builds before the knip job, so this only ever bit local runs.
  ignore: ['**/dist/**', '**/build/**', 'repos/**', 'docs/research/**', '.claude/**'],

  rules: {
    optionalPeerDependencies: 'off',
    duplicates: 'off',
  },

  // ponytail: kept literal — deriving from `type:tool` would also ignore libs/oxlint, libs/vite and scripts
  // (which has its own `workspaces` entry below) and lose knip coverage; see mdx-package-boundary blueprint R2 status.
  // Named one by one rather than as `tools/*`: knip turns each ignored workspace pattern into a negated
  // project glob (`tools/*` → `!tools/**`), which also hid `tools/pkgcheck.ts` — and with it every
  // dependency that file is the only consumer of — from the root workspace.
  ignoreWorkspaces: ['tools/nx', 'tools/workspace-plugin', 'libs/tau-examples'],

  vitest: {
    config: ['vitest*.config.{js,ts,mts}', 'vite.config.{js,ts}'],
  },

  ignoreBinaries: [
    'fly',
    'docker-compose',
    // OS and toolchain executables the scripts and tests shell out to on purpose; none is an npm package.
    // macOS packaging and signing (apps/desktop/scripts, scripts/src/rtf-transcript-to-html.ts).
    'codesign',
    'ditto',
    'lipo',
    'otool',
    'security',
    'spctl',
    'textutil',
    'xcrun',
    // POSIX/Windows process and file utilities.
    'cmp',
    'make',
    'mkfifo',
    'openssl',
    'ps',
    'strip',
    'taskkill',
    'uptime',
    'which',
    // A shell builtin inside a multi-line Nx command (`unset GEOSPEC_…`), not an executable.
    'unset',
    // Language toolchains provisioned outside pnpm (Rust, Python, uv).
    'python3',
    'rustup',
    'uv',
    // External CLIs the opt-in acceptance tests drive: Stripe/ngrok webhooks and the Codex ACP agent.
    'codex',
    'ngrok',
    'stripe',
    // macOS/BSD utilities used by the Quick Look build, CI artifact locking and the PicoGK benchmark.
    'getconf',
    'lockf',
    'lsof',
    'plutil',
  ],

  ignoreDependencies: [
    // The docs collections generate under the root node_modules/.cache and import
    // fumadocs-mdx/runtime from there, so it must resolve from the workspace root.
    'fumadocs-mdx',
    'oxlint',
    'oxlint-tsgolint',
    'copy-files-from-to',
    // ESLint plugins loaded via .oxlintrc.json (not traceable by Knip)
    '@eslint-community/eslint-plugin-eslint-comments',
    '@protontech/eslint-plugin-enforce-uint8array-arraybuffer',
    'eslint-plugin-jsdoc',
    'eslint-plugin-n',
    'eslint-plugin-no-barrel-files',
    'eslint-plugin-no-use-extend-native',
    'eslint-plugin-unicorn',
    'eslint-plugin-react',
    // Workspace protocol references needed by pnpm
    '@taucad/chat',
    '@taucad/filesystem',
    '@taucad/fs-client',
    '@taucad/utils',
    // Loaded by Nx plugin or build tooling, not direct imports
    '@typescript/native-preview',
    '@tailwindcss/typography',
  ],

  // Nx runs a target command from the workspace root (or a root-relative `cwd`), but knip's Nx
  // plugin resolves it from the project directory. Scripts that targets invoke with
  // `packages/<name>/…` paths are therefore registered per workspace below.
  workspaces: {
    '.': {
      // The workspace-root scripts Nx targets and build configs run; `pkgcheck.ts`
      // is the only consumer of `@taucad/nx`, `madge`, and `@types/madge`.
      nx: {
        config: [
          'nx.json',
          'project.json',
          '{apps,libs,packages,tools}/**/project.json',
          'scripts/project.json',
          'package.json',
        ],
      },
      entry: [
        'tools/*.ts',
        '{apps,libs,packages,scripts,tools}/**/*.{test,spec,test-d}.{ts,tsx,mts}',
        // Nx targets of the package-less e2e projects (`cwd: "{workspaceRoot}"`). The Nx plugin
        // lists these commands, yet the scripts still came out unreached, so they are named here
        // together with the files those scripts and specs start by path.
        'apps/desktop-e2e/scripts/run-completed-artifact.mts',
        'apps/react-e2e/scripts/benchmark-bundler-products.mts',
        'apps/ui-e2e/scripts/verify-safari-remote-host.mts',
        // `benchmark-bundler-products.mts` builds with this file as Vite's `configFile`.
        'apps/react-e2e/vite.bundler-products.config.ts',
        // `global-setup.ts` boots it for snapshot runs; `browser-command.ts` and
        // `open-to-frame-observation.test.ts` spawn the other two.
        'apps/ui-e2e/production-server.ts',
        'apps/ui-e2e/src/support/{host-fixture,open-to-frame}.ts',
      ],
      project: ['**/*.{ts,tsx,mts}'],
      ignore: [
        '.agents/skills/create-repo/templates/**',
        '.claude/skills/**',
        'tarballs/**',
        'tools/eslint-fixtures/**',
      ],
      // Nx invokes the canvas config from the root; it requires a selected private artifact.
      vite: false,
      ignoreDependencies: [
        'replicad-opencascadejs',
        'libcascade',
        '@arethetypeswrong/cli',
        '@nx/nest',
        '@nx/node',
        '@nx/web',
        '@nx/webpack',
        '@nestjs/schematics',
      ],
    },
    'apps/api': {
      entry: [
        'app/main.ts',
        'app/*-command.ts',
        'app/api/**/*.module.ts',
        'app/database/**/*.ts',
        'app/telemetry/**/*.ts',
        'app/types/**/*.d.ts',
        'scripts/*.mts',
        // Started by path: `test:billing-load` runs `run.ts`, which forks `driver.ts` and boots
        // `cluster.ts`; the e2e Tau-cloud fixtures spawn the development billing account; the
        // foundation and lifecycle tests fork the remaining children.
        'app/testing/billing-load/{run,driver,cluster}.ts',
        'app/testing/development-billing-account.ts',
        'app/testing/{billable-invocation-child,billing-payments-process-worker}.ts',
        'app/lifecycle/graceful-shutdown.signal-fixture.ts',
      ],
      ignoreDependencies: [
        // `logger/logger-factory.ts` names it as a pino transport target, which knip cannot see.
        'pino-pretty',
      ],
    },
    'apps/desktop': {
      // Electron's main/preload and utility-process bundles are separate entry points.
      entry: [
        'electron.vite.config.ts',
        'src/main/index.ts',
        'src/preload/**/*.ts',
        'src/tau/*.entry.ts',
        'scripts/*.mts',
        // `apps/desktop/macos/project.json` runs both with paths from the workspace root.
        'macos/scripts/*.mts',
        // Ambient `tauCloudBuildEnabled`, defined by electron.vite.config.ts.
        'src/build-environment.d.ts',
      ],
      ignoreDependencies: [
        // The externalization test resolves this platform package from a synthetic install tree it writes.
        '@taucad/geospec-engine-native-darwin-arm64',
        // `desktopExternalizedDependencies` (electron.vite.config.ts): loaded from node_modules at run
        // time and copied in by the packaging script; the ACP adapters are resolved by name through
        // `discoverAcpAgents({ resolveFrom: import.meta.url })` (packages/host/src/acp/registry.ts).
        '@agentclientprotocol/claude-agent-acp',
        '@agentclientprotocol/codex-acp',
        '@anthropic-ai/sandbox-runtime',
        'nanoraster',
      ],
    },
    'apps/libs/lsp': {
      // Ambient module declaration for Monaco's TypeScript worker import.
      entry: ['src/monaco-ts-worker/ts-worker.module.d.ts'],
    },
    'apps/react-e2e/apps/electron': {
      // electron-vite inputs (main, kernel host, preload) and the renderer's index.html script.
      entry: [
        'electron.vite.config.ts',
        'src/main/{index,kernel-host}.ts',
        'src/preload/preload.ts',
        'src/renderer/main.tsx',
      ],
      // CAD project the app opens as TAU_PROJECT_ROOT; the Replicad kernel evaluates it.
      ignore: ['workspace/**'],
    },
    'apps/react-e2e/apps/react-router': {
      entry: [
        // `apps/react-e2e/vitest.bundlers.config.ts` runs this spec from the parent project.
        'app/bundlers.browser.test.ts',
        // `vite.bundler-products.config.ts` builds bundler-benchmark/index.html (→ main.ts) and
        // aliases the selected `bundler-<mode>.ts`.
        'bundler-benchmark/{main,bundler-esbuild,bundler-rolldown}.ts',
      ],
      // That config's `resolve.alias` points `#benchmark-bundler` at the mode's bundler file;
      // bundler-benchmark/bundler.d.ts declares its type.
      ignoreUnresolved: ['#benchmark-bundler'],
    },
    'apps/runtime-e2e': {
      entry: [
        // `runner.ts` spawns `run-arm.mts` behind the `hooks.mjs` loader, which registers `hook-impl.mjs`.
        'src/compute-baseline/harness/{run-arm.mts,hooks.mjs,hook-impl.mjs}',
        // Child processes the two-process tests start by path.
        'src/fixtures/{parameter-set-close,websocket-api-server}.ts',
        // Workers the benchmark scripts fork by path.
        'scripts/benchmark-bundler-{product-worker,worker}.mts',
      ],
    },
    'apps/ui': {
      entry: [
        'app/routes/**/*.tsx',
        'app/types/**/*.d.ts',
        'vite-environment.d.ts',
        'app/offline/offline-shell-env.d.ts',
        // Netlify bundles every edge function in this directory; `config` names its paths.
        'netlify/edge-functions/*.ts',
        // `apps/ui/project.json` runs every calibration script with a workspace-root path.
        'scripts/render-calibration/*.mts',
        // Module declaration for `svg-sprite`, used by scripts/generate-svg-sprite.mts.
        'scripts/svg-sprite.d.ts',
        // `build*` targets run it as a runtime cache input.
        'geospec-mt-assets-cache-key.ts',
        // Script of calibration-preview.html, served by vite.calibration.config.ts.
        'app/calibration-preview.tsx',
        // `tau-ui-source-alias` (vite.config.ts) swaps these in for their `#…` facades per build
        // target (cloud, self-host, desktop); knip only follows the facade import.
        'app/**/*.{cloud,self-host,desktop}.{ts,tsx}',
        // Vite alias replacement for `@resvg/resvg-js` in the browser bundle.
        'app/lib/browser-stubs/resvg-js.ts',
      ],
      ignore: ['public/**'],
      // The desktop and serve builds are separate React Router apps (`build:desktop`,
      // `build:serve`) whose route manifests point back into `app/routes`.
      'react-router': {
        config: ['react-router.config.ts', 'desktop/react-router.config.ts', 'serve/react-router.config.ts'],
      },
      vite: {
        config: ['vite.config.ts', 'desktop/vite.config.ts', 'serve/vite.config.ts'],
      },
      // React Router typegen writes `./+types/*` into the gitignored `.react-router/types`
      // (tsconfig `rootDirs`), which a fresh checkout does not have.
      ignoreUnresolved: [/^\.\/\+types\//u],
    },
    'apps/www': {
      // The static builder bundles browser entries by path; these CLIs run directly from Node.
      entry: [
        'src/client.mjs',
        'src/site.css',
        'scripts/{build,serve,browser-check,check-story,render-assets,optimize-assets,capture-metal-hero,export-story-assets}.mjs',
        'scripts/metal-hero-entry.mjs',
        'tests/*.test.mjs',
      ],
      project: ['src/**/*.{mjs,css}', 'scripts/**/*.{mjs,js}', 'tests/**/*.mjs'],
      ignore: ['public/**'],
    },
    'apps/docs': {
      entry: ['app/routes/**/*.{ts,tsx}', 'vite-environment.d.ts'],
      // Content-side modules are referenced from MDX (auto-type-table props,
      // worker examples) and server-compat is wired through a vitest alias —
      // neither is a reference knip can follow.
      ignore: ['content/**', 'app/lib/fumadocs/server-compat.ts'],
      // Kernel and runtime packages are imported by MDX code samples and by the
      // type generator behind auto-type-table.
      ignoreDependencies: ['@taucad/*'],
    },
    'examples/electron': {
      // electron-vite inputs (main, kernel host, preload) and the renderer's index.html script.
      entry: [
        'electron.vite.config.ts',
        'src/main/index.ts',
        'src/tau/kernel-host.ts',
        'src/preload/preload.ts',
        'src/renderer/main.tsx',
      ],
    },
    'libs/api-extractor': {
      // Generated declarations are catalog data read from disk by extraction tools.
      ignore: ['src/generated/**'],
    },
    'libs/oxlint': {
      // RuleTester inputs: the tests read and lint these files, nothing imports them.
      ignore: ['src/rules/fixtures/**'],
    },
    'libs/types': {
      // The `generate-project-manifest-schema` target runs it from the workspace root.
      entry: ['scripts/generate-project-manifest-schema.mts'],
    },
    'packages/agent-host': {
      // Vitest `typecheck.include`; knip's Vitest plugin reads only `test.include`.
      entry: ['src/**/*.test-d.ts'],
    },
    'packages/cli': {
      // `tau serve` resolves the pinned ACP adapters by name from the CLI's own location
      // (`externalAgents: { resolveFrom: import.meta.url }`, packages/host/src/acp/registry.ts).
      ignoreDependencies: ['@agentclientprotocol/claude-agent-acp', '@agentclientprotocol/codex-acp'],
    },
    'packages/filesystem': {
      // `authority-writer-lock.test.ts` forks these by path.
      entry: ['src/backend/node/*.fixture.ts'],
    },
    'packages/geospec': {
      entry: [
        // `test-m3-verdicts` runs both under `node --test`.
        'host-tests/{m2-browser,m3-corpus}/verdict-host.mjs',
        // `test-installed-vitest` runs these configs from the consumer that
        // `scripts:prepare-geospec-test-consumer` stages from this directory.
        'host-tests/{f1-public-a1,m3-corpus}/vitest.config.mjs',
      ],
      // CAD source snapshots the Replicad kernel evaluates (bench/measurements.test.ts opens one as a project).
      ignore: ['host-tests/tau-project-c2/fixtures/**'],
    },
    'packages/geospec-engine': {
      // Fixture model sources: the runtime CLI evaluates them to regenerate the committed
      // STEP corpus, and each fixture manifest records its script as provenance.
      ignore: ['fixtures/scripts/*/**'],
    },
    'packages/geospec-engine-native': {
      entry: [
        // Nx targets run these with workspace-root paths (`node`, `node --test`).
        'bench/run.ts',
        'bench/{lib,broad-harness,broad-fixtures,measurements}.test.ts',
        'bindings/node/current-profile.test.mjs',
        'bindings/browser-conformance/run-browser-conformance.ts',
        'scripts/{build-mixed-wasm,prepare-legacy-reference}.mts',
        'scripts/ci-artifacts{,.test}.mjs',
        // `run.ts` starts `worker.ts` by URL; run-browser-conformance serves `app/run.ts` as its page script.
        'bench/worker.ts',
        'bindings/browser-conformance/app/run.ts',
        // `trust/run.mjs` (the `./trust` export) spawns these by path.
        'trust/{canonicalize,evaluate-worker}.mjs',
      ],
      // CAD workspace the performance lab evaluates from `fixtures/performance-lab/manifest.json`.
      ignore: ['bench/fixtures/performance-lab/workspace/**'],
      // Both resolve through package.json `imports` into binding output that the build generates.
      ignoreUnresolved: ['#native-binding', '#mixed-wasm-binding'],
      // `build-node` runs `pnpm --dir packages/geospec-engine-native exec napi build`; knip attributes
      // that root-level command to the root workspace.
      ignoreDependencies: ['@napi-rs/cli'],
    },
    'packages/host': {
      // `runtime-child-render.integration.test.ts` spawns it by path.
      entry: ['src/fixtures/render-child-probe.ts'],
    },
    'packages/plugins/bambu': {
      // The `qualify-x1c` target runs it from the workspace root.
      entry: ['scripts/qualify-x1c.mts'],
      // Replicad model sources that `render-plates` exports through the Tau CLI.
      ignore: ['models/**'],
    },
    'packages/plugins/brep': {
      // Module declaration for `occt-import-js` and the Emscripten types it reads through `import('…')`.
      entry: ['src/types/{occt-import-js,emscripten}.d.ts'],
    },
    'packages/plugins/build123d': {
      // Nx targets run every script from the workspace root.
      entry: ['scripts/*.mts'],
    },
    'packages/plugins/image': {
      // copy-files-from-to.cjson (run by the copy-files-from-to Nx plugin) copies Geist's TTF.
      ignoreDependencies: ['geist'],
    },
    'packages/plugins/openrscad': {
      // The e2e global setup runs `vite build`/`vite preview` from `e2e/`, which loads this config.
      entry: ['e2e/vite.config.ts'],
    },
    'packages/plugins/picogk': {
      // Nx targets run every script from the workspace root.
      entry: ['scripts/*.mts'],
    },
    'packages/plugins/replicad': {
      // copy-files-from-to.cjson (run by the copy-files-from-to Nx plugin) copies Geist's TTF.
      ignoreDependencies: ['geist'],
    },
    'packages/react': {
      // Vitest `typecheck.include`; knip's Vitest plugin reads only `test.include`.
      entry: ['src/**/*.test-d.ts'],
    },
    'packages/warehouse': {
      // CAD programs and assertions are loaded from tau.json and GeoSpec manifests.
      // `warehouse:generate` copies each definition's `model.ts` into its generated parts.
      entry: ['parts/**/main.ts', 'parts/**/main.geospec.ts', 'definitions/**/{catalog,model}.ts', 'scripts/*.mts'],
    },
    'packages/ui': {
      // A design system publishes its whole surface; consumption by the apps in
      // this repo is not what makes a component reachable.
      entry: ['src/**/*.{ts,tsx}'],
    },
    scripts: {
      // `canvas-vite.config.ts` aliases and injects the canvas sources.
      entry: ['src/**/*.{ts,tsx,mts}', 'canvas/{api-guide.tsx,review-layer.ts,styles.css}'],
      // Fixture package that `check-registry-dependencies.test.ts` inspects on disk.
      ignore: ['src/fixtures/registry-gate-artifact/**'],
      // The canvas config requires a selected private artifact at execution time.
      // Its source remains an entry; static analysis must not start that config.
      vite: false,
    },
  },
};

export default config;
