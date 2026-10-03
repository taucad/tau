# libcascade — NCollection (31)

12 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_PCDM_Document: declare class NCollection_Sequence_handle_PCDM_Document extends NCollection_BaseSequence

  // NCollection_Sequence_handle_PCDM_Document.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_PCDM_Document);

  // NCollection_Sequence_handle_PCDM_Document.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_PCDM_Document.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_PCDM_Document.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_PCDM_Document.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_PCDM_Document.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_PCDM_Document.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_PCDM_Document.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_PCDM_Document): NCollection_Sequence_handle_PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_PCDM_Document.Append (method)
  Append(theItem: PCDM_Document): void;
  Append(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.Prepend (method)
  Prepend(theItem: PCDM_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: PCDM_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;
  InsertAfter(theIndex: number, theItem: PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.First (method)
  First(): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.ChangeFirst (method)
  ChangeFirst(): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.Last (method)
  Last(): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.ChangeLast (method)
  ChangeLast(): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.Value (method)
  Value(theIndex: number): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.ChangeValue (method)
  ChangeValue(theIndex: number): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.SetValue (method)
  SetValue(theIndex: number, theItem: PCDM_Document): void;

  // NCollection_Sequence_handle_PCDM_Document.At (method)
  At(theIndex: number): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.ChangeAt (method)
  ChangeAt(theIndex: number): PCDM_Document;

  // NCollection_Sequence_handle_PCDM_Document.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_PCDM_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Poly_Triangulation: declare class NCollection_Sequence_handle_Poly_Triangulation extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Poly_Triangulation.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Poly_Triangulation);

  // NCollection_Sequence_handle_Poly_Triangulation.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Poly_Triangulation.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Poly_Triangulation.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Poly_Triangulation.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Poly_Triangulation): NCollection_Sequence_handle_Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Append (method)
  Append(theItem: Poly_Triangulation): void;
  Append(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Prepend (method)
  Prepend(theItem: Poly_Triangulation): void;
  Prepend(theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Poly_Triangulation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;
  InsertAfter(theIndex: number, theItem: Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.First (method)
  First(): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.ChangeFirst (method)
  ChangeFirst(): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.Last (method)
  Last(): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.ChangeLast (method)
  ChangeLast(): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.Value (method)
  Value(theIndex: number): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.ChangeValue (method)
  ChangeValue(theIndex: number): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.SetValue (method)
  SetValue(theIndex: number, theItem: Poly_Triangulation): void;

  // NCollection_Sequence_handle_Poly_Triangulation.At (method)
  At(theIndex: number): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.ChangeAt (method)
  ChangeAt(theIndex: number): Poly_Triangulation;

  // NCollection_Sequence_handle_Poly_Triangulation.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Poly_Triangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_STEPSelections_AssemblyLink: declare class NCollection_Sequence_handle_STEPSelections_AssemblyLink extends NCollection_BaseSequence

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_STEPSelections_AssemblyLink);

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_STEPSelections_AssemblyLink): NCollection_Sequence_handle_STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Append (method)
  Append(theItem: STEPSelections_AssemblyLink): void;
  Append(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Prepend (method)
  Prepend(theItem: STEPSelections_AssemblyLink): void;
  Prepend(theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: STEPSelections_AssemblyLink): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;
  InsertAfter(theIndex: number, theItem: STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.First (method)
  First(): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.ChangeFirst (method)
  ChangeFirst(): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Last (method)
  Last(): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.ChangeLast (method)
  ChangeLast(): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.Value (method)
  Value(theIndex: number): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.ChangeValue (method)
  ChangeValue(theIndex: number): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.SetValue (method)
  SetValue(theIndex: number, theItem: STEPSelections_AssemblyLink): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.At (method)
  At(theIndex: number): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.ChangeAt (method)
  ChangeAt(theIndex: number): STEPSelections_AssemblyLink;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_STEPSelections_AssemblyLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData: declare class NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData extends NCollection_BaseSequence

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData);

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Append (method)
  Append(theItem: ShapeAnalysis_FreeBoundData): void;
  Append(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Prepend (method)
  Prepend(theItem: ShapeAnalysis_FreeBoundData): void;
  Prepend(theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;
  InsertAfter(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.First (method)
  First(): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.ChangeFirst (method)
  ChangeFirst(): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Last (method)
  Last(): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.ChangeLast (method)
  ChangeLast(): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.Value (method)
  Value(theIndex: number): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.ChangeValue (method)
  ChangeValue(theIndex: number): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.SetValue (method)
  SetValue(theIndex: number, theItem: ShapeAnalysis_FreeBoundData): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.At (method)
  At(theIndex: number): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.ChangeAt (method)
  ChangeAt(theIndex: number): ShapeAnalysis_FreeBoundData;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Standard_Transient: declare class NCollection_Sequence_handle_Standard_Transient extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Standard_Transient.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Standard_Transient);

  // NCollection_Sequence_handle_Standard_Transient.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Standard_Transient.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Standard_Transient.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Standard_Transient.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Standard_Transient.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Standard_Transient.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Standard_Transient.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Standard_Transient): NCollection_Sequence_handle_Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Standard_Transient.Append (method)
  Append(theItem: Standard_Transient): void;
  Append(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.Prepend (method)
  Prepend(theItem: Standard_Transient): void;
  Prepend(theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Standard_Transient): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;
  InsertAfter(theIndex: number, theItem: Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.First (method)
  First(): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.ChangeFirst (method)
  ChangeFirst(): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.Last (method)
  Last(): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.ChangeLast (method)
  ChangeLast(): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.Value (method)
  Value(theIndex: number): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.ChangeValue (method)
  ChangeValue(theIndex: number): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.SetValue (method)
  SetValue(theIndex: number, theItem: Standard_Transient): void;

  // NCollection_Sequence_handle_Standard_Transient.At (method)
  At(theIndex: number): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.ChangeAt (method)
  ChangeAt(theIndex: number): Standard_Transient;

  // NCollection_Sequence_handle_Standard_Transient.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition: declare class NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition extends NCollection_BaseSequence

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition);

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Append (method)
  Append(theItem: StepElement_CurveElementSectionDefinition): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Prepend (method)
  Prepend(theItem: StepElement_CurveElementSectionDefinition): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;
  InsertAfter(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.First (method)
  First(): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.ChangeFirst (method)
  ChangeFirst(): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Last (method)
  Last(): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.ChangeLast (method)
  ChangeLast(): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.Value (method)
  Value(theIndex: number): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.ChangeValue (method)
  ChangeValue(theIndex: number): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.SetValue (method)
  SetValue(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.At (method)
  At(theIndex: number): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.ChangeAt (method)
  ChangeAt(theIndex: number): StepElement_CurveElementSectionDefinition;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepElement_ElementMaterial: declare class NCollection_Sequence_handle_StepElement_ElementMaterial extends NCollection_BaseSequence

  // NCollection_Sequence_handle_StepElement_ElementMaterial.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_StepElement_ElementMaterial);

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_StepElement_ElementMaterial): NCollection_Sequence_handle_StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Append (method)
  Append(theItem: StepElement_ElementMaterial): void;
  Append(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Prepend (method)
  Prepend(theItem: StepElement_ElementMaterial): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: StepElement_ElementMaterial): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;
  InsertAfter(theIndex: number, theItem: StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.First (method)
  First(): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.ChangeFirst (method)
  ChangeFirst(): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Last (method)
  Last(): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.ChangeLast (method)
  ChangeLast(): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.Value (method)
  Value(theIndex: number): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.ChangeValue (method)
  ChangeValue(theIndex: number): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.SetValue (method)
  SetValue(theIndex: number, theItem: StepElement_ElementMaterial): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.At (method)
  At(theIndex: number): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.ChangeAt (method)
  ChangeAt(theIndex: number): StepElement_ElementMaterial;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_StepElement_ElementMaterial.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship: declare class NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship extends NCollection_BaseSequence

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship);

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Append (method)
  Append(theItem: StepFEA_ElementGeometricRelationship): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Prepend (method)
  Prepend(theItem: StepFEA_ElementGeometricRelationship): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.First (method)
  First(): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.ChangeFirst (method)
  ChangeFirst(): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Last (method)
  Last(): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.ChangeLast (method)
  ChangeLast(): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.Value (method)
  Value(theIndex: number): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.ChangeValue (method)
  ChangeValue(theIndex: number): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.SetValue (method)
  SetValue(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.At (method)
  At(theIndex: number): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.ChangeAt (method)
  ChangeAt(theIndex: number): StepFEA_ElementGeometricRelationship;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_StepFEA_ElementRepresentation: declare class NCollection_Sequence_handle_StepFEA_ElementRepresentation extends NCollection_BaseSequence

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_StepFEA_ElementRepresentation);

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementRepresentation): NCollection_Sequence_handle_StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Append (method)
  Append(theItem: StepFEA_ElementRepresentation): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Prepend (method)
  Prepend(theItem: StepFEA_ElementRepresentation): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.First (method)
  First(): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.ChangeFirst (method)
  ChangeFirst(): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Last (method)
  Last(): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.ChangeLast (method)
  ChangeLast(): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.Value (method)
  Value(theIndex: number): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.ChangeValue (method)
  ChangeValue(theIndex: number): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.SetValue (method)
  SetValue(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.At (method)
  At(theIndex: number): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.ChangeAt (method)
  ChangeAt(theIndex: number): StepFEA_ElementRepresentation;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_StepFEA_ElementRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Storage_Root: declare class NCollection_Sequence_handle_Storage_Root extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Storage_Root.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Storage_Root);

  // NCollection_Sequence_handle_Storage_Root.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Storage_Root.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Storage_Root.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Storage_Root.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Storage_Root.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Storage_Root.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Storage_Root.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Storage_Root): NCollection_Sequence_handle_Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Storage_Root.Append (method)
  Append(theItem: Storage_Root): void;
  Append(theSeq: NCollection_Sequence_handle_Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.Prepend (method)
  Prepend(theItem: Storage_Root): void;
  Prepend(theSeq: NCollection_Sequence_handle_Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Storage_Root): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
  InsertAfter(theIndex: number, theItem: Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.First (method)
  First(): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.ChangeFirst (method)
  ChangeFirst(): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.Last (method)
  Last(): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.ChangeLast (method)
  ChangeLast(): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.Value (method)
  Value(theIndex: number): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.ChangeValue (method)
  ChangeValue(theIndex: number): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.SetValue (method)
  SetValue(theIndex: number, theItem: Storage_Root): void;

  // NCollection_Sequence_handle_Storage_Root.At (method)
  At(theIndex: number): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.ChangeAt (method)
  ChangeAt(theIndex: number): Storage_Root;

  // NCollection_Sequence_handle_Storage_Root.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Storage_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_TCollection_HAsciiString: declare class NCollection_Sequence_handle_TCollection_HAsciiString extends NCollection_BaseSequence

  // NCollection_Sequence_handle_TCollection_HAsciiString.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_TCollection_HAsciiString);

  // NCollection_Sequence_handle_TCollection_HAsciiString.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_TCollection_HAsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_TCollection_HAsciiString): NCollection_Sequence_handle_TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Append (method)
  Append(theItem: TCollection_HAsciiString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Prepend (method)
  Prepend(theItem: TCollection_HAsciiString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TCollection_HAsciiString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.First (method)
  First(): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.ChangeFirst (method)
  ChangeFirst(): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Last (method)
  Last(): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.ChangeLast (method)
  ChangeLast(): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.Value (method)
  Value(theIndex: number): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.ChangeValue (method)
  ChangeValue(theIndex: number): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.SetValue (method)
  SetValue(theIndex: number, theItem: TCollection_HAsciiString): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.At (method)
  At(theIndex: number): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.ChangeAt (method)
  ChangeAt(theIndex: number): TCollection_HAsciiString;

  // NCollection_Sequence_handle_TCollection_HAsciiString.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_TCollection_HAsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_TCollection_HExtendedString: declare class NCollection_Sequence_handle_TCollection_HExtendedString extends NCollection_BaseSequence

  // NCollection_Sequence_handle_TCollection_HExtendedString.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_TCollection_HExtendedString);

  // NCollection_Sequence_handle_TCollection_HExtendedString.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_TCollection_HExtendedString.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_TCollection_HExtendedString): NCollection_Sequence_handle_TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Append (method)
  Append(theItem: TCollection_HExtendedString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Prepend (method)
  Prepend(theItem: TCollection_HExtendedString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TCollection_HExtendedString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.First (method)
  First(): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.ChangeFirst (method)
  ChangeFirst(): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Last (method)
  Last(): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.ChangeLast (method)
  ChangeLast(): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.Value (method)
  Value(theIndex: number): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.ChangeValue (method)
  ChangeValue(theIndex: number): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.SetValue (method)
  SetValue(theIndex: number, theItem: TCollection_HExtendedString): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.At (method)
  At(theIndex: number): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.ChangeAt (method)
  ChangeAt(theIndex: number): TCollection_HExtendedString;

  // NCollection_Sequence_handle_TCollection_HExtendedString.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_TCollection_HExtendedString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
