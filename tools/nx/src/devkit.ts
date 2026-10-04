/**
 * `@nx/devkit`, loaded through `require`. The tsdown configs that import this package are
 * loaded with Node's no-cache module hooks, and on Node before 24.11.1 an ESM import of a
 * CommonJS package under those hooks throws in the CJS translator. The GeoSpec CI lanes pin
 * Node 24.10.0, so a static `import` from `@nx/devkit` breaks every such build there.
 */
import { createRequire } from 'node:module';
import type * as Devkit from '@nx/devkit';

const require = createRequire(import.meta.url);

export const { createProjectGraphAsync, readCachedProjectGraph, workspaceRoot } =
  require('@nx/devkit') as typeof Devkit;
