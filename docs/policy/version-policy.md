---
title: 'Version Policy'
description: 'Versioning, stability tiers, breaking change management, and developer experience for @taucad/* packages. SemVer, experimental/future-flag/stable tiers, deprecation protocol, codemods.'
status: active
created: '2026-03-10'
updated: '2026-08-23'
related:
  - docs/policy/release-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/public-surface-policy.md
---

# Version Policy

Internal reference for versioning, stability tiers, breaking change management, and developer experience across `@taucad/*` packages. Distilled from analysis of React Router, Vercel AI SDK, Stripe, Google Cloud, Prisma, Next.js, Terraform, AWS SDK v3, tRPC, and Effect-TS.

For release mechanics (build pipeline, npm publishing, provenance), see [Release Policy](release-policy.md). For API design standards, see [Library API Policy](library-api-policy.md).

## Rationale

Consistent versioning and stability tiers reduce upgrade fatigue and build consumer trust. The three-tier model (experimental, future flag, stable) enables gradual migration instead of big-bang upgrades. Deprecation protocols and codemods lower the real cost of adopting breaking changes.

## Design Goals

Five principles govern how Tau evolves its public API. Adapted from React Router's governance model and refined for a CAD runtime library.

1. **Simple Migration Paths.** Major version upgrades don't have to be painful. Breaking changes are implemented behind future flags. Deprecations are marked in code and documentation before removal. Console warnings nudge developers toward the changes they can make in advance.

2. **Regular Release Cadence.** At most one major release per year so developers can prepare in advance. Minor releases ship monthly. Patch releases ship as needed.

3. **Less is More.** Resist API surface growth. Prefer condensing existing APIs into fewer, more composable primitives over adding new entry points. Every public export is a maintenance commitment.

4. **Additive by Default.** New kernels, middleware, export formats, and options are additive and ship in minor releases. Existing consumers are never broken by the introduction of new capabilities.

5. **Lowest Common Layer.** Features are added at the lowest abstraction layer possible (protocol → transport → client) and leveraged by higher layers. This ensures the broadest range of consumers can benefit.

## Semantic Versioning

All `@taucad/*` packages follow [SemVer 2.0.0](https://semver.org/) with [semver-ts](https://www.semver-ts.org/) conformance for TypeScript types.

| Bump      | Trigger                                                                                                                        | Examples                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Major** | Breaking API changes, removal of deprecated features, minimum Node.js or TypeScript version bumps                              | Rename `createRuntimeClient` → `createClient`, drop Node 22, remove `v2_*` future flags |
| **Minor** | New features, new kernel/middleware additions, new export formats, stabilization of `unstable_*` APIs, deprecation annotations | Add `opencascade()` kernel, stabilize `unstable_streamingExport`, deprecate `onCleanup` |
| **Patch** | Bug fixes, performance improvements, dependency updates without API changes                                                    | Fix WASM init race condition, improve tessellation performance                          |

### Pre-1.0 Convention

While published packages are below `1.0.0`, minor versions may include breaking changes. The API is not considered stable until `1.0.0`; published beta changes are communicated in the release version plan/changelog. A contract that has never shipped may be replaced atomically across the repository without deprecation aliases, codemods, or a consumer migration guide. Do not create compatibility machinery for users who cannot exist; record the resulting API in the first applicable beta release note instead.

### TypeScript Version Support

Follows the **Simple Majors** policy from [semver-ts](https://www.semver-ts.org/):

- Dropping support for a TypeScript version is a **major** bump.
- Types are authored with `strict: true`.
- New minor versions never introduce new type errors for existing consumers ("no new red squiggles").
- Type-level tests (`expect-type`) run in CI to catch type regressions.

### Node.js Version Support

Tau supports **Active LTS** and the **latest minor of Maintenance LTS** at any given time. Dropped support for End of Life Node versions is done in a **minor** release with a call-out in the release notes. Minimum Node version is specified in `engines` in `package.json`.

When a major release aligns with an upcoming Node EOL date (within 3 months), the major release drops that Node version proactively rather than requiring a follow-up minor.

## Stability Tiers

Every public API, kernel, and feature carries one of three stability tiers. Adapted from Google Cloud's alpha/beta/GA model and Prisma's preview features system.

| Tier             | Prefix      | Stability                         | Breaking Changes              | Deprecation Notice                               |
| ---------------- | ----------- | --------------------------------- | ----------------------------- | ------------------------------------------------ |
| **Experimental** | `unstable_` | Unstable, opt-in                  | Any minor release             | None required                                    |
| **Future Flag**  | `v{N}_`     | Stabilized opt-in breaking change | Becomes default in next major | N/A (opt-in)                                     |
| **Stable (GA)**  | _(none)_    | Production-ready, full semver     | Major release only            | 180 days or one major cycle, whichever is longer |

### Experimental (`unstable_` prefix)

Experimental APIs use the `unstable_` prefix in both code and configuration. They can change or be removed in any minor release without the standard deprecation period. They are explicitly not recommended for production use.

```typescript
import { unstable_streamingExport } from '@taucad/runtime';
import { replicad } from '@taucad/replicad';

const runtime = defineRuntime({
  plugins: [replicad()],
});
const client = createRuntimeClient({
  transport: inProcessTransport({ runtime }),
  future: {
    unstable_parallelTessellation: true,
  },
});
```

**Rules** (adapted from React Router's governance stages and Vercel AI SDK's `experimental_` pattern):

- Experimental APIs ship in minor or patch releases.
- They are documented in the changelog with an `[UNSTABLE]` prefix.
- They do not count toward semver stability guarantees.
- When stabilized, the `unstable_` prefix is removed in a minor release. The old prefixed name is re-exported as a deprecated alias during a transition period, then produces a hard error in the next major.

**Stabilization with backward-compatible alias** (from Vercel AI SDK):

When an experimental API graduates to stable, provide a deprecation bridge rather than an immediate hard error. This is the AI SDK's pattern for `experimental_generateImage` → `generateImage`:

```typescript
import { streamingExport } from './streaming-export';

/**
 * @deprecated Use `streamingExport` instead.
 */
const unstable_streamingExport = streamingExport;
export { unstable_streamingExport };
```

The deprecated alias is kept for one major cycle, then removed. A codemod handles the mechanical rename (see [Automated Migration](#automated-migration-codemods)).

### Future Flags (`v{N}_` prefix)

Future flags are **stabilized breaking changes** that consumers opt into before the next major release. They allow gradual migration instead of big-bang upgrades.

```typescript
import { replicad } from '@taucad/replicad';

const runtime = defineRuntime({
  plugins: [replicad()],
});
const client = createRuntimeClient({
  transport: inProcessTransport({ runtime }),
  future: {
    v2_middlewareApi: true,
    v2_newTransportProtocol: true,
  },
});
```

**Lifecycle:**

1. Feature starts as `unstable_featureName` (experimental).
2. Once stable, renamed to `v{N}_featureName` in a minor release. The old `unstable_` name produces a hard error.
3. In the next major release, the flag becomes the default behavior and is removed from the `future` config. Passing the flag produces a warning that it is now the default.
4. In the major release after that, the warning is removed.

**Implementation pattern** (from React Router):

```typescript
type FutureConfig = {
  unstable_parallelTessellation?: boolean;
  v2_middlewareApi?: boolean;
  v2_newTransportProtocol?: boolean;
};

function resolveConfig(userConfig: Partial<FutureConfig>): FutureConfig {
  if (userConfig.unstable_middlewareApi !== undefined) {
    throw new Error(
      'The "future.unstable_middlewareApi" flag has been stabilized ' +
        'as "future.v2_middlewareApi". Please update your configuration.',
    );
  }

  return {
    unstable_parallelTessellation: userConfig.unstable_parallelTessellation ?? false,
    v2_middlewareApi: userConfig.v2_middlewareApi ?? false,
    v2_newTransportProtocol: userConfig.v2_newTransportProtocol ?? false,
  };
}
```

**Runtime checks:**

```typescript
if (config.future.v2_middlewareApi) {
  // New middleware behavior
} else {
  // Legacy behavior (removed in v2)
}
```

### Stable (GA)

Stable APIs have no prefix. They follow full semver: breaking changes only in major releases with the required deprecation period. Once an API is stable, consumers can depend on it for production use.

## Deprecation Protocol

Adapted from React Router's `warnOnce` pattern, Stripe's upgrade guides, and Google Cloud's deprecation timelines.

### Step 1: Annotate

Add `@deprecated` JSDoc with the removal version and the migration path. IDEs surface this immediately via strikethrough text.

```typescript
/**
 * @deprecated Use `onDispose` instead. Will be removed in v2.0.0.
 * @see https://docs.tau.new/migration/v2#ondispose
 */
onCleanup?(context: KernelContext): Promise<void>;
```

### Step 2: Warn at Runtime

Use `warnOnce` to emit a single console warning per deprecated API usage per session. Never spam the console.

```typescript
const warned = new Set<string>();

function warnOnce(condition: boolean, message: string): void {
  if (!condition && !warned.has(message)) {
    warned.add(message);
    console.warn(message);
  }
}

// Usage
warnOnce(
  !options.onCleanup,
  '[@taucad/runtime] "onCleanup" is deprecated and will be removed in v2.0.0. ' +
    'Use "onDispose" instead. See https://docs.tau.new/migration/v2#ondispose',
);
```

### Step 3: Document

Add the deprecation to a `DEPRECATIONS` section in the changelog and to the migration guide for the target major version. Include:

- What is deprecated
- What replaces it
- Code example of the migration
- Target removal version

### Step 4: Remove

Remove the deprecated API in the target major release. The major release's migration guide references the deprecation notice and provides a complete upgrade path.

### Deprecation Timelines

| Stability                 | Minimum Deprecation Period                               |
| ------------------------- | -------------------------------------------------------- |
| Stable (GA)               | 180 days or one major release cycle, whichever is longer |
| Future Flag (v{N}\_)      | Until the target major release ships                     |
| Experimental (unstable\_) | None required (may be removed in any minor)              |

## Internal / Unsafe Escape Hatches

APIs intended for framework-internal use or advanced escape hatches use specific conventions to signal their stability guarantees:

| Prefix                  | Audience                                   | Semver Coverage                  |
| ----------------------- | ------------------------------------------ | -------------------------------- |
| `@internal` JSDoc       | Framework code only, never consumer-facing | None — may change in any release |
| `UNSAFE_` export prefix | Advanced consumers who accept the risk     | None — may change in any release |
| `-internals` subpath    | Framework-level integration code           | None — may change in any release |

From React Router's `UNSAFE_` pattern:

```typescript
// We consider these exports an implementation detail and do not guarantee
// against any breaking changes, regardless of the semver release. Use with
// extreme caution and only if you understand the consequences.
export { createMemoryHistory as UNSAFE_createMemoryHistory } from './history';
```

Tau uses `@internal` JSDoc for non-exported internals and a `-internals` subpath export (if needed) for cross-package framework code. `@internal` is never the sole boundary for a declaration reachable from a public export. The `UNSAFE_` prefix is reserved for exported escape hatches that consumers may need but that carry no stability guarantee. See [Public Surface Policy](public-surface-policy.md).

## Pre-Release Strategy

### Dist Tags

Pre-release versions are published under npm dist-tags so that `npm install @taucad/runtime` always resolves to the latest stable version.

| Tag      | Purpose                                 | Version Format  |
| -------- | --------------------------------------- | --------------- |
| `latest` | Stable releases (default)               | `X.Y.Z`         |
| `next`   | Release candidates, pre-release testing | `X.Y.Z-rc.N`    |
| `beta`   | Beta releases                           | `X.Y.Z-beta.N`  |
| `alpha`  | Alpha releases                          | `X.Y.Z-alpha.N` |

### Graduation Path to 1.0

1. **`0.x.y` (current):** API is in active development. Minor versions may contain breaking changes. Focus on API surface discovery and validation.
2. **`1.0.0-alpha.N`:** API surface is locked. Breaking changes are still permitted but discouraged. Published under `--tag alpha`.
3. **`1.0.0-beta.N`:** API is feature-complete. Only bug fixes and polish. Breaking changes require strong justification. Published under `--tag beta`.
4. **`1.0.0-rc.N`:** Release candidate. No API changes unless critical bugs are found. Published under `--tag next`.
5. **`1.0.0`:** Stable release. Full semver guarantees apply from this point forward.

## Support Lifecycle

Adapted from Google's OSS library policy and AWS SDK's maintenance windows.

| Version                      | Support Level                                                            |
| ---------------------------- | ------------------------------------------------------------------------ |
| Latest major                 | Full support: new features, bug fixes, security patches                  |
| Previous major (N-1)         | 12 months of bug fixes and security patches after the new major releases |
| Older majors (N-2 and below) | Unsupported, available on npm for pinning                                |

The 12-month support window for the previous major starts when the new major is published to the `latest` npm tag — not when the first alpha or beta is released.

## Breaking Change Checklist

Before introducing a breaking change:

1. **Is there an additive alternative?** Can the new behavior be introduced alongside the old, without breaking existing consumers?
2. **Can it be a future flag?** If the change can be opt-in, ship it as a `v{N}_` future flag first.
3. **Is there a codemod?** For mechanical renames, import path changes, and option restructuring, provide an automated transform.
4. **Is the migration guide written?** Every breaking change must have a documented migration path before shipping.
5. **Is the deprecation period met?** Stable APIs must have been deprecated for at least 180 days or one major cycle.

### What Constitutes a Breaking Change

Adapted from Terraform's concrete definitions and semver-ts:

- Removing or renaming a public export
- Changing the type signature of a public function (stricter inputs or narrower outputs)
- Changing default option values that affect behavior
- Removing support for a Node.js or TypeScript version
- Changing the structure of emitted events or response objects
- Renaming or removing `package.json` export subpaths
- Changing the serialization format of messages crossing a `postMessage` boundary

### What is NOT a Breaking Change

Adapted from Stripe's "safe changes" definition:

- Adding new optional fields to option objects
- Adding new properties to response/result objects
- Adding new event types
- Adding new export subpaths after satisfying Public Surface Policy's admission gate
- Adding new kernels, middleware, or bundler plugins
- Widening a type (accepting more inputs)
- Performance improvements
- New deprecation warnings

## Automated Migration (Codemods)

For mechanical breaking changes (renames, import path restructuring, option object changes), provide automated codemods. Adapted from Next.js's `@next/codemod` and Vercel AI SDK's `@ai-sdk/codemod`.

```bash
npx @taucad/codemod upgrade          # detect version, run relevant transforms
npx @taucad/codemod upgrade --dry    # preview changes without applying
npx @taucad/codemod upgrade --print  # print transforms to stdout
npx @taucad/codemod v2               # run all v2 codemods
npx @taucad/codemod v2/rename-unstable-streaming-export src/  # run a specific codemod
```

### Codemod Coverage

The AI SDK maintains per-major-version codemod sets with explicit mappings:

```typescript
const EXPERIMENTAL_MAPPINGS = {
  unstable_streamingExport: 'streamingExport',
  unstable_parallelTessellation: 'parallelTessellation',
} as const;
```

Every `unstable_` → stable rename and every breaking API change should have a corresponding codemod transform. Even simple renames are worth a codemod — it signals care for developer experience and reduces the real cost of upgrading.

## Release Communication

### Changelog

Changelogs are auto-generated from Nx Release version plans (see [Release Policy](release-policy.md)). Entries use these section conventions:

- **Breaking Changes** — requires consumer action
- **Features** — new capabilities, no action required
- **Bug Fixes** — corrections, no action required
- **Deprecations** — upcoming removals, action recommended
- **[UNSTABLE]** prefix — experimental feature changes, no stability guarantee

### Migration Guides

Every major release has a dedicated migration guide in the docs site covering:

1. A summary of all breaking changes with before/after code examples
2. The recommended upgrade order for multi-package consumers
3. Links to relevant codemods
4. A timeline of when deprecated features were announced

### Pre-Release Testing via `@next` Tag

Before every major release, publish release candidates under the `next` npm tag for community testing:

```bash
pnpm install @taucad/runtime@next
```

This gives early adopters a low-risk path to validate their applications against upcoming changes and report issues before the stable release.

## Specification Versioning

Plugin contracts (kernel definitions, middleware interfaces, provider specifications) carry a `specificationVersion` field that evolves independently of the package version. Adapted from the Vercel AI SDK's `LanguageModelV3` / `ProviderV3` pattern.

```typescript
type KernelDefinition = {
  readonly specificationVersion: 'v1';
  name: string;
  onInitialize(input: InitializeInput, runtime: KernelRuntime): Promise<KernelContext>;
  onCreateGeometry(input: GeometryInput, runtime: KernelRuntime, context: KernelContext): Promise<GeometryResult>;
  onDispose?(context: KernelContext): Promise<void>;
};
```

### Why Separate from Package Version

The kernel plugin contract is a protocol — it defines how the framework communicates with kernel implementations. Package version `1.5.0` may still use specification version `v1`. When the protocol itself needs a breaking change, the specification version bumps (e.g., `v2`), and the framework can support multiple specification versions simultaneously during migration.

This is the same strategy the AI SDK uses: `LanguageModelV3` coexists with older spec versions while providers migrate. The runtime inspects `specificationVersion` and dispatches accordingly:

```typescript
function executeKernel(definition: KernelDefinition) {
  switch (definition.specificationVersion) {
    case 'v1':
      return executeV1(definition);
    default:
      throw new Error(`Unsupported kernel specification version: ${definition.specificationVersion}`);
  }
}
```

### Rules

- Specification version changes are **independent** of package semver.
- Adding a new specification version is a **minor** package change (additive).
- Removing support for an old specification version is a **major** package change (breaking).
- The specification version is a simple string (`'v1'`, `'v2'`), not a semver range.

## Decision Log

| Date    | Decision                                                   | Rationale                                                                                            |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-03 | Adopt future flags pattern (React Router model)            | Enables gradual migration; breaking changes are opt-in before becoming default                       |
| 2026-03 | Three stability tiers: experimental / future flag / stable | Clear expectations per feature; adapted from Google Cloud and Prisma                                 |
| 2026-03 | 180-day minimum deprecation period for stable APIs         | Balances iteration speed with consumer trust; aligned with Google Cloud GA policy                    |
| 2026-03 | At most one major release per year                         | Terraform-inspired discipline; prevents upgrade fatigue                                              |
| 2026-03 | 12-month N-1 support window                                | Google OSS standard; gives consumers a clear migration runway                                        |
| 2026-03 | `warnOnce` pattern for deprecation warnings                | React Router pattern; single warning per session prevents console spam                               |
| 2026-03 | semver-ts conformance for TypeScript types                 | Industry standard for TypeScript libraries; "no new red squiggles" on minor upgrades                 |
| 2026-03 | `@next` npm tag for pre-release testing                    | tRPC-inspired; low-friction validation path for early adopters                                       |
| 2026-03 | Deprecated alias bridge for experimental API graduation    | Vercel AI SDK pattern; re-export old name with `@deprecated` instead of hard error during transition |
| 2026-03 | Per-major-version codemod sets                             | Vercel AI SDK + Next.js pattern; `@taucad/codemod v2/rename-x` for targeted transforms               |
| 2026-03 | Specification versioning for plugin contracts              | Vercel AI SDK pattern; protocol evolves independently of package version                             |
| 2026-03 | Symbol-based error markers for cross-package type checks   | Vercel AI SDK pattern; survives bundler transformations and multiple package instances               |

## References

- [React Router Governance](https://github.com/remix-run/react-router/blob/main/GOVERNANCE.md) — Design goals, steering committee, API development stages
- [React Router v8 Discussion](https://github.com/remix-run/react-router/discussions/14468) — Future flags, deprecation strategy, Node.js support
- [React Router API Development Strategy](https://reactrouter.com/community/api-development-strategy) — `unstable_` and future flag lifecycle
- [Vercel AI SDK](https://github.com/vercel/ai) — Experimental API lifecycle, codemods, provider/middleware architecture, specification versioning, error taxonomy
- [Stripe API Versioning](https://stripe.com/docs/upgrades) — Date-based pinned versions, safe changes
- [Google Cloud API Versioning](https://cloud.google.com/apis/design/versioning) — Alpha/beta/GA tiers, deprecation timelines
- [Prisma Preview Features](https://www.prisma.io/docs/orm/reference/preview-features) — Opt-in experimental feature flags
- [Next.js Codemods](https://nextjs.org/docs/app/building-your-application/upgrading/codemods) — Automated migration transforms
- [Terraform Provider Versioning](https://developer.hashicorp.com/terraform/plugin/best-practices/versioning) — Yearly major cadence, concrete breaking change definitions
- [semver-ts](https://www.semver-ts.org/) — Semantic versioning for TypeScript types
- [AWS SDK v3 Migration](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrating.html) — Modular architecture, middleware extensibility
