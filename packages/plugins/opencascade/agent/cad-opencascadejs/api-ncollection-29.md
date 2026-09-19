# libcascade — NCollection (29)

10 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_MAT_BasicElt: declare class NCollection_Sequence_handle_MAT_BasicElt extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_MAT_BasicElt): NCollection_Sequence_handle_MAT_BasicElt;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: MAT_BasicElt): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  Append(theItem: MAT_BasicElt): void;
  Append(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  Prepend(theItem: MAT_BasicElt): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  Prepend(theItem: MAT_BasicElt): void;
  Prepend(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  InsertBefore(theIndex: number, theItem: MAT_BasicElt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  InsertBefore(theIndex: number, theItem: MAT_BasicElt): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  InsertAfter(theIndex: number, theItem: MAT_BasicElt): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
  InsertAfter(theIndex: number, theItem: MAT_BasicElt): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

  First(): MAT_BasicElt;

  ChangeFirst(): MAT_BasicElt;

  Last(): MAT_BasicElt;

  ChangeLast(): MAT_BasicElt;

  Value(theIndex: number): MAT_BasicElt;

  ChangeValue(theIndex: number): MAT_BasicElt;

  SetValue(theIndex: number, theItem: MAT_BasicElt): void;

  At(theIndex: number): MAT_BasicElt;

  ChangeAt(theIndex: number): MAT_BasicElt;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt: declare class NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: unknown): void;
  Append(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  Append(theItem: unknown): void;
  Append(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  Prepend(theItem: unknown): void;
  Prepend(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  Prepend(theItem: unknown): void;
  Prepend(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  InsertBefore(theIndex: number, theItem: unknown): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: unknown): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
  InsertAfter(theIndex: number, theItem: unknown): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

  First(): unknown;

  ChangeFirst(): unknown;

  Last(): unknown;

  ChangeLast(): unknown;

  Value(theIndex: number): unknown;

  ChangeValue(theIndex: number): unknown;

  SetValue(theIndex: number, theItem: unknown): void;

  At(theIndex: number): unknown;

  ChangeAt(theIndex: number): unknown;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_PCDM_Document: declare class NCollection_Sequence_handle_PCDM_Document extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_PCDM_Document): NCollection_Sequence_handle_PCDM_Document;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: PCDM_Document): void;
  Append(theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  Append(theItem: PCDM_Document): void;
  Append(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  Prepend(theItem: PCDM_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  Prepend(theItem: PCDM_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  InsertBefore(theIndex: number, theItem: PCDM_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  InsertBefore(theIndex: number, theItem: PCDM_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  InsertAfter(theIndex: number, theItem: PCDM_Document): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  InsertAfter(theIndex: number, theItem: PCDM_Document): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  First(): PCDM_Document;

  ChangeFirst(): PCDM_Document;

  Last(): PCDM_Document;

  ChangeLast(): PCDM_Document;

  Value(theIndex: number): PCDM_Document;

  ChangeValue(theIndex: number): PCDM_Document;

  SetValue(theIndex: number, theItem: PCDM_Document): void;

  At(theIndex: number): PCDM_Document;

  ChangeAt(theIndex: number): PCDM_Document;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Poly_Triangulation: declare class NCollection_Sequence_handle_Poly_Triangulation extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Poly_Triangulation): NCollection_Sequence_handle_Poly_Triangulation;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Poly_Triangulation): void;
  Append(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  Append(theItem: Poly_Triangulation): void;
  Append(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  Prepend(theItem: Poly_Triangulation): void;
  Prepend(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  Prepend(theItem: Poly_Triangulation): void;
  Prepend(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  InsertBefore(theIndex: number, theItem: Poly_Triangulation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  InsertBefore(theIndex: number, theItem: Poly_Triangulation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  InsertAfter(theIndex: number, theItem: Poly_Triangulation): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  InsertAfter(theIndex: number, theItem: Poly_Triangulation): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  First(): Poly_Triangulation;

  ChangeFirst(): Poly_Triangulation;

  Last(): Poly_Triangulation;

  ChangeLast(): Poly_Triangulation;

  Value(theIndex: number): Poly_Triangulation;

  ChangeValue(theIndex: number): Poly_Triangulation;

  SetValue(theIndex: number, theItem: Poly_Triangulation): void;

  At(theIndex: number): Poly_Triangulation;

  ChangeAt(theIndex: number): Poly_Triangulation;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_STEPSelections_AssemblyLink: declare class NCollection_Sequence_handle_STEPSelections_AssemblyLink extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_STEPSelections_AssemblyLink): NCollection_Sequence_handle_STEPSelections_AssemblyLink;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: STEPSelections_AssemblyLink): void;
  Append(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  Append(theItem: STEPSelections_AssemblyLink): void;
  Append(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  Prepend(theItem: STEPSelections_AssemblyLink): void;
  Prepend(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  Prepend(theItem: STEPSelections_AssemblyLink): void;
  Prepend(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  InsertBefore(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  InsertBefore(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  InsertAfter(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  InsertAfter(theIndex: number, theItem: STEPSelections_AssemblyLink): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  First(): STEPSelections_AssemblyLink;

  ChangeFirst(): STEPSelections_AssemblyLink;

  Last(): STEPSelections_AssemblyLink;

  ChangeLast(): STEPSelections_AssemblyLink;

  Value(theIndex: number): STEPSelections_AssemblyLink;

  ChangeValue(theIndex: number): STEPSelections_AssemblyLink;

  SetValue(theIndex: number, theItem: STEPSelections_AssemblyLink): void;

  At(theIndex: number): STEPSelections_AssemblyLink;

  ChangeAt(theIndex: number): STEPSelections_AssemblyLink;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData: declare class NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: ShapeAnalysis_FreeBoundData): void;
  Append(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  Append(theItem: ShapeAnalysis_FreeBoundData): void;
  Append(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  Prepend(theItem: ShapeAnalysis_FreeBoundData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  Prepend(theItem: ShapeAnalysis_FreeBoundData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  InsertBefore(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  InsertBefore(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  InsertAfter(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  InsertAfter(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  First(): ShapeAnalysis_FreeBoundData;

  ChangeFirst(): ShapeAnalysis_FreeBoundData;

  Last(): ShapeAnalysis_FreeBoundData;

  ChangeLast(): ShapeAnalysis_FreeBoundData;

  Value(theIndex: number): ShapeAnalysis_FreeBoundData;

  ChangeValue(theIndex: number): ShapeAnalysis_FreeBoundData;

  SetValue(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;

  At(theIndex: number): ShapeAnalysis_FreeBoundData;

  ChangeAt(theIndex: number): ShapeAnalysis_FreeBoundData;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Standard_Transient: declare class NCollection_Sequence_handle_Standard_Transient extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Standard_Transient): NCollection_Sequence_handle_Standard_Transient;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Standard_Transient): void;
  Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  Append(theItem: Standard_Transient): void;
  Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  Prepend(theItem: Standard_Transient): void;
  Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  Prepend(theItem: Standard_Transient): void;
  Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  InsertBefore(theIndex: number, theItem: Standard_Transient): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  InsertBefore(theIndex: number, theItem: Standard_Transient): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  InsertAfter(theIndex: number, theItem: Standard_Transient): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  InsertAfter(theIndex: number, theItem: Standard_Transient): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  First(): Standard_Transient;

  ChangeFirst(): Standard_Transient;

  Last(): Standard_Transient;

  ChangeLast(): Standard_Transient;

  Value(theIndex: number): Standard_Transient;

  ChangeValue(theIndex: number): Standard_Transient;

  SetValue(theIndex: number, theItem: Standard_Transient): void;

  At(theIndex: number): Standard_Transient;

  ChangeAt(theIndex: number): Standard_Transient;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition: declare class NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: StepElement_CurveElementSectionDefinition): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  Append(theItem: StepElement_CurveElementSectionDefinition): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  Prepend(theItem: StepElement_CurveElementSectionDefinition): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  Prepend(theItem: StepElement_CurveElementSectionDefinition): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  InsertBefore(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  InsertBefore(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  InsertAfter(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  InsertAfter(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  First(): StepElement_CurveElementSectionDefinition;

  ChangeFirst(): StepElement_CurveElementSectionDefinition;

  Last(): StepElement_CurveElementSectionDefinition;

  ChangeLast(): StepElement_CurveElementSectionDefinition;

  Value(theIndex: number): StepElement_CurveElementSectionDefinition;

  ChangeValue(theIndex: number): StepElement_CurveElementSectionDefinition;

  SetValue(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

  At(theIndex: number): StepElement_CurveElementSectionDefinition;

  ChangeAt(theIndex: number): StepElement_CurveElementSectionDefinition;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepElement_ElementMaterial: declare class NCollection_Sequence_handle_StepElement_ElementMaterial extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_StepElement_ElementMaterial): NCollection_Sequence_handle_StepElement_ElementMaterial;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: StepElement_ElementMaterial): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  Append(theItem: StepElement_ElementMaterial): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  Prepend(theItem: StepElement_ElementMaterial): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  Prepend(theItem: StepElement_ElementMaterial): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  InsertBefore(theIndex: number, theItem: StepElement_ElementMaterial): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  InsertBefore(theIndex: number, theItem: StepElement_ElementMaterial): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  InsertAfter(theIndex: number, theItem: StepElement_ElementMaterial): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  InsertAfter(theIndex: number, theItem: StepElement_ElementMaterial): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  First(): StepElement_ElementMaterial;

  ChangeFirst(): StepElement_ElementMaterial;

  Last(): StepElement_ElementMaterial;

  ChangeLast(): StepElement_ElementMaterial;

  Value(theIndex: number): StepElement_ElementMaterial;

  ChangeValue(theIndex: number): StepElement_ElementMaterial;

  SetValue(theIndex: number, theItem: StepElement_ElementMaterial): void;

  At(theIndex: number): StepElement_ElementMaterial;

  ChangeAt(theIndex: number): StepElement_ElementMaterial;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship: declare class NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: StepFEA_ElementGeometricRelationship): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  Append(theItem: StepFEA_ElementGeometricRelationship): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  Prepend(theItem: StepFEA_ElementGeometricRelationship): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  Prepend(theItem: StepFEA_ElementGeometricRelationship): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  InsertBefore(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  InsertBefore(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  First(): StepFEA_ElementGeometricRelationship;

  ChangeFirst(): StepFEA_ElementGeometricRelationship;

  Last(): StepFEA_ElementGeometricRelationship;

  ChangeLast(): StepFEA_ElementGeometricRelationship;

  Value(theIndex: number): StepFEA_ElementGeometricRelationship;

  ChangeValue(theIndex: number): StepFEA_ElementGeometricRelationship;

  SetValue(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;

  At(theIndex: number): StepFEA_ElementGeometricRelationship;

  ChangeAt(theIndex: number): StepFEA_ElementGeometricRelationship;

  delete(): void;

  [Symbol.dispose](): void;
