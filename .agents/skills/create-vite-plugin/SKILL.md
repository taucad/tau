---
name: create-vite-plugin
description: Create a new Vite plugin in the @taucad/vite package following project conventions and Vite 8 best practices. Use when adding a Vite plugin, creating dev server middleware, implementing build transforms, or extending Vite configuration for the Tau monorepo.
---

# Create Vite Plugin

Add a new Vite plugin to `libs/vite/` (`@taucad/vite`) following project conventions and Vite 8 best practices.

## Definition of Done

1. Plugin file at `libs/vite/src/<name>.vite-plugin.ts`
2. Subpath export added to `libs/vite/package.json`
3. Plugin wired into consumer `vite.config.ts` (typically `apps/ui/vite.config.ts`)
4. Lint passes: `pnpm nx lint vite`

## 1) Create the Plugin File

**File:** `libs/vite/src/<name>.vite-plugin.ts`

Convention: kebab-case name, `.vite-plugin.ts` suffix. Export a named function (not default) that returns `Plugin`.

```typescript
import type { Plugin } from 'vite';

/**
 * JSDoc describing what the plugin does and why it exists.
 */
export function myPluginName(): Plugin {
  return {
    name: 'vite:<name>',

    config(config, env) {
      // Return partial config to deep-merge (recommended over mutation)
      return {
        /* ... */
      };
    },
  };
}
```

### Plugin naming rules

- `name` field: prefix with `vite:` (e.g. `vite:optimize-deps-from-cache`)
- Export name: camelCase matching the plugin purpose (e.g. `optimizeDepsFromCache`)
- File name: kebab-case + `.vite-plugin.ts` (e.g. `optimize-deps-from-cache.vite-plugin.ts`)

### When returning multiple plugins

Export a function returning `Plugin[]` and spread in the consumer:

```typescript
export function myPlugins(): Plugin[] {
  return [pluginA(), pluginB()];
}
// Consumer: ...myPlugins()
```

See `ts-module-url.vite-plugin.ts` for a real example.

## 2) Add Subpath Export

**File:** `libs/vite/package.json`

Add a new entry to `exports` — all three conditions point to the `.ts` source file (no build step):

```json
"./<name>": {
  "types": "./src/<name>.vite-plugin.ts",
  "import": "./src/<name>.vite-plugin.ts",
  "default": "./src/<name>.vite-plugin.ts"
}
```

## 3) Wire into Consumer

**File:** `apps/ui/vite.config.ts` (or whichever app uses it)

```typescript
import { myPluginName } from '@taucad/vite/<name>';

// In the plugins array:
plugins: [
  myPluginName(),
  // ...
],
```

## Existing Plugins Reference

| Plugin                     | Hook(s)                                          | Purpose                                     |
| -------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `cross-origin-isolation`   | `configureServer`, `configurePreviewServer`      | COOP/COEP headers for SharedArrayBuffer     |
| `ts-module-url`            | `resolveId`, `load` (build); `transform` (serve) | Resolve `.ts` in `new URL()`                |
| `base64-loader`            | `transform`                                      | Base64-encode `?base64` imports             |
| `optimize-deps-from-cache` | `config`                                         | Pre-inject deps from previous session cache |

## Vite 8 Best Practices

### Hook selection guide

| Hook                      | When to use                                            | Kind              |
| ------------------------- | ------------------------------------------------------ | ----------------- |
| `config`                  | Merge config before resolution (return partial config) | async, sequential |
| `configEnvironment`       | Configure a specific environment (client/ssr/custom)   | async, sequential |
| `configResolved`          | Read final config, patch other plugins                 | async, parallel   |
| `configureServer`         | Dev server middleware, store server ref                | async, sequential |
| `configurePreviewServer`  | Preview server middleware                              | async, sequential |
| `resolveId`               | Custom module resolution, virtual modules              | async, first      |
| `load`                    | Virtual module content, custom file loading            | async, first      |
| `transform`               | Transform source code before bundling                  | async, sequential |
| `hotUpdate`               | Custom HMR handling (replaces `handleHotUpdate`)       | async, sequential |
| `buildStart` / `buildEnd` | Per-build lifecycle (client-only in dev by default)    | async, parallel   |

### Prefer returning partial config over mutation

```typescript
// Good: return partial config (deep-merged automatically)
config() {
  return { resolve: { alias: { foo: 'bar' } } };
}

// Avoid: direct mutation (only when merging can't achieve the result)
config(config) {
  config.root = 'foo';
}
```

### Use `enforce` for ordering

```typescript
return {
  name: 'vite:<name>',
  enforce: 'pre', // run before core plugins (alias resolution phase)
  // enforce: 'post' — run after core plugins (minify/manifest phase)
};
```

Plugin execution order: `enforce: 'pre'` → core plugins → no enforce → `enforce: 'post'`.

### Use `apply` for conditional activation

```typescript
return {
  name: 'vite:<name>',
  apply: 'serve', // only during dev (or 'build' for build-only)
};

// Or use a function for complex conditions:
return {
  apply: (config, { command }) => command === 'build' && !config.build.ssr,
};
```

### Hook filters for `transform`/`resolveId`/`load` (Vite 6.3+ / Rolldown)

Reduces Rust-JS boundary overhead by filtering before the hook is called:

```typescript
transform: {
  filter: { id: /\.custom$/ },
  handler(code, id) {
    if (!/\.custom$/.test(id)) return null; // backward compat guard
    return { code: transformCode(code), map: null };
  },
},
```

### Environment API (RC in Vite 6+)

Access environment-specific config via `this.environment` instead of the deprecated `ssr` boolean:

```typescript
transform(code, id) {
  const conditions = this.environment.config.resolve.conditions;
  const envName = this.environment.name; // 'client', 'ssr', or custom
}
```

Use `configEnvironment` to configure specific environments:

```typescript
configEnvironment(name, options) {
  if (name === 'ssr') {
    return { resolve: { conditions: ['workerd'] } };
  }
}
```

### Per-environment state

Key plugin state by `this.environment` using a `Map<Environment, T>`:

```typescript
function myPlugin(): Plugin {
  const state = new Map<Environment, { count: number }>();
  return {
    name: 'vite:<name>',
    perEnvironmentStartEndDuringDev: true,
    buildStart() {
      state.set(this.environment, { count: 0 });
    },
    transform() {
      state.get(this.environment)!.count++;
    },
  };
}
```

### Virtual modules

Prefix resolved IDs with `\0` to prevent other plugins from processing them:

```typescript
const virtualId = 'virtual:my-module';
const resolvedId = '\0' + virtualId;

return {
  resolveId(id) {
    if (id === virtualId) return resolvedId;
  },
  load(id) {
    if (id === resolvedId) return 'export const x = 1';
  },
};
```

### Rolldown-specific (Vite 8)

When transforming modules to JavaScript, specify `moduleType`:

```typescript
transform(code, id) {
  return { code: compiled, map: null, moduleType: 'js' };
}
```

`optimizeDeps.esbuildOptions` is deprecated — use `optimizeDeps.rolldownOptions` for dep optimization config.

## Common Patterns

### Dev-only plugin

Guard with `env.command` in `config` hook:

```typescript
config(config, env) {
  if (env.command !== 'serve') return;
}
```

### Reading/patching other plugins

Use `configResolved` to access the final plugin array:

```typescript
configResolved(config) {
  for (const plugin of config.plugins) {
    if (plugin.name === 'target-plugin') {
      // patch plugin properties
    }
  }
}
```

### Dev server middleware

Use `configureServer`. Return a function for post-middleware (after Vite internals):

```typescript
configureServer(server) {
  // Pre-middleware (runs before Vite internals)
  server.middlewares.use((req, res, next) => {
    res.setHeader('X-Custom', 'value');
    next();
  });

  // Return function for post-middleware (runs after Vite internals)
  return () => {
    server.middlewares.use((req, res, next) => { /* ... */ });
  };
}
```

### Storing server reference for other hooks

```typescript
function myPlugin(): Plugin {
  let server: ViteDevServer;
  return {
    name: 'vite:<name>',
    configureServer(_server) {
      server = _server;
    },
    transform(code, id) {
      if (server) {
        /* use server.moduleGraph, server.ws, etc. */
      }
    },
  };
}
```

### Path normalization

Use `normalizePath` from vite when comparing resolved paths:

```typescript
import { normalizePath } from 'vite';
// normalizePath('foo\\bar') → 'foo/bar'
```
