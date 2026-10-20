# @taucad/geospec-engine

A compatibility package, removed once Tau's own `tau test` replaces it. Its `tau-geospec` bin is the
[`geospec`](../geospec) CLI with Tau's default exporter in every pool worker, so a Tau project's code models run with
no `geospec.config.*`.

The CLI, the Node worker pool and the engine selection now live in `geospec` (`geospec/cli`, `geospec/runner/node`);
see its README for the flags. Authored `*.geospec.ts` files never import this package.

## Install

```bash
npm install --save-dev geospec @taucad/geospec-engine
```

## Embedded runners

`createGeoSpecNativeNodePoolRunner` from `@taucad/geospec-engine/native-pool/node` is `geospec`'s
`createGeoSpecNodePoolRunner` with Tau's default exporter ahead of the project config's exporters:

```ts
import { createGeoSpecNativeNodePoolRunner } from '@taucad/geospec-engine/native-pool/node';
import process from 'node:process';

const runner = createGeoSpecNativeNodePoolRunner({
  projectPath: process.cwd(),
  workers: 1,
});

try {
  const result = await runner.run({ files: ['specs/bracket.geospec.ts'] });
  console.log(result);
} finally {
  await runner.close();
}
```

`@taucad/geospec-engine/node-filesystem` re-exports `createNodeVmFileSystem` from `geospec/runner/node`.

## License

**[Apache-2.0](./LICENSE)**. The engine may be used, modified, embedded, hosted, and redistributed, including in
commercial and competing products, subject to the Apache licence and notice requirements.

Running this engine puts no license obligation on your specs, your models, or your verdicts. See
[Licensing](../../docs/licensing/overview.md) for the repository-wide licensing policy.
