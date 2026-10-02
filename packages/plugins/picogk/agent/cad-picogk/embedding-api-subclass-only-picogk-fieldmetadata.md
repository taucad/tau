# PicoGK — Subclass-only — PicoGK.FieldMetadata

1 top-level symbols. Signatures are verbatim csharp.

// Category: Subclass-only
// This function tests whether you are attempting to set internal metadata fields from your code — this can mess up openvdb and internal PicoGK functionality
// Throws: System.FieldAccessException
protected void GuardInternalFields(string strFieldName)
//   strFieldName: Field name you are trying to set
