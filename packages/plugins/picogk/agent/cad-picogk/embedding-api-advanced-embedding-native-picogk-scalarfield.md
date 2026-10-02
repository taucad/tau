# PicoGK — Advanced embedding/native — PicoGK.ScalarField

5 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
// Borrowed library owner
public readonly Library lib;

// Category: Advanced embedding/native
public static extern ScalarFieldHandle _hCreate(LibHandle hLib)

// Category: Advanced embedding/native
public static extern ScalarFieldHandle _hCreateCopy(LibHandle hLib, ScalarFieldHandle hSource)

// Category: Advanced embedding/native
public static extern ScalarFieldHandle _hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

// Category: Advanced embedding/native
public static extern ScalarFieldHandle _hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, float fScalarValue, float fSdThreshold)
