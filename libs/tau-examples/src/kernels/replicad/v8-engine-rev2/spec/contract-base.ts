/**
 * Shared contract row shape, selector helpers, ordinal conventions
 * (spec Section 1.5), and proof tolerances for the v8-engine-rev2
 * mechanical contract.
 */
import type { GeoSpecSpatialRelationshipExpectation } from 'geospec';

/**
 * Domain-narrowed selector: the contract only names occurrences,
 * part-relative interfaces, or datums (same discipline as v1, kept narrow so
 * helpers can read `.of`/`.name` directly).
 */
export type ContractSelector =
  | { kind: 'occurrence'; name: string }
  | { kind: 'interface'; name: string; of: string }
  | { kind: 'datum'; name: string; of: string };

/**
 * One relationship row of the rev2 mechanical contract. `requirementId` is the owning
 * REQ-V8R2 id; `alsoVerifies` cites additional REQs satisfied by the same
 * row (single authoritative row per interface pair, REQ-V8R2-102).
 */
export type ContractRow = Omit<
  GeoSpecSpatialRelationshipExpectation,
  'subject' | 'target' | 'id'
> & {
  requirementId: string;
  alsoVerifies?: string[];
  id: string;
  subject: ContractSelector;
  target: ContractSelector;
};

/**
 * Proof tolerances. `contact` is REQ-V8R2-065 verbatim: contact rows assert
 * gap <= 0.001 — the v1 0.01–0.05 standoff legitimizers are banned.
 */
export const tolerances = {
  /** REQ-V8R2-065: contact means gap <= 0.001. */
  contact: 0.001,
  /** Numeric slack for fit-band clearance rows (bands are verbatim min/max). */
  band: 0.001,
  /** Axis-distance slack for coaxial/concentric rows. */
  coaxial: 0.03,
  /** Planar-offset slack for coplanar split-line rows. */
  coplanar: 0.02,
  /** Angular slack, degrees. */
  angularDegrees: 0.2,
  /** Insertion/containment depth slack. */
  depth: 0.05,
  /** Mesh connected-component tolerance (mm). */
  fine: 0.1,
  /** Global interference scan tolerance (mm). */
  overlap: 0.05,
} as const;

/**
 * Interference relationship rows assert REAL positive overlap volume for
 * declared press fits. The radial band is verbatim in the row reason and the
 * T-FITS-PRESS table; the volumetric proof floor only rejects line-to-line
 * or clearance "presses" (the v1 defect class).
 */
export const interferenceProofMinVolume = 0.001;

export const occ = (name: string): ContractSelector => ({
  kind: 'occurrence',
  name,
});
export const iface = (of: string, name: string): ContractSelector => ({
  kind: 'interface',
  name,
  of,
});
export const datumOf = (of: string, name: string): ContractSelector => ({
  kind: 'datum',
  name,
  of,
});

export type BankSide = 'R' | 'L';
export const banks: readonly BankSide[] = ['R', 'L'];

/** Cylinder numbering (Section 1.5): right bank 1–4, left bank 5–8. */
export const cylinders: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const bankOf = (cylinder: number): BankSide =>
  cylinder <= 4 ? 'R' : 'L';
/** 1-based cylinder slot within its bank (front to rear). */
export const bankSlot = (cylinder: number): number => ((cylinder - 1) % 4) + 1;

export type ValveSlot = 'Intake' | 'Exhaust';
/** Per-valve ordinal v = 2c−1 (intake), v = 2c (exhaust); v in 1..16. */
export const valveOrdinal = (cylinder: number, slot: ValveSlot): number =>
  slot === 'Intake' ? 2 * cylinder - 1 : 2 * cylinder;
/** 1..16 valve ordinals with their cylinder and slot. */
export const valves = cylinders.flatMap((cylinder) =>
  (['Intake', 'Exhaust'] as const).map((slot) => ({
    cylinder,
    slot,
    valve: valveOrdinal(cylinder, slot),
    bank: bankOf(cylinder),
    /** 1..8 valve index within the bank head (2 per bank slot). */
    bankValve: 2 * (bankSlot(cylinder) - 1) + (slot === 'Intake' ? 1 : 2),
  })),
);

export const headOf = (bank: BankSide): string => `Cylinder Head ${bank}`;
export const headGasketOf = (bank: BankSide): string => `Head Gasket ${bank}`;

/**
 * Crank main-to-pin oil drilling map (Section 3.2, verbatim):
 * M1>P1, M2>P2, M4>P3, M5>P4 plus second feeds M2>P1, M3>P2, M3>P3, M4>P4.
 */
export const crankOilDrillings: ReadonlyArray<{ main: number; pin: number }> = [
  { main: 1, pin: 1 },
  { main: 2, pin: 2 },
  { main: 4, pin: 3 },
  { main: 5, pin: 4 },
  { main: 2, pin: 1 },
  { main: 3, pin: 2 },
  { main: 3, pin: 3 },
  { main: 4, pin: 4 },
];
