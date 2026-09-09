import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/* oxlint-disable typescript/no-restricted-types -- These frozen JSON wire record types preserve explicit null separately from missing fields. */
type Authority = { path: string; sha256: string };

type BinarySource = {
  byteLength?: number;
  bytes?: number;
  hex?: string;
  name?: string;
  originalPath?: string;
  path?: string;
  sha256: string;
  utf8?: string;
};

type IngestTransport = {
  primaryBuffer: BinarySource;
  requestUtf8: string;
  resourceBuffers: BinarySource[];
};

type M1InputRow = {
  authoredRequestJson: string;
  expectedOperationDisposition?: string;
  expectedStatus?: string;
  id: string;
  subject: { ingestTransport: IngestTransport; subjectHash: string };
};

type M1ResultRow = {
  admissionUtf8: string;
  direct: M2ExpectedBytes;
  error: null | { message: string; name: string };
  id: string;
  status: string;
};

type F1InputRow = {
  canonicalPlanUtf8: string;
  claimResult: { canonicalUtf8: string };
  geometryId: string;
  id: string;
  neutralResult: { canonicalUtf8: string };
  subjectHash: string;
  submitRequestUtf8: string;
};

type F1Admission = {
  primary: BinarySource;
  request: { canonicalUtf8: string };
  resourceBuffers: BinarySource[];
  response: { canonicalUtf8: string };
  subjectHash: string;
  subjectId: string;
};

type F1ResultRow = {
  admission: { receipt: { utf8: string } };
  error: null | { message: string; name: string };
  id: string;
  report: {
    canonicalClaim: { utf8: string };
    canonicalPlan: { utf8: string };
    canonicalResult: { utf8: string };
    status: string;
  };
};

type M2ExpectedBytes = {
  canonicalClaimUtf8: string;
  canonicalPlanUtf8: string;
  canonicalResultUtf8: string;
};

type M2IndependentBytes = { canonicalPlanUtf8: string; canonicalResultUtf8?: string };

type M2Asset = {
  byteLength: number;
  sha256: string;
  source: string;
  url: string;
};

type M2Invocation = {
  arguments: unknown[];
  capability: string;
  claimId: string;
  payload: unknown;
  polarity: 'negative' | 'positive';
  subjectSlot: string;
  workUnitBudget: number;
};

/** One authored browser cell and its frozen expected records. */
export type M2BrowserRow = {
  authoredRequestUtf8: string;
  cohort: 'f1' | 'half-cube' | 'paired-glb' | 'selected';
  expected: {
    admissionUtf8: string;
    bytes: M2ExpectedBytes;
    error: null | { message: string; name: string };
    independent: null | M2IndependentBytes;
    status: string;
  };
  id: string;
  ingest: {
    primary: M2Asset;
    requestUtf8: string;
    resources: M2Asset[];
  };
  invocation: M2Invocation;
  subjectHash: string;
};

/** Metadata-only source and expected-row transport. */
export type M2BrowserMetadata = {
  authorities: Authority[];
  expectedRowCount?: number;
  rows: M2BrowserRow[];
  schemaVersion: 1;
};

type SupplementalBrowserMetadata = Omit<M2BrowserMetadata, 'schemaVersion'> & { schemaVersion: number };

/** Metadata paired with separately served primary/resource bytes. */
export type M2BrowserInputBundle = {
  assets: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  metadata: M2BrowserMetadata;
};

/* oxlint-enable typescript/no-restricted-types */

const authorities = {
  selected: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/selected-inputs.json',
    sha256: '27075bf5deeef41fd6a06c0d974f7f56338f209a516a7f4ab93b3d9de6a39a68',
  },
  halfCube: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/half-cube-selection.json',
    sha256: 'cae1a7e2ba0cd434a8dfd3d2ff8134fa6f979db5736028c86d23665e42955938',
  },
  pairedGlb: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/paired-glb-selection.json',
    sha256: '20443be8a2890cb0a471e9fdd65349149869b9e833a841feecbe6aa4b7a7b11e',
  },
  m1Results: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/final-installed/smoke-node.json',
    sha256: '9f48f3add30eb5855452c26555207aaf00fa847f0d708c3dec172e628d049764',
  },
  f1Results: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/final-installed/f1-node.json',
    sha256: '64a52bf5560f2cb9c73e62bb627521f43c904d923a255794fa59899680cbefaa',
  },
  f1Independent: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2/fullwire-results.json',
    sha256: 'd961d9e25b36fbc2baa8812e114b0fd37ee5c6f92453474dbac1022b86df1aab',
  },
  f1Admissions: {
    path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2/binary-admissions.json',
    sha256: 'f4454477a775cb0ade226d6f89a2cff460b0bfdb2f2c2655419da6c450051075',
  },
} as const satisfies Record<string, Authority>;

const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');

const readAuthority = async <Value>(repositoryRoot: string, authority: Authority): Promise<Value> => {
  const bytes = await readFile(resolve(repositoryRoot, authority.path));
  const actual = sha256(bytes);
  if (actual !== authority.sha256) {
    throw new Error(`M2 authority changed: ${authority.path} (${actual}).`);
  }
  return JSON.parse(bytes.toString('utf8')) as Value;
};

const exactByteLength = (source: BinarySource): number => {
  const byteLength = source.byteLength ?? source.bytes;
  if (byteLength === undefined) {
    throw new Error(`M2 binary ${source.sha256} has no byte length.`);
  }
  return byteLength;
};

const readBinary = async (repositoryRoot: string, source: BinarySource): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = Uint8Array.from(
    source.utf8 === undefined
      ? source.hex === undefined
        ? await readFile(resolve(repositoryRoot, source.path ?? source.originalPath ?? ''))
        : Buffer.from(source.hex, 'hex')
      : Buffer.from(source.utf8, 'utf8'),
  );
  if (bytes.byteLength !== exactByteLength(source) || sha256(bytes) !== source.sha256) {
    throw new Error(`M2 binary authority changed: ${source.path ?? source.originalPath ?? source.sha256}.`);
  }
  return bytes;
};

const invocation = (authoredRequestUtf8: string): M2Invocation => {
  const request = JSON.parse(authoredRequestUtf8) as {
    plan: {
      claims: Array<{
        capability: string;
        claimId: string;
        payload: { arguments?: unknown[] } | unknown;
        polarity: 'negative' | 'positive';
        subjectSlots: string[];
        workUnitBudget: number;
      }>;
    };
  };
  const claim = request.plan.claims[0];
  if (claim?.subjectSlots[0] === undefined) {
    throw new Error('M2 authored request has no claim or subject slot.');
  }
  const payload = claim.payload as { arguments?: unknown[] };
  return {
    arguments:
      claim.capability === 'toSatisfyRationalPlate' ? [] : (payload.arguments ?? [Reflect.get(payload, 'expected')]),
    capability: claim.capability,
    claimId: claim.claimId,
    payload: claim.payload,
    polarity: claim.polarity,
    subjectSlot: claim.subjectSlots[0],
    workUnitBudget: claim.workUnitBudget,
  };
};

const assertCanonicalReportRow = (row: M2BrowserRow): void => {
  for (const key of ['canonicalClaimUtf8', 'canonicalPlanUtf8', 'canonicalResultUtf8'] as const) {
    if (typeof row.expected.bytes[key] !== 'string') {
      throw new TypeError(`Supplemental browser row ${row.id} has no canonical report field ${key}.`);
    }
  }
  if (
    row.expected.independent === null ||
    typeof row.expected.independent.canonicalPlanUtf8 !== 'string' ||
    (row.expected.independent.canonicalResultUtf8 !== undefined &&
      typeof row.expected.independent.canonicalResultUtf8 !== 'string')
  ) {
    throw new Error(
      `Supplemental browser row ${row.id} has no independent plan authority or has an invalid result authority.`,
    );
  }
};

/**
 * Load one explicitly hash-bound supplemental browser campaign.
 * @param inputPath - Metadata JSON path; binary sources resolve relative to this file.
 * @param expectedSha256 - Required SHA-256 of the exact metadata bytes.
 * @returns Literal metadata and separately served, hash-verified binary assets.
 */
export const loadSupplementalBrowserInputs = async (
  inputPath: string,
  expectedSha256: string,
): Promise<M2BrowserInputBundle> => {
  const metadataPath = await realpath(resolve(inputPath));
  const metadataBytes = await readFile(metadataPath);
  if (sha256(metadataBytes) !== expectedSha256) {
    throw new Error(`Supplemental browser metadata changed: ${metadataPath}.`);
  }
  const source = JSON.parse(metadataBytes.toString('utf8')) as SupplementalBrowserMetadata;
  const { expectedRowCount } = source;
  if (
    source.schemaVersion !== 1 ||
    !Array.isArray(source.authorities) ||
    source.authorities.length === 0 ||
    !Array.isArray(source.rows) ||
    typeof expectedRowCount !== 'number' ||
    !Number.isSafeInteger(expectedRowCount) ||
    expectedRowCount <= 0 ||
    source.rows.length !== expectedRowCount
  ) {
    throw new Error('Supplemental browser metadata must declare its positive version-1 row count exactly.');
  }
  const metadata = source as M2BrowserMetadata;
  if (
    metadata.rows.some((row) => typeof row.id !== 'string' || row.id.length === 0) ||
    new Set(metadata.rows.map((row) => row.id)).size !== metadata.rows.length
  ) {
    throw new Error('Supplemental browser row IDs must be unique.');
  }
  const assets = new Map<string, Uint8Array<ArrayBuffer>>();
  const asset = async (source: M2Asset): Promise<M2Asset> => {
    const sourcePath = await realpath(resolve(dirname(metadataPath), source.source));
    const bytes = Uint8Array.from(await readFile(sourcePath));
    if (bytes.byteLength !== source.byteLength || sha256(bytes) !== source.sha256) {
      throw new Error(`Supplemental browser binary changed: ${sourcePath}.`);
    }
    const url = `/m2-assets/${source.sha256}`;
    const existing = assets.get(url);
    if (existing !== undefined && sha256(existing) !== source.sha256) {
      throw new Error(`Supplemental browser asset URL collision: ${url}.`);
    }
    assets.set(url, bytes);
    return { ...source, source: sourcePath, url };
  };
  const rows = await Promise.all(
    metadata.rows.map(async (row): Promise<M2BrowserRow> => {
      assertCanonicalReportRow(row);
      return {
        ...row,
        ingest: {
          ...row.ingest,
          primary: await asset(row.ingest.primary),
          resources: await Promise.all(row.ingest.resources.map(asset)),
        },
      };
    }),
  );
  return { assets, metadata: { ...metadata, rows } };
};

/**
 * Load and byte-verify the immutable M1/F1 corpus without embedding geometry in metadata.
 * @param repositoryRoot - Native worktree containing the frozen evidence sources.
 * @returns Metadata and separately served, hash-verified binary assets.
 */
export const loadM2BrowserInputs = async (repositoryRoot: string): Promise<M2BrowserInputBundle> => {
  const [selected, halfCube, pairedGlb, m1Results, f1Results, f1Independent, f1Admissions] = await Promise.all([
    readAuthority<{ rows: M1InputRow[] }>(repositoryRoot, authorities.selected),
    readAuthority<{ rows: M1InputRow[] }>(repositoryRoot, authorities.halfCube),
    readAuthority<{ rows: M1InputRow[] }>(repositoryRoot, authorities.pairedGlb),
    readAuthority<{ rows: M1ResultRow[] }>(repositoryRoot, authorities.m1Results),
    readAuthority<{ rows: F1ResultRow[] }>(repositoryRoot, authorities.f1Results),
    readAuthority<F1InputRow[]>(repositoryRoot, authorities.f1Independent),
    readAuthority<F1Admission[]>(repositoryRoot, authorities.f1Admissions),
  ]);
  const assets = new Map<string, Uint8Array<ArrayBuffer>>();
  const asset = async (source: BinarySource): Promise<M2Asset> => {
    const url = `/m2-assets/${source.sha256}`;
    const bytes = await readBinary(repositoryRoot, source);
    const existing = assets.get(url);
    if (existing !== undefined && sha256(existing) !== source.sha256) {
      throw new Error(`M2 asset URL collision: ${url}.`);
    }
    assets.set(url, bytes);
    return {
      byteLength: bytes.byteLength,
      sha256: source.sha256,
      source: source.path ?? source.originalPath ?? 'inline-authority-utf8',
      url,
    };
  };
  const m1ResultById = new Map(m1Results.rows.map((row) => [row.id, row]));
  const m1Rows = await Promise.all(
    [
      ...selected.rows.map((row) => ({ cohort: 'selected', row }) as const),
      ...halfCube.rows.map((row) => ({ cohort: 'half-cube', row }) as const),
      ...pairedGlb.rows.map((row) => ({ cohort: 'paired-glb', row }) as const),
    ].map(async ({ cohort, row }): Promise<M2BrowserRow> => {
      const baseline = m1ResultById.get(row.id);
      if (baseline === undefined) {
        throw new Error(`M2 M1 baseline is missing ${row.id}.`);
      }
      const { ingestTransport } = row.subject;
      return {
        authoredRequestUtf8: row.authoredRequestJson,
        cohort,
        expected: {
          admissionUtf8: baseline.admissionUtf8,
          bytes: baseline.direct,
          error: baseline.error,
          independent: null,
          status: baseline.status,
        },
        id: row.id,
        ingest: {
          primary: await asset(ingestTransport.primaryBuffer),
          requestUtf8: ingestTransport.requestUtf8,
          resources: await Promise.all(ingestTransport.resourceBuffers.map(asset)),
        },
        invocation: invocation(row.authoredRequestJson),
        subjectHash: row.subject.subjectHash,
      };
    }),
  );
  const f1ResultById = new Map(f1Results.rows.map((row) => [row.id, row]));
  const admissionById = new Map(f1Admissions.map((admission) => [admission.subjectId, admission]));
  const f1Rows = await Promise.all(
    f1Independent.map(async (row): Promise<M2BrowserRow> => {
      const baseline = f1ResultById.get(row.id);
      const admission = admissionById.get(row.geometryId);
      if (baseline === undefined || admission === undefined) {
        throw new Error(`M2 F1 authority is incomplete for ${row.id}.`);
      }
      return {
        authoredRequestUtf8: row.submitRequestUtf8,
        cohort: 'f1',
        expected: {
          admissionUtf8: baseline.admission.receipt.utf8,
          bytes: {
            canonicalClaimUtf8: baseline.report.canonicalClaim.utf8,
            canonicalPlanUtf8: baseline.report.canonicalPlan.utf8,
            canonicalResultUtf8: baseline.report.canonicalResult.utf8,
          },
          error: baseline.error,
          independent: {
            canonicalPlanUtf8: row.canonicalPlanUtf8,
            canonicalResultUtf8: row.neutralResult.canonicalUtf8,
          },
          status: baseline.report.status,
        },
        id: row.id,
        ingest: {
          primary: await asset(admission.primary),
          requestUtf8: admission.request.canonicalUtf8,
          resources: await Promise.all(admission.resourceBuffers.map(asset)),
        },
        invocation: invocation(row.submitRequestUtf8),
        subjectHash: admission.subjectHash,
      };
    }),
  );
  const rows = [...m1Rows, ...f1Rows];
  if (
    selected.rows.length !== 10 ||
    halfCube.rows.length !== 3 ||
    pairedGlb.rows.length !== 5 ||
    f1Rows.length !== 12 ||
    rows.length !== 30
  ) {
    throw new Error('M2 corpus must contain selected10 + half-cube3 + paired-GLB5 + F1 12 rows.');
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('M2 corpus row IDs must be unique.');
  }
  return {
    assets,
    metadata: { authorities: Object.values(authorities), rows, schemaVersion: 1 },
  };
};
