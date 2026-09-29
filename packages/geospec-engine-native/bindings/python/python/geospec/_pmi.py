"""Typed neutral queryPmi inventory; normalization and semantics belong to Rust."""
from typing import Generic, Literal, TypeVar, TypedDict

Value = TypeVar("Value")

class GeoSpecPmiField(TypedDict, Generic[Value]):
    status: Literal["supported", "missing", "invalid", "ambiguous", "unsupported"]
    value: Value | None
    reason: str | None

class GeoSpecPmiRawEntity(TypedDict):
    sourceId: int
    kind: str
    arguments: list[str]

class GeoSpecPmiNumber(TypedDict):
    sourceId: int
    authoredText: str
    unitId: int
    unitRecords: list[GeoSpecPmiRawEntity]
    millimetres: str
    name: str

class GeoSpecPmiFaceAssociation(TypedDict):
    sourceFaceId: int
    occurrenceRoute: list[int]
    occurrence: int | None
    publicFaceOrdinal: int

class GeoSpecPmiShapeReference(TypedDict):
    sourceAspectId: int | None
    sourceUsageIds: list[int]
    sourceItemIds: list[int]
    requestedRoute: GeoSpecPmiField[list[int]]
    associations: GeoSpecPmiField[list[GeoSpecPmiFaceAssociation]]

class GeoSpecPmiLimits(TypedDict):
    lowerMillimetres: str
    upperMillimetres: str
    basis: Literal["authored-limits", "nominal-plus-minus"]

class GeoSpecPmiRecord(TypedDict):
    sourceId: int
    family: Literal["dimension", "datum", "tolerance", "presentation"]
    channel: Literal["semantic", "presentation"]
    kind: str
    name: GeoSpecPmiField[str]
    first: list[GeoSpecPmiShapeReference]
    second: list[GeoSpecPmiShapeReference]
    numbers: GeoSpecPmiField[list[GeoSpecPmiNumber]]
    limits: GeoSpecPmiField[GeoSpecPmiLimits]
    interpretation: GeoSpecPmiField[str]
    raw: list[GeoSpecPmiRawEntity]

class GeoSpecPmiInventory(TypedDict):
    contract: Literal["geospec.pmi.inventory/v1"]
    status: Literal["semantic", "graphical-only", "empty"]
    fileSchema: str
    editionValidation: Literal["not-validated"]
    records: list[GeoSpecPmiRecord]

class GeoSpecPmiQueryPayload(TypedDict, total=False):
    maxRecords: int
    maxOutputBytes: int

class GeoSpecPmiQueryValue(TypedDict):
    inventory: GeoSpecPmiInventory
    subjectHash: str
    provenance: dict[str, object]
