# libcascade — StepTidy

1 top-level symbols. Signatures are verbatim typescript.

// A class to merge STEP entities
StepTidy_DuplicateCleaner: declare class StepTidy_DuplicateCleaner

constructor

// Perform the merging of entities
Perform(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
