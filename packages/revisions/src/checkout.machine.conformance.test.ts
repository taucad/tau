/*
 * Conformance of `checkout.machine` to `specs/checkout/CheckoutRequests.tla` (RM-A24, I24):
 * forward replay of the TLC-exported covering suite, the backward walk of every shortest path of
 * the harness through the spec graph, and the drift manifest (FM-R13).
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineAlphabet } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';

import { checkoutMachine } from '#checkout.machine.js';
import { actionOf, captureTreeAnswers, checkoutAdapter, checkoutPaths } from '#test/conformance/checkout-adapter.js';

const specs = path.resolve(import.meta.dirname, '../specs/checkout');
const graph = readSpecGraph(path.join(specs, 'CheckoutRequests/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'CheckoutRequests/suite.json'), 'utf8')) as CoveringSuite;

describe('checkout.machine conforms to CheckoutRequests.tla', () => {
  it('should replay the covering suite without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite);

    expect(behaviours).toHaveLength(24);
    expect(await replaySuite(behaviours, checkoutAdapter(checkoutMachine), actionOf)).toEqual([]);
  });

  it('should walk every shortest harness path through the spec graph without rejection', async () => {
    const paths = await checkoutPaths(checkoutMachine);

    expect(paths).toHaveLength(2175);
    expect(walkPaths(graph, paths).slice(0, 3)).toEqual([]);
    /* The D4 comparisons are answered, so `comparing` leaves on `onDone`, not only on a missing actor (GM.r1 L5). */
    expect(captureTreeAnswers.count).toBeGreaterThan(0);
  }, 120_000);

  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'CheckoutRequests/drift.json'), {
        alphabet: machineAlphabet([checkoutMachine]),
        tables: {},
        specs: hashFiles(specs, ['CheckoutRequests.tla']),
      }),
    ).toEqual([]);
  });
});
