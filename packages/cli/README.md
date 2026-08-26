# @taucad/cli

CLI for `@taucad/runtime`.

## Export

Export a CAD source file to a target format:

```bash
taucad export model.ts --ext=glb
taucad export model.ts --ext=stl --export-options='{"binary":true}'
taucad export model.ts --ext=webp --export-options='{"width":1024,"height":576}'
taucad export model.ts --ext=webp --export-options='{"width":1024,"height":576,"quality":0.9}'
taucad export model.ts --ext=glb --content='{"includeEdges":true}'
```

WebP export is lossless when `quality` is omitted or set to `1`; values below `1` request lossy output.

## Plugins

The CLI ships every first-party plugin except Zoo, which needs credential configuration for a
headless export. Add Zoo or any third-party plugin with repeatable `--plugin`, resolved from the
invoking project:

```bash
pnpm add @example/tau-plugin
taucad export model.custom --ext=glb --plugin @example/tau-plugin
```

`--plugin` invokes the package's named `plugin` export with no options. A package that duplicates
a built-in is rejected; novel plugins are appended after the built-ins.

Use `--config` when a plugin needs options or must replace a built-in. The module exports already
invoked plugin instances:

```javascript
// taucad.config.mjs
import { replicad } from '@taucad/replicad';

/** @type {import('@taucad/cli').CliConfig['plugins']} */
export const plugins = [replicad({ kernels: { default: { ocTracing: 'off' } } })];
```

```bash
taucad export model.ts --ext=glb --config ./taucad.config.mjs
```

Configured plugins replace matching built-ins in place and append otherwise, preserving kernel
precedence. For installed packages, the CLI warns when `peerDependencies['@taucad/runtime']`
excludes its bundled runtime; path-loaded plugins without a resolvable manifest skip that check.
Which extensions and export routes exist remains owned by the plugin packages.

`--params`, `--export-options`, and `--content` accept JSON objects. Export-option and content keys depend on the route selected for the input source and target extension; unsupported keys and values are reported by the runtime.
