/** Explicit support state for one source-attributed inventory field. @public */
export type GeoSpecPmiField<Value> = {
  readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
  // oxlint-disable-next-line typescript/no-restricted-types -- Canonical JSON requires explicit null distinct from a missing field.
  readonly value: Value | null;
  // oxlint-disable-next-line typescript/no-restricted-types -- Canonical JSON requires explicit null distinct from a missing field.
  readonly reason: string | null;
};

/** Original Part21 entity ID and exact source argument tokens. @public */
export type GeoSpecPmiRawEntity = {
  readonly sourceId: number;
  readonly kind: string;
  readonly arguments: readonly string[];
};

/** Source-authored scalar and Rust-normalized reduced rational millimetres. @public */
export type GeoSpecPmiNumber = {
  readonly sourceId: number;
  readonly authoredText: string;
  readonly unitId: number;
  readonly unitRecords: readonly GeoSpecPmiRawEntity[];
  readonly millimetres: string;
  readonly name: string;
};

/** A uniquely forward-transferred face; null occurrence denotes the whole part. @public */
export type GeoSpecPmiFaceAssociation = {
  readonly sourceFaceId: number;
  readonly occurrenceRoute: readonly number[];
  // oxlint-disable-next-line typescript/no-restricted-types -- Canonical JSON requires explicit null distinct from a missing field.
  readonly occurrence: number | null;
  readonly publicFaceOrdinal: number;
};

/** One ordered role reference, including incomplete source/transfer evidence. @public */
export type GeoSpecPmiShapeReference = {
  // oxlint-disable-next-line typescript/no-restricted-types -- Canonical JSON requires explicit null distinct from a missing field.
  readonly sourceAspectId: number | null;
  readonly sourceUsageIds: readonly number[];
  readonly sourceItemIds: readonly number[];
  readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
  readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
};

/** Normalized authored limits; never an inferred geometric conformance verdict. @public */
export type GeoSpecPmiLimits = {
  readonly lowerMillimetres: string;
  readonly upperMillimetres: string;
  readonly basis: 'authored-limits' | 'nominal-plus-minus';
};

/** Source record preserving semantic/presentation separation and ordered roles. @public */
export type GeoSpecPmiRecord = {
  readonly sourceId: number;
  readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation';
  readonly channel: 'semantic' | 'presentation';
  readonly kind: string;
  readonly name: GeoSpecPmiField<string>;
  readonly first: readonly GeoSpecPmiShapeReference[];
  readonly second: readonly GeoSpecPmiShapeReference[];
  readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>;
  readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>;
  readonly interpretation: GeoSpecPmiField<string>;
  readonly raw: readonly GeoSpecPmiRawEntity[];
};

/** Positive-only inventory value inside the ordinary canonical query report. @public */
export type GeoSpecPmiInventory = {
  readonly contract: 'geospec.pmi.inventory/v1';
  readonly status: 'semantic' | 'graphical-only' | 'empty';
  readonly fileSchema: string;
  readonly editionValidation: 'not-validated';
  readonly records: readonly GeoSpecPmiRecord[];
};

/** Strict inventory output limits. Exceeding either refuses without truncation. @public */
export type GeoSpecPmiQueryPayload = {
  readonly maxRecords?: number;
  readonly maxOutputBytes?: number;
};

/** Complete inventory value; provenance is the unchanged core identity descriptor. @public */
export type GeoSpecPmiQueryValue = {
  readonly inventory: GeoSpecPmiInventory;
  readonly subjectHash: string;
  readonly provenance: Readonly<Record<string, unknown>>;
};
