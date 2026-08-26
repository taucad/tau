/**
 * Mechanical contract for v8-engine-rev2 — canonical entry.
 *
 * Source of truth: docs/research/v8-engine-rev2-sysml2-specification.md.
 * Every number is a verbatim transcription; the census (Section 4), fits
 * (Section 2.2), and deferral registry (Sections 1.3/6) live in sibling
 * modules re-exported here. GeoSpec suites import ONLY from this module.
 */
import type { GeoSpecSpatialRelationshipExpectation } from 'geospec';
import { motionContractRows } from './contract-motion.js';
import { structureContractRows } from './contract-structure.js';
import { expectedOccurrenceNames } from './census.js';
import { gasketBands, pressFits, runningFits } from './fits.js';
import {
  frontierDeferrals,
  processOnlyRequirements,
  verifyTodayRequirements,
} from './deferrals.js';
import type { ContractRow, ContractSelector } from './contract-base.js';

export * from './census.js';
export * from './contract-base.js';
export * from './deferrals.js';
export * from './fits.js';

/**
 * Canonical future export paths the follow-up model must produce (the
 * README naming table is the handshake).
 */
export const testExports = {
  /** Full 650-occurrence assembly (STEP + GLB evidence). */
  assembly: 'test-exports/assembly.ts',
  block: 'test-exports/block.ts',
  cylinderHead: 'test-exports/cylinder-head.ts',
  headGasket: 'test-exports/head-gasket.ts',
  exhaustHeader: 'test-exports/exhaust-header.ts',
  exhaustGasket: 'test-exports/exhaust-gasket.ts',
  crankshaft: 'test-exports/crankshaft.ts',
  piston: 'test-exports/piston.ts',
  connectingRod: 'test-exports/connecting-rod.ts',
  camshaft: 'test-exports/camshaft.ts',
  frontCover: 'test-exports/front-cover.ts',
} as const;

/** One canonical cache key for every full-assembly STEP proof. */
export const assemblyStepLoadOptions = {
  file: testExports.assembly,
  format: 'step',
  mesh: false,
} as const;

const gasketBandLookup = (band: string): { min: number; max: number } => {
  const row = gasketBands.find((candidate) => candidate.gasket === band);
  if (!row) {
    throw new Error(`Unknown T-FITS-GASKET row ${band}`);
  }
  return { min: row.min, max: row.max };
};

let cachedContract: ContractRow[] | undefined;

/** The full rev2 mechanical contract (all verify-today relationship rows). */
export const mechanicalContract = (): ContractRow[] => {
  cachedContract ??= [
    ...structureContractRows(gasketBandLookup),
    ...motionContractRows(),
  ];
  return cachedContract;
};

/** Rows owned by or also verifying the given REQ id. Throws when empty. */
export const contractRowsForRequirement = (
  requirementId: string,
): ContractRow[] => {
  const rows = mechanicalContract().filter(
    (row) =>
      row.requirementId === requirementId ||
      (row.alsoVerifies ?? []).includes(requirementId),
  );
  if (rows.length === 0) {
    throw new Error(
      `No contract rows registered for ${requirementId} — transcription gap.`,
    );
  }
  return rows;
};

/** Matcher-ready relationships for a REQ (contract fields stripped). */
export const relationshipsForRequirement = (
  requirementId: string,
): GeoSpecSpatialRelationshipExpectation[] =>
  contractRowsForRequirement(requirementId).map(
    ({ requirementId: _requirement, alsoVerifies: _also, ...relationship }) =>
      relationship,
  );

/** Occurrence names bound by at least one contract selector. */
export const contractBoundOccurrences = (
  rows: readonly ContractRow[],
): Set<string> => {
  const bound = new Set<string>();
  for (const row of rows) {
    for (const selector of [row.subject, row.target]) {
      bound.add(selector.kind === 'occurrence' ? selector.name : selector.of);
    }
  }
  return bound;
};

const selectorKey = (selector: ContractSelector): string =>
  selector.kind === 'occurrence'
    ? `occ:${selector.name}`
    : `${selector.kind}:${selector.of}#${selector.name}`;

/**
 * REQ-V8R2-102 suite lint: exactly one authoritative row per
 * (kind, interface pair); superseded permissive bands are prohibited by
 * construction because duplicates throw here.
 */
export const assertSingleAuthoritativeRows = (): void => {
  const seen = new Map<string, string>();
  for (const row of mechanicalContract()) {
    const pair = [selectorKey(row.subject), selectorKey(row.target)]
      .sort()
      .join(' <> ');
    const key = `${row.kind} | ${pair}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Duplicate authoritative rows for ${key}: "${existing}" and "${row.id}"`,
      );
    }
    seen.set(key, row.id);
  }
  const ids = new Set<string>();
  for (const row of mechanicalContract()) {
    if (ids.has(row.id)) {
      throw new Error(`Duplicate contract row id: ${row.id}`);
    }
    ids.add(row.id);
  }
};

/**
 * REQ-V8R2-065 suite lint: the micro-standoff regime is abolished in the
 * contract itself — every contact row asserts gap <= 0.001.
 */
export const assertContactRowsExact = (): void => {
  const offenders = mechanicalContract().filter(
    (row) =>
      row.kind === 'contact' &&
      (row.tolerance === undefined || row.tolerance > 0.001),
  );
  if (offenders.length > 0) {
    throw new Error(
      `Contact rows with permissive tolerance (> 0.001): ${offenders.map((row) => row.id).join('; ')}`,
    );
  }
};

/**
 * REQ-V8R2-101 suite lint: every census occurrence participates in >= 1
 * joint row; there is no orphan allowlist in rev2.
 */
export const assertEveryOccurrenceBound = (): void => {
  const bound = contractBoundOccurrences(mechanicalContract());
  const orphans = expectedOccurrenceNames().filter((name) => !bound.has(name));
  if (orphans.length > 0) {
    throw new Error(
      `Occurrences without a contract row (REQ-V8R2-101): ${orphans.join(', ')}`,
    );
  }
};

/**
 * REQ-V8R2-104 suite lint: the fit tables are load-bearing — every
 * T-FITS-RUN row (except the frontier-gated F28) and every T-FITS-PRESS row
 * is consumed by at least one contract row reason; F28 is consumed by the
 * REQ-053 deferral criterion.
 */
export const assertFitTablesLoadBearing = (): void => {
  const reasons = mechanicalContract()
    .map((row) => row.reason ?? '')
    .join('\n');
  const deadRunning = runningFits.filter(
    (fit) => !fit.frontierGated && !reasons.includes(`${fit.id} `),
  );
  const deadPress = pressFits.filter((fit) => !reasons.includes(`${fit.id} `));
  if (deadRunning.length > 0 || deadPress.length > 0) {
    throw new Error(
      `Dead fit-table rows (REQ-V8R2-104): ${[...deadRunning, ...deadPress].map((fit) => fit.id).join(', ')}`,
    );
  }
  const frontierCriteria = frontierDeferrals
    .map((entry) => entry.criterion)
    .join('\n');
  const gatedRows = runningFits.filter((fit) => fit.frontierGated);
  for (const fit of gatedRows) {
    if (!frontierCriteria.includes(fit.id)) {
      throw new Error(
        `Frontier-gated fit ${fit.id} is not cited by any deferral criterion (REQ-V8R2-104).`,
      );
    }
  }
};

/**
 * Verification-class partition audit: 85 verify-today + 26 frontier-gated +
 * 10 process-only = 121, disjoint and complete (Section 6.1 tallies).
 */
export const assertVerificationPartition = (): void => {
  const verify = new Set(
    verifyTodayRequirements.map((entry) => entry.requirementId),
  );
  const deferred = new Set(
    frontierDeferrals.map((entry) => entry.requirementId),
  );
  const process = new Set(
    processOnlyRequirements.map((entry) => entry.requirementId),
  );
  if (verify.size !== 85 || deferred.size !== 26 || process.size !== 10) {
    throw new Error(
      `Verification tallies off: verify-today ${verify.size}/85, frontier-gated ${deferred.size}/26, process-only ${process.size}/10.`,
    );
  }
  const union = new Set([...verify, ...deferred, ...process]);
  if (union.size !== 121) {
    throw new Error(
      `Verification classes overlap or miss ids: union ${union.size}/121.`,
    );
  }
  for (let index = 1; index <= 121; index++) {
    const id = `REQ-V8R2-${String(index).padStart(3, '0')}`;
    if (!union.has(id)) {
      throw new Error(
        `Requirement ${id} is missing from all verification classes.`,
      );
    }
  }
};

/**
 * Every verify-today REQ carried by relationship rows resolves to a
 * non-empty row set; part-export REQs (hole patterns, min-wall, features,
 * census matchers) are asserted directly in their suite files.
 */
export const relationshipBackedRequirementIds = (): string[] => {
  const ids = new Set<string>();
  for (const row of mechanicalContract()) {
    ids.add(row.requirementId);
    for (const also of row.alsoVerifies ?? []) {
      ids.add(also);
    }
  }
  return [...ids].sort();
};
