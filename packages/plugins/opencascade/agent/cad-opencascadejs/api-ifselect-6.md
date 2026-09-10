# libcascade — IFSelect (6)

1 top-level symbols. Signatures are verbatim typescript.

// This class can be used to simply manage a process such as splitting a file, extracting a set of Entities ..
IFSelect_WorkSession: declare class IFSelect_WorkSession extends Standard_Transient

constructor

// Changes the Error Handler status (by default, it is not set)
SetErrorHandle(toHandle: boolean): void;

// Returns the Error Handler status
ErrorHandle(): boolean;

// Returns the ShareOut defined at creation time
ShareOut(): IFSelect_ShareOut;

// Sets a new ShareOut
SetShareOut(shareout: IFSelect_ShareOut): void;

// Set value of mode responsible for presence of selections after loading If mode set to true that different selections will be accessible after loading else selections will be not accessible after loading( for economy memory in applications)
SetModeStat(theMode: boolean): void;

// Return value of mode defining of filling selection during loading
GetModeStat(): boolean;

// Sets a WorkLibrary, which will be used to Read and Write Files
SetLibrary(theLib: IFSelect_WorkLibrary): void;

// Returns the WorkLibrary
WorkLibrary(): IFSelect_WorkLibrary;

// Sets a Protocol, which will be used to determine Graphs, to Read and to Write Files
SetProtocol(protocol: Interface_Protocol): void;

// Returns the Protocol
Protocol(): Interface_Protocol;

// Sets a specific Signature to be the SignType, i.e
SetSignType(signtype: IFSelect_Signature): void;

// Returns the current SignType
SignType(): IFSelect_Signature;

// Returns True is a Model has been set
HasModel(): boolean;

// Sets a Model as input
SetModel(model: Interface_InterfaceModel, clearpointed?: boolean): void;

// Returns the Model of the Work Session (Null Handle if none) should be C++
Model(): Interface_InterfaceModel;

// Stores the filename used for read for setting the model It is cleared by SetModel and ClearData(1)
SetLoadedFile(theFileName: string): void;

// Returns the filename used to load current model empty if unknown
LoadedFile(): string;

// Reads a file with the WorkLibrary (sets Model and LoadedFile) Returns a integer status which can be
ReadFile(filename: string): IFSelect_ReturnStatus;

// Returns the count of Entities stored in the Model, or 0
NbStartingEntities(): number;

// Returns an Entity stored in the Model of the WorkSession (Null Handle is no Model or num out of range)
StartingEntity(num: number): Standard_Transient;

// Returns the Number of an Entity in the Model (0 if no Model set or <ent> not in the Model)
StartingNumber(ent: Standard_Transient): number;

// From a given label in Model, returns the corresponding number Starts from first entity by Default, may start after a given number
NumberFromLabel(val: string, afternum?: number): number;

// Returns the label for <ent>, as the Model does If <ent> is not in the Model or if no Model is loaded, a Null Handle is returned
EntityLabel(ent: Standard_Transient): TCollection_HAsciiString;

// Returns the Name of an Entity This Name is computed by the general service Name Returns a Null Handle if fails
EntityName(ent: Standard_Transient): TCollection_HAsciiString;

// Returns the Category Number determined for an entity it is computed by the class Category An unknown entity (number 0) gives a value -1
CategoryNumber(ent: Standard_Transient): number;

// Returns the Category Name determined for an entity it is computed by the class Category Remark
CategoryName(ent: Standard_Transient): string;

// Returns the Validity Name determined for an entity it is computed by the class SignValidity Remark
ValidityName(ent: Standard_Transient): string;

// Clears recorded data (not the items) according mode
ClearData(mode: number): void;

// Computes the Graph used for Selections, Displays ..
ComputeGraph(enforce?: boolean): boolean;

// Returns the list of entities shared by <ent> (can be empty) Returns a null Handle if <ent> is unknown
Shareds(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

// Returns the list of entities sharing <ent> (can be empty) Returns a null Handle if <ent> is unknown
Sharings(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

// Returns True if a Model is defined and really loaded (not empty), a Protocol is set and a Graph has been computed
IsLoaded(): boolean;

// Computes the CheckList for the Model currently loaded It can then be used for displays, queries ..
ComputeCheck(enforce?: boolean): boolean;

// Returns the Maximum Value for an Item Identifier
MaxIdent(): number;

// Returns an Item, given its Ident
Item(id: number): Standard_Transient;

// Returns the Ident attached to an Item in the WorkSession, or Zero if it is unknown
ItemIdent(item: Standard_Transient): number;

// Returns the Item which corresponds to a Variable, given its Name (whatever the type of this Item)
NamedItem(name: string): Standard_Transient;
NamedItem(name: TCollection_HAsciiString): Standard_Transient;
NamedItem(name: string): Standard_Transient;
NamedItem(name: TCollection_HAsciiString): Standard_Transient;

// Returns the Ident attached to a Name, 0 if name not recorded
NameIdent(name: string): number;

// Returns True if an Item of the WorkSession has an attached Name
HasName(item: Standard_Transient): boolean;

// Returns the Name attached to an Item as a Variable of this WorkSession
Name(item: Standard_Transient): TCollection_HAsciiString;

// Adds an Item and returns its attached Ident
AddItem(item: Standard_Transient, active?: boolean): number;

// Adds an Item with an attached Name
AddNamedItem(name: string, item: Standard_Transient, active?: boolean): number;

// Following the type of
SetActive(item: Standard_Transient, mode: boolean): boolean;

// Removes an Item from the Session, given its Name Returns True if Done, False else (Name not recorded) (Applies only on Item which are Named)
RemoveNamedItem(name: string): boolean;

// Removes a Name without removing the Item Returns True if Done, False else (Name not recorded)
RemoveName(name: string): boolean;

// Removes an Item given its Ident
RemoveItem(item: Standard_Transient): boolean;

// Clears all the recorded Items
ClearItems(): void;

// Returns a Label which illustrates the content of an Item, given its Ident
ItemLabel(id: number): TCollection_HAsciiString;

// Fills a Sequence with the List of Idents attached to the Items of which Type complies with (IsKind) <type> (alphabetic order) Remark
ItemIdents(type\_: Standard_Type): NCollection_HSequence_int;

// Fills a Sequence with the list of the Names attached to Items of which Type complies with (IsKind) <type> (alphabetic order) Remark
ItemNames(type\_: Standard_Type): NCollection_HSequence_handle_TCollection_HAsciiString;

// Fills a Sequence with the NAMES of the control items, of which the label matches <label> (contain it)
ItemNamesForLabel(label: string): NCollection_HSequence_handle_TCollection_HAsciiString;

// For query by Label with possible iterations Searches the Ident of which Item has a Label which matches a given one, the search starts from an initial Ident
NextIdentForLabel(label: string, id: number, mode?: number): number;

// Creates a parameter as being bound to a Static If the Static is Integer, this creates an IntParam bound to it by its name
NewParamFromStatic(statname: string, name?: string): Standard_Transient;

// Returns a TextParam, given its Ident in the Session Null result if <id> is not suitable for a TextParam (undefined, or defined for another kind of variable)
TextParam(id: number): TCollection_HAsciiString;

// Returns Text Value of a TextParam (a String) or an empty string if <it> is not in the WorkSession
TextValue(par: TCollection_HAsciiString): TCollection_AsciiString;

// Creates a new (empty) TextParam
NewTextParam(name?: string): TCollection_HAsciiString;

// Changes the Text Value of a TextParam (an HAsciiString) Returns True if Done, False if <it> is not in the WorkSession
SetTextValue(par: TCollection_HAsciiString, val: string): boolean;

// Returns a Signature, given its Ident in the Session Null result if <id> is not suitable for a Signature (undefined, or defined for another kind of variable)
Signature(id: number): IFSelect_Signature;

// Returns the Value computed by a Signature for an Entity Returns an empty string if the entity does not belong to the loaded model
SignValue(sign: IFSelect_Signature, ent: Standard_Transient): string;

// Returns a Selection, given its Ident in the Session Null result if <id> is not suitable for a Selection (undefined, or defined for another kind of variable)
Selection(id: number): IFSelect_Selection;

// Returns the result of a Selection, computed by EvalSelection (see above) under the form of a HSequence (hence, it can be used by a frontal-engine logic)
SelectionResult(sel: IFSelect_Selection): NCollection_HSequence_handle_Standard_Transient;

// Returns the result of a Selection, by forcing its input with a given list unless Null)
SelectionResultFromList(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

// Sets a Selection as input for an item, according its type
SetItemSelection(item: Standard_Transient, sel: IFSelect_Selection): boolean;

// Resets input Selection which was set by SetItemSelection Same conditions as for SetItemSelection Returns True if done, False if is not in the WorkSession
ResetItemSelection(item: Standard_Transient): boolean;

// Returns the Selection of a Dispatch or a GeneralModifier
ItemSelection(item: Standard_Transient): IFSelect_Selection;

// Returns a SignCounter from its ident in the Session Null result if <id> is not suitable for a SignCounter (undefined, or defined for another kind of variable)
SignCounter(id: number): IFSelect_SignCounter;

// Computes the content of a SignCounter when it is defined with a Selection, then returns True Returns False if the SignCounter is not defined with a Selection, or if its Selection Mode is inhibited <forced> to work around optimisations
ComputeCounter(counter: IFSelect_SignCounter, forced?: boolean): boolean;

// Computes the content of a SignCounter from an input list If Null, uses internal definition of the Counter
ComputeCounterFromList(counter: IFSelect_SignCounter, list: NCollection_HSequence_handle_Standard_Transient, clear?: boolean): boolean;

// Returns the ordered list of dispatches stored by the ShareOut
AppliedDispatches(): NCollection_HSequence_int;

// Clears the list of Dispatches recorded by the ShareOut if <only> disp is True, tha's all
ClearShareOut(onlydisp: boolean): void;

// Returns a Dispatch, given its Ident in the Session Null result if <id> is not suitable for a Dispatch (undefined, or defined for another kind of variable)
Dispatch(id: number): IFSelect_Dispatch;

// Returns the rank of a Dispatch in the ShareOut, or 0 if <disp> is not in the ShareOut or not in the WorkSession
DispatchRank(disp: IFSelect_Dispatch): number;

// Gives access to the complete ModelCopier
ModelCopier(): IFSelect_ModelCopier;

// Sets a new ModelCopier
SetModelCopier(copier: IFSelect_ModelCopier): void;

// Returns the count of Modifiers applied to final sending Model Modifiers if <formodel> is True, File Modifiers else (i.e
NbFinalModifiers(formodel: boolean): number;

// Fills a Sequence with a list of Idents, those attached to the Modifiers applied to final sending
FinalModifierIdents(formodel: boolean): NCollection_HSequence_int;

// Returns a Modifier, given its Ident in the Session Null result if <id> is not suitable for a Modifier (undefined, or defined for another kind of variable)
GeneralModifier(id: number): IFSelect_GeneralModifier;

// Returns a Model Modifier, given its Ident in the Session, i.e
ModelModifier(id: number): IFSelect_Modifier;

// Returns the Rank of a Modifier given its Ident
ModifierRank(item: IFSelect_GeneralModifier): number;

// Changes the Rank of a Modifier in the Session
ChangeModifierRank(formodel: boolean, before: number, after: number): boolean;

// Removes all the Modifiers active in the ModelCopier
ClearFinalModifiers(): void;

// Sets a GeneralModifier to be applied to an item
SetAppliedModifier(modif: IFSelect_GeneralModifier, item: Standard_Transient): boolean;

// Resets a GeneralModifier to be applied Returns True if done, False if <modif> was not applied
ResetAppliedModifier(modif: IFSelect_GeneralModifier): boolean;

// Returns the item on which a GeneralModifier is applied
UsesAppliedModifier(modif: IFSelect_GeneralModifier): Standard_Transient;

// Returns a Transformer, given its Ident in the Session Null result if <id> is not suitable for a Transformer (undefined, or defined for another kind of variable)
Transformer(id: number): IFSelect_Transformer;

// Runs a Transformer on starting Model, which can then be edited or replaced by a new one
RunTransformer(transf: IFSelect_Transformer): number;

// Runs a Modifier on Starting Model
RunModifier(modif: IFSelect_Modifier, copy: boolean): number;

// Acts as RunModifier, but the Modifier is applied on the list determined by a Selection, rather than on the whole Model If the selection is a null handle, the whole model is taken
RunModifierSelected(modif: IFSelect_Modifier, sel: IFSelect_Selection, copy: boolean): number;

// Creates and returns a TransformStandard, empty, with its Copy Option (True = Copy, False = On the Spot) and an optional name
NewTransformStandard(copy: boolean, name?: string): IFSelect_Transformer;

// Defines a new content from the former one If <keep> is True, it is given by entities selected by Selection <sel> (and all shared entities) Else, it is given by all the former content but entities selected by the Selection <sel> (and properly shared ones) Returns True if done
SetModelContent(sel: IFSelect_Selection, keep: boolean): boolean;

// Returns the defined File Prefix
FilePrefix(): TCollection_HAsciiString;

// Returns the defined Default File Root
DefaultFileRoot(): TCollection_HAsciiString;

// Returns the defined File Extension
FileExtension(): TCollection_HAsciiString;

// Returns the File Root defined for a Dispatch
FileRoot(disp: IFSelect_Dispatch): TCollection_HAsciiString;

// Defines a File Prefix
SetFilePrefix(name: string): void;

// Defines a Default File Root Name
SetDefaultFileRoot(name: string): boolean;

// Defines a File Extension
SetFileExtension(name: string): void;

// Defines a Root for a Dispatch If <name> is empty, clears Root Name This has as effect to inhibit the production of File by <disp> Returns False if <disp> is not in the WorkSession or if a root name is already defined for it
SetFileRoot(disp: IFSelect_Dispatch, name: string): boolean;

// Extracts File Root Name from a given complete file name (uses `OSD_Path`)
GiveFileRoot(file: string): string;

// Completes a file name as required, with Prefix and Extension (if defined
GiveFileComplete(file: string): string;

// Erases all stored data from the File Evaluation (i.e
ClearFile(): void;

// Performs and stores a File Evaluation
EvaluateFile(): void;

// Returns the count of produced Models
NbFiles(): number;

// Returns a Model, given its rank in the Evaluation List
FileModel(num: number): Interface_InterfaceModel;

// Returns the name of a file corresponding to a produced Model, given its rank in the Evaluation List
FileName(num: number): TCollection_AsciiString;

// Commands file sending to clear the list of already sent files, commands to record a new one if <record> is True This list is managed by the ModelCopier when SendSplit is called It allows a global exploitation of the set of sent files
BeginSentFiles(record: boolean): void;

// Returns the list of recorded sent files, or a Null Handle is recording has not been enabled
SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Performs creation of derived files from the input Model Takes its data (sub-models and names), from result EvaluateFile if active, else by dynamic Evaluation (not stored) After SendSplit, result of EvaluateFile is Cleared Fills LastRunCheckList
SendSplit(): boolean;

// Returns an Evaluation of the whole ShareOut definition
EvalSplit(): IFSelect_PacketList;

// Returns the greater count of different files in which any of the starting entities could be sent
MaxSendingCount(): number;

// Processes Remaining data (after having sent files), mode
SetRemaining(mode: IFSelect_RemainMode): boolean;

// Sends the starting Model into one file, without splitting, managing remaining data or anything else
SendAll(filename: string, computegraph?: boolean): IFSelect_ReturnStatus;

// Sends a part of the starting Model into one file, without splitting
SendSelected(filename: string, sel: IFSelect_Selection, computegraph?: boolean): IFSelect_ReturnStatus;

// Writes the current Interface Model globally to a File, and returns a write status which can be
WriteFile(filename: string): IFSelect_ReturnStatus;
WriteFile(filename: string, sel: IFSelect_Selection): IFSelect_ReturnStatus;
WriteFile(filename: string): IFSelect_ReturnStatus;
WriteFile(filename: string, sel: IFSelect_Selection): IFSelect_ReturnStatus;

// Returns the count of Input Selections known for a Selection, or 0 if <sel> not in the WorkSession
NbSources(sel: IFSelect_Selection): number;

// Returns the <num>th Input Selection of a Selection (see NbSources)
Source(sel: IFSelect_Selection, num?: number): IFSelect_Selection;

// Returns True if <sel> a Reversed SelectExtract, False else
IsReversedSelectExtract(sel: IFSelect_Selection): boolean;

// Toggles the Sense (Direct <-> Reversed) of a SelectExtract Returns True if Done, False if <sel> is not a SelectExtract or is not in the WorkSession
ToggleSelectExtract(sel: IFSelect_Selection): boolean;

// Sets an Input Selection (as <input>) to a SelectExtract or a SelectDeduct (as <sel>)
SetInputSelection(sel: IFSelect_Selection, input: IFSelect_Selection): boolean;

// Sets an Input Selection, Main if <formain> is True, Second else (as <sc>) to a SelectControl (as <sel>)
SetControl(sel: IFSelect_Selection, sc: IFSelect_Selection, formain?: boolean): boolean;

// Adds an input selection to a SelectCombine (Union or Inters.)
CombineAdd(selcomb: IFSelect_Selection, seladd: IFSelect_Selection, atnum?: number): number;

// Removes an input selection from a SelectCombine (Union or Intersection)
CombineRemove(selcomb: IFSelect_Selection, selrem: IFSelect_Selection): boolean;

// Creates a new Selection, of type SelectPointed, its content starts with A name must be given (can be empty)
NewSelectPointed(list: NCollection_HSequence_handle_Standard_Transient, name: string): IFSelect_Selection;

// Changes the content of a Selection of type SelectPointed According <mode>
SetSelectPointed(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient, mode: number): boolean;

// Returns a Selection from a Name
GiveSelection(selname: string): IFSelect_Selection;

// Determines a list of entities from an object
GiveList(obj: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
GiveList(obj: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;

// Computes a List of entities from the model as follows <first> being a Selection or a combination of Selections, <ent> being an entity or a list of entities (as a HSequenceOfTransient)
GiveListFromList(selname: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

// Combines two lists and returns the result, according to mode
GiveListCombined(l1: NCollection_HSequence_handle_Standard_Transient, l2: NCollection_HSequence_handle_Standard_Transient, mode: number): NCollection_HSequence_handle_Standard_Transient;

// Determines check status for an entity regarding last call to QueryCheckList
QueryCheckStatus(ent: Standard_Transient): number;

// Determines if <entdad> is parent of <entson> (in the graph), returns
QueryParent(entdad: Standard_Transient, entson: Standard_Transient): number;

// Sets a list of Parameters, i.e
SetParams(params: NCollection_DynamicArray_handle_Standard_Transient, uselist: NCollection_DynamicArray_int): void;

// Traces the Statics attached to a given use number If <use> is given positive (normal), the trace is embedded with a header and a trailer If <use> is negative, just values are printed (this allows to make compositions) Remark
TraceStatics(use: number, mode?: number): void;

// Dumps contents of the ShareOut (on "cout")
DumpShare(): void;

// Lists the Labels of all Items of the WorkSession If <label> is defined, lists labels which contain it
ListItems(label?: string): void;

// Lists the Modifiers of the session (for each one, displays its Label)
ListFinalModifiers(formodel: boolean): void;

// Lists a Selection and its Sources (see SelectionIterator), given its rank in the list
DumpSelection(sel: IFSelect_Selection): void;

// Dumps the current Model (as inherited DumpModel), on currently defined Default Trace File (default is standard output)
TraceDumpModel(mode: number): void;

// Dumps an entity from the current Model as inherited DumpEntity on currently defined Default Trace File (<level> interpreted according to the Norm, see WorkLibrary)
TraceDumpEntity(ent: Standard_Transient, level: number): void;

// Displays the list of Entities selected by a Selection (i.e
EvaluateSelection(sel: IFSelect_Selection): void;

// Displays the result of applying a Dispatch on the input Model (also shows Remainder if there is) <mode> = 0 (default), displays nothing else <mode> = 1
EvaluateDispatch(disp: IFSelect_Dispatch, mode?: number): void;

// Displays the effect of applying the ShareOut on the input Model
EvaluateComplete(mode?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
