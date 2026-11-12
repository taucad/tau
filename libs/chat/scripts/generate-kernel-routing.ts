#!/usr/bin/env node
/**
 * Write the kernel routing generator's static surfaces into their generated regions (automatic kernel selection
 * blueprint D4, AKS-2): the plugin `tau` skill's Kernels section, the `llms.md` "Which kernel" digest and the ACP digest
 * module the host bundles. Run it after
 * changing the catalog's routing facets or the routing rules and zones; `kernel-routing-surfaces.test.ts` fails while
 * a region is stale.
 *
 * Usage: pnpm nx run chat:generate-kernel-routing
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  kernelRoutingDigestModulePath,
  kernelRoutingRegions,
  renderKernelRoutingDigestModule,
  writeGeneratedRegion,
} from '#prompts/kernel-routing-surfaces.js';

const root = resolve(import.meta.dirname, '../../..');

for (const { path, region, render } of kernelRoutingRegions) {
  const file = resolve(root, path);
  writeFileSync(file, writeGeneratedRegion(readFileSync(file, 'utf8'), region, render()));
  process.stdout.write(`Wrote the ${region} region of ${path}\n`);
}

writeFileSync(resolve(root, kernelRoutingDigestModulePath), renderKernelRoutingDigestModule());
process.stdout.write(`Wrote ${kernelRoutingDigestModulePath}\n`);
