# libcascade — NCollection (47)

7 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_handle_PCDM_Document: declare class NCollection_Sequence_handle_PCDM_Document extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_PCDM_Document): NCollection_Sequence_handle_PCDM_Document;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: PCDM_Document): void;
Append(theSeq: NCollection_Sequence_handle_PCDM_Document): void;
Append(theItem: PCDM_Document): void;
Append(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

// Prepend one item
Prepend(theItem: PCDM_Document): void;
Prepend(theSeq: NCollection_Sequence_handle_PCDM_Document): void;
Prepend(theItem: PCDM_Document): void;
Prepend(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: PCDM_Document): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
InsertBefore(theIndex: number, theItem: PCDM_Document): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
InsertAfter(theIndex: number, theItem: PCDM_Document): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
InsertAfter(theIndex: number, theItem: PCDM_Document): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
// theSeq: Mutated in place

// First item access
First(): PCDM_Document;

// First item access
ChangeFirst(): PCDM_Document;

// Last item access
Last(): PCDM_Document;

// Last item access
ChangeLast(): PCDM_Document;

// Constant item access by theIndex
Value(theIndex: number): PCDM_Document;

// Variable item access by theIndex
ChangeValue(theIndex: number): PCDM_Document;

// Set item value by theIndex
SetValue(theIndex: number, theItem: PCDM_Document): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): PCDM_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): PCDM_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Poly_Triangulation: declare class NCollection_Sequence_handle_Poly_Triangulation extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_Poly_Triangulation): NCollection_Sequence_handle_Poly_Triangulation;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Poly_Triangulation): void;
Append(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
Append(theItem: Poly_Triangulation): void;
Append(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

// Prepend one item
Prepend(theItem: Poly_Triangulation): void;
Prepend(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
Prepend(theItem: Poly_Triangulation): void;
Prepend(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Poly_Triangulation): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
InsertBefore(theIndex: number, theItem: Poly_Triangulation): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
InsertAfter(theIndex: number, theItem: Poly_Triangulation): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
InsertAfter(theIndex: number, theItem: Poly_Triangulation): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
// theSeq: Mutated in place

// First item access
First(): Poly_Triangulation;

// First item access
ChangeFirst(): Poly_Triangulation;

// Last item access
Last(): Poly_Triangulation;

// Last item access
ChangeLast(): Poly_Triangulation;

// Constant item access by theIndex
Value(theIndex: number): Poly_Triangulation;

// Variable item access by theIndex
ChangeValue(theIndex: number): Poly_Triangulation;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Poly_Triangulation): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Poly_Triangulation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Poly_Triangulation;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_STEPSelections_AssemblyLink: declare class NCollection_Sequence_handle_STEPSelections_AssemblyLink extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_STEPSelections_AssemblyLink): NCollection_Sequence_handle_STEPSelections_AssemblyLink;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: STEPSelections_AssemblyLink): void;
Append(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
Append(theItem: STEPSelections_AssemblyLink): void;
Append(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

// Prepend one item
Prepend(theItem: STEPSelections_AssemblyLink): void;
Prepend(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
Prepend(theItem: STEPSelections_AssemblyLink): void;
Prepend(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
InsertBefore(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
InsertAfter(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
InsertAfter(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
// theSeq: Mutated in place

// First item access
First(): STEPSelections_AssemblyLink;

// First item access
ChangeFirst(): STEPSelections_AssemblyLink;

// Last item access
Last(): STEPSelections_AssemblyLink;

// Last item access
ChangeLast(): STEPSelections_AssemblyLink;

// Constant item access by theIndex
Value(theIndex: number): STEPSelections_AssemblyLink;

// Variable item access by theIndex
ChangeValue(theIndex: number): STEPSelections_AssemblyLink;

// Set item value by theIndex
SetValue(theIndex: number, theItem: STEPSelections_AssemblyLink): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): STEPSelections_AssemblyLink;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): STEPSelections_AssemblyLink;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData: declare class NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: ShapeAnalysis_FreeBoundData): void;
Append(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
Append(theItem: ShapeAnalysis_FreeBoundData): void;
Append(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

// Prepend one item
Prepend(theItem: ShapeAnalysis_FreeBoundData): void;
Prepend(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
Prepend(theItem: ShapeAnalysis_FreeBoundData): void;
Prepend(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
InsertBefore(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
InsertAfter(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
InsertAfter(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
// theSeq: Mutated in place

// First item access
First(): ShapeAnalysis_FreeBoundData;

// First item access
ChangeFirst(): ShapeAnalysis_FreeBoundData;

// Last item access
Last(): ShapeAnalysis_FreeBoundData;

// Last item access
ChangeLast(): ShapeAnalysis_FreeBoundData;

// Constant item access by theIndex
Value(theIndex: number): ShapeAnalysis_FreeBoundData;

// Variable item access by theIndex
ChangeValue(theIndex: number): ShapeAnalysis_FreeBoundData;

// Set item value by theIndex
SetValue(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): ShapeAnalysis_FreeBoundData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): ShapeAnalysis_FreeBoundData;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Standard_Transient: declare class NCollection_Sequence_handle_Standard_Transient extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_Standard_Transient): NCollection_Sequence_handle_Standard_Transient;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Standard_Transient): void;
Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
Append(theItem: Standard_Transient): void;
Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

// Prepend one item
Prepend(theItem: Standard_Transient): void;
Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
Prepend(theItem: Standard_Transient): void;
Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Standard_Transient): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
InsertBefore(theIndex: number, theItem: Standard_Transient): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
InsertAfter(theIndex: number, theItem: Standard_Transient): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
InsertAfter(theIndex: number, theItem: Standard_Transient): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
// theSeq: Mutated in place

// First item access
First(): Standard_Transient;

// First item access
ChangeFirst(): Standard_Transient;

// Last item access
Last(): Standard_Transient;

// Last item access
ChangeLast(): Standard_Transient;

// Constant item access by theIndex
Value(theIndex: number): Standard_Transient;

// Variable item access by theIndex
ChangeValue(theIndex: number): Standard_Transient;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Standard_Transient): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Standard_Transient;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Standard_Transient;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition: declare class NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: StepElement_CurveElementSectionDefinition): void;
Append(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
Append(theItem: StepElement_CurveElementSectionDefinition): void;
Append(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

// Prepend one item
Prepend(theItem: StepElement_CurveElementSectionDefinition): void;
Prepend(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
Prepend(theItem: StepElement_CurveElementSectionDefinition): void;
Prepend(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
InsertBefore(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
InsertAfter(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
InsertAfter(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
// theSeq: Mutated in place

// First item access
First(): StepElement_CurveElementSectionDefinition;

// First item access
ChangeFirst(): StepElement_CurveElementSectionDefinition;

// Last item access
Last(): StepElement_CurveElementSectionDefinition;

// Last item access
ChangeLast(): StepElement_CurveElementSectionDefinition;

// Constant item access by theIndex
Value(theIndex: number): StepElement_CurveElementSectionDefinition;

// Variable item access by theIndex
ChangeValue(theIndex: number): StepElement_CurveElementSectionDefinition;

// Set item value by theIndex
SetValue(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_CurveElementSectionDefinition;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_CurveElementSectionDefinition;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_StepElement_ElementMaterial: declare class NCollection_Sequence_handle_StepElement_ElementMaterial extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_handle_StepElement_ElementMaterial): NCollection_Sequence_handle_StepElement_ElementMaterial;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: StepElement_ElementMaterial): void;
Append(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
Append(theItem: StepElement_ElementMaterial): void;
Append(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

// Prepend one item
Prepend(theItem: StepElement_ElementMaterial): void;
Prepend(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
Prepend(theItem: StepElement_ElementMaterial): void;
Prepend(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: StepElement_ElementMaterial): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
InsertBefore(theIndex: number, theItem: StepElement_ElementMaterial): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
InsertAfter(theIndex: number, theItem: StepElement_ElementMaterial): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
InsertAfter(theIndex: number, theItem: StepElement_ElementMaterial): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
// theSeq: Mutated in place

// First item access
First(): StepElement_ElementMaterial;

// First item access
ChangeFirst(): StepElement_ElementMaterial;

// Last item access
Last(): StepElement_ElementMaterial;

// Last item access
ChangeLast(): StepElement_ElementMaterial;

// Constant item access by theIndex
Value(theIndex: number): StepElement_ElementMaterial;

// Variable item access by theIndex
ChangeValue(theIndex: number): StepElement_ElementMaterial;

// Set item value by theIndex
SetValue(theIndex: number, theItem: StepElement_ElementMaterial): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_ElementMaterial;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_ElementMaterial;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
