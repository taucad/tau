# libcascade — TDocStd (2)

3 top-level symbols. Signatures are verbatim typescript.

// This tool class is used to copy the content of source label under target label
TDocStd_XLinkTool: declare class TDocStd_XLinkTool

constructor

// Copies the content of the label <fromsource> to the label <intarget>
CopyWithLink(intarget: TDF_Label, fromsource: TDF_Label): void;

// Update the external reference set at <L>
UpdateLink(L: TDF_Label): void;

// Copy the content of <fromsource> under <intarget>
Copy(intarget: TDF_Label, fromsource: TDF_Label): void;

IsDone(): boolean;

DataSet(): TDF_DataSet;

RelocationTable(): TDF_RelocationTable;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDocStd_SequenceOfApplicationDelta: NCollection_Sequence_handle_TDocStd_ApplicationDelta

TDocStd_SequenceOfDocument: NCollection_Sequence_handle_TDocStd_Document
