/**
 * Census and contract closure (spec Section 5.9, REQ-V8R2-100..104).
 *
 * REQ-100 is asserted in BOTH directions: every T-CENSUS name present
 * (STEP product structure + mesh occurrences) and zero unlisted occurrences
 * (catch-all occurrence count = 650 exactly). The v1 vacuous fastener filter
 * and orphan allowlist do not exist here; the process-only closure REQs run
 * as pure-TS suite lints over the contract data (they pass without a model
 * — that is correct and honest).
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertEveryOccurrenceBound,
  assertFitTablesLoadBearing,
  assertProcessOnlyRegistered,
  assertSingleAuthoritativeRows,
  censusBySubsystem,
  expectedOccurrenceNames,
  expectedOccurrenceTotal,
  expectedSubsystemCounts,
  mirroredOccurrenceNames,
  testExports,
  tolerances,
} from '../spec/requirements.js';

const loadAssemblyStep = async () =>
  loadModel({ file: testExports.assembly, format: 'step', mesh: false });

const loadAssemblyMesh = async () =>
  loadModel({
    file: testExports.assembly,
    format: 'glb',
    meshLinearTolerance: 0.1,
    meshAngularToleranceDegrees: 30,
  });

const loadPartStep = async (file: string) =>
  loadModel({ file, format: 'step', mesh: false });

describe('V8R2 census and contract closure', () => {
  it('REQ-V8R2-100 (suite lint): T-CENSUS transcription matches the Section 4 roll-up exactly', () => {
    const names = expectedOccurrenceNames();
    if (
      names.length !== expectedOccurrenceTotal ||
      new Set(names).size !== expectedOccurrenceTotal
    ) {
      throw new Error(
        `Census must list exactly ${expectedOccurrenceTotal} unique names, got ${names.length}.`,
      );
    }
    for (const [subsystem, list] of Object.entries(censusBySubsystem)) {
      const expected =
        expectedSubsystemCounts[
          subsystem as keyof typeof expectedSubsystemCounts
        ];
      if (list.length !== expected) {
        throw new Error(
          `Subsystem ${subsystem} lists ${list.length} occurrences, spec says ${expected}.`,
        );
      }
    }
    for (const mirrored of mirroredOccurrenceNames) {
      if (!names.includes(mirrored)) {
        throw new Error(
          `Mirrored occurrence ${mirrored} missing from the census.`,
        );
      }
    }
  });

  it('REQ-V8R2-100: STEP product structure carries all 650 census names', async () => {
    const model = await loadAssemblyStep();
    expectGeo(model).toHaveProductStructure({
      names: expectedOccurrenceNames(),
      count: { greaterThanOrEqual: expectedOccurrenceTotal },
    });
  });

  it('REQ-V8R2-100: mesh occurrence inventory equals T-CENSUS in both directions', async () => {
    const model = await loadAssemblyMesh();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        ...expectedOccurrenceNames().map((name) => ({ name, count: 1 })),
        // Catch-all: zero unlisted occurrences — exactly 650 named nodes.
        { name: /^./, count: expectedOccurrenceTotal },
      ],
    });
  });

  it('REQ-V8R2-103: the single-bank head carries exact feature counts (zero dead rows)', async () => {
    const head = await loadPartStep(testExports.cylinderHead);
    expectGeo(head).toHaveCircularHolePattern({
      count: 10,
      holeDiameter: 12.5,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 20,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 12.97,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 52.89,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 41.89,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-101 (process-only suite lint): every occurrence is bound by >= 1 joint row; no orphan allowlist exists', () => {
    assertEveryOccurrenceBound();
  });

  it('REQ-V8R2-102 (process-only suite lint): one authoritative row per interface pair, no permissive-band duplicates', () => {
    assertSingleAuthoritativeRows();
  });

  it('REQ-V8R2-104 (process-only suite lint): every T-FITS row is load-bearing in the contract', () => {
    assertFitTablesLoadBearing();
  });

  it('REQ-V8R2-101/102/104 (registry): census process-only entries are registered', () => {
    assertProcessOnlyRegistered('census', [
      'REQ-V8R2-101',
      'REQ-V8R2-102',
      'REQ-V8R2-104',
    ]);
  });
});
