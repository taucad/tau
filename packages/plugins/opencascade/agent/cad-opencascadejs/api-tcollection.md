# libcascade — TCollection

1 top-level symbols. Signatures are verbatim typescript.

// The package <TCollection> provides the services for the transient basic data structures
TCollection: declare class TCollection

constructor

// Returns a prime number greater than \*suitable to dimension a Map
static NextPrimeForMap(I: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
